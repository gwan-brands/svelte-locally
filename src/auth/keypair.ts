/**
 * Keypair Manager
 * 
 * Generates and stores Ed25519 keypairs for UCAN signing.
 * Keys are stored in IndexedDB for persistence.
 */

import * as ed from '@noble/ed25519';

// ed25519 in browser needs sha512 - use the built-in sync method
// The library handles this internally with the async API

// Environment detection for SSR
const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

const DB_NAME = 'automerge-auth';
const STORE_NAME = 'keypairs';
const KEY_ID = 'primary';

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  did: string;
}

/**
 * Convert public key to DID (Decentralized Identifier)
 * Format: did:key:z6Mk... (multibase + multicodec encoded)
 */
export function publicKeyToDid(publicKey: Uint8Array): string {
  // Ed25519 multicodec prefix: 0xed01
  const multicodec = new Uint8Array([0xed, 0x01, ...publicKey]);
  
  // Base58btc encode with 'z' prefix (multibase)
  const encoded = base58btc.encode(multicodec);
  return `did:key:${encoded}`;
}

/**
 * Extract public key from DID
 */
export function didToPublicKey(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Invalid DID format');
  }
  
  const encoded = did.slice(8); // Remove 'did:key:'
  const decoded = base58btc.decode(encoded);
  
  // Remove multicodec prefix (0xed01)
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Invalid multicodec prefix');
  }
  
  return decoded.slice(2);
}

// Base58btc encoding (Bitcoin alphabet)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const base58btc = {
  encode(bytes: Uint8Array): string {
    const digits = [0];
    for (const byte of bytes) {
      let carry = byte;
      for (let i = 0; i < digits.length; i++) {
        carry += digits[i] << 8;
        digits[i] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    // Leading zeros
    let output = '';
    for (const byte of bytes) {
      if (byte === 0) output += ALPHABET[0];
      else break;
    }
    // Convert digits to string (reverse order)
    for (let i = digits.length - 1; i >= 0; i--) {
      output += ALPHABET[digits[i]];
    }
    return 'z' + output; // multibase prefix
  },
  
  decode(str: string): Uint8Array {
    if (str[0] === 'z') str = str.slice(1); // Remove multibase prefix
    
    const bytes = [0];
    for (const char of str) {
      const value = ALPHABET.indexOf(char);
      if (value === -1) throw new Error('Invalid base58 character');
      
      let carry = value;
      for (let i = 0; i < bytes.length; i++) {
        carry += bytes[i] * 58;
        bytes[i] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    // Leading zeros
    for (const char of str) {
      if (char === ALPHABET[0]) bytes.push(0);
      else break;
    }
    return new Uint8Array(bytes.reverse());
  }
};

/**
 * Generate a new Ed25519 keypair
 */
export async function generateKeypair(): Promise<Keypair> {
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  const did = publicKeyToDid(publicKey);
  
  return { publicKey, privateKey, did };
}

/**
 * Sign data with private key
 */
export async function sign(privateKey: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  return await ed.signAsync(data, privateKey);
}

/**
 * Verify signature
 */
export async function verify(publicKey: Uint8Array, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
  return await ed.verifyAsync(signature, data, publicKey);
}

// ===== IndexedDB Storage =====

function openDB(): Promise<IDBDatabase> {
  if (!isBrowser) {
    return Promise.reject(new Error('IndexedDB not available (SSR)'));
  }
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Store keypair in IndexedDB
 */
export async function storeKeypair(keypair: Keypair): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Store as serializable object
    const data = {
      publicKey: Array.from(keypair.publicKey),
      privateKey: Array.from(keypair.privateKey),
      did: keypair.did
    };
    
    const request = store.put(data, KEY_ID);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Load keypair from IndexedDB
 */
export async function loadKeypair(): Promise<Keypair | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.get(KEY_ID);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const data = request.result;
      if (!data) {
        resolve(null);
        return;
      }
      
      resolve({
        publicKey: new Uint8Array(data.publicKey),
        privateKey: new Uint8Array(data.privateKey),
        did: data.did
      });
    };
  });
}

/**
 * Get or create keypair
 */
export async function getOrCreateKeypair(): Promise<Keypair> {
  let keypair = await loadKeypair();
  
  if (!keypair) {
    keypair = await generateKeypair();
    await storeKeypair(keypair);
  }
  
  return keypair;
}

/**
 * Clear stored keypair (for testing/reset)
 */
export async function clearKeypair(): Promise<void> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.delete(KEY_ID);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
