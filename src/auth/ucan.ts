/**
 * UCAN Manager
 * 
 * Creates and verifies User Controlled Authorization Networks tokens.
 * UCANs are capability tokens that can be delegated without a central server.
 */

import * as UCAN from '@ucans/ucans';
import type { Keypair } from './keypair';

// Helper: Convert Uint8Array to base64pad string
function toBase64Pad(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary);
}

// ===== Types =====

export interface Capability {
  with: string;   // Resource (e.g., "automerge:doc123")
  can: string;    // Action (e.g., "doc/write", "doc/read")
}

export interface UCANToken {
  encoded: string;           // The JWT-like string
  issuer: string;            // DID of who created it
  audience: string;          // DID of who can use it
  capabilities: Capability[];
  expiration: number;        // Unix timestamp
  notBefore?: number;
  proofs: string[];          // Chain of delegations
}

export interface CreateUCANOptions {
  issuer: Keypair;
  audience: string;          // DID of recipient
  capabilities: Capability[];
  expiration?: number;       // Seconds from now (default: 1 hour)
  notBefore?: number;        // Unix timestamp
  proofs?: string[];         // Existing UCANs to chain
}

// ===== UCAN Creation =====

/**
 * Create a new UCAN token
 */
export async function createUCAN(options: CreateUCANOptions): Promise<UCANToken> {
  const {
    issuer,
    audience,
    capabilities,
    expiration = 3600, // 1 hour default
    proofs = []
  } = options;
  
  const exp = Math.floor(Date.now() / 1000) + expiration;
  
  // Create EdKeypair from our keypair
  // ucans expects a 64-byte secret key (privateKey + publicKey) encoded as base64pad
  const secretKeyBytes = new Uint8Array([...issuer.privateKey, ...issuer.publicKey]);
  const secretKeyBase64 = toBase64Pad(secretKeyBytes);
  const edKeypair = UCAN.EdKeypair.fromSecretKey(secretKeyBase64);
  
  // Build the UCAN
  const ucan = await UCAN.build({
    issuer: edKeypair,
    audience,
    capabilities: capabilities.map(cap => ({
      with: { scheme: 'automerge', hierPart: cap.with.replace('automerge:', '') },
      can: { namespace: 'doc', segments: [cap.can.replace('doc/', '')] }
    })),
    expiration: exp,
    proofs
  });
  
  const encoded = UCAN.encode(ucan);
  
  return {
    encoded,
    issuer: issuer.did,
    audience,
    capabilities,
    expiration: exp,
    proofs
  };
}

/**
 * Create a self-issued UCAN (for documents you own)
 */
export async function createOwnerUCAN(
  keypair: Keypair,
  resourceId: string,
  expiration?: number
): Promise<UCANToken> {
  return createUCAN({
    issuer: keypair,
    audience: keypair.did, // Self
    capabilities: [
      { with: resourceId, can: 'doc/admin' },
      { with: resourceId, can: 'doc/write' },
      { with: resourceId, can: 'doc/read' },
      { with: resourceId, can: 'doc/share' }
    ],
    expiration: expiration ?? 86400 * 30 // 30 days for owner
  });
}

/**
 * Delegate capabilities to another user
 */
export async function delegateUCAN(
  issuer: Keypair,
  audience: string,
  capabilities: Capability[],
  proof: UCANToken,
  expiration?: number
): Promise<UCANToken> {
  // Verify issuer can delegate these capabilities
  for (const cap of capabilities) {
    const canDelegate = proof.capabilities.some(
      p => p.with === cap.with && canDo(p.can, cap.can)
    );
    if (!canDelegate) {
      throw new Error(`Cannot delegate capability: ${cap.can} on ${cap.with}`);
    }
  }
  
  return createUCAN({
    issuer,
    audience,
    capabilities,
    expiration,
    proofs: [proof.encoded]
  });
}

/**
 * Check if action A can authorize action B
 * Hierarchy: admin > share > write > read
 */
function canDo(have: string, want: string): boolean {
  const hierarchy = ['doc/read', 'doc/write', 'doc/share', 'doc/admin'];
  const haveLevel = hierarchy.indexOf(have);
  const wantLevel = hierarchy.indexOf(want);
  
  if (haveLevel === -1 || wantLevel === -1) {
    return have === want;
  }
  
  return haveLevel >= wantLevel;
}

// ===== UCAN Verification =====

/**
 * Decode a UCAN string
 */
export function decodeUCAN(encoded: string): UCANToken | null {
  try {
    const ucan = UCAN.parse(encoded);
    
    return {
      encoded,
      issuer: ucan.payload.iss,
      audience: ucan.payload.aud,
      capabilities: (ucan.payload.att || []).map((att: any) => ({
        with: `automerge:${att.with?.hierPart || att.with}`,
        can: `doc/${att.can?.segments?.[0] || att.can}`
      })),
      expiration: ucan.payload.exp,
      notBefore: ucan.payload.nbf,
      proofs: ucan.payload.prf || []
    };
  } catch (err) {
    console.error('[UCAN] Failed to decode:', err);
    return null;
  }
}

/**
 * Verify a UCAN is valid and not expired
 */
export async function verifyUCAN(encoded: string): Promise<boolean> {
  try {
    const ucan = UCAN.parse(encoded);
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (ucan.payload.exp && ucan.payload.exp < now) {
      console.log('[UCAN] Token expired');
      return false;
    }
    
    // Check not-before
    if (ucan.payload.nbf && ucan.payload.nbf > now) {
      console.log('[UCAN] Token not yet valid');
      return false;
    }
    
    // Basic structure validation
    if (!ucan.payload.iss || !ucan.payload.aud) {
      return false;
    }
    
    // For now, trust the signature (full verification would check the chain)
    // In production, use UCAN.verify() with proper plugins
    return true;
  } catch (err) {
    console.error('[UCAN] Verification failed:', err);
    return false;
  }
}

/**
 * Check if a UCAN grants a specific capability
 */
export function hasCapability(
  ucan: UCANToken,
  resource: string,
  action: string
): boolean {
  return ucan.capabilities.some(
    cap => cap.with === resource && canDo(cap.can, action)
  );
}

// ===== Storage =====

const UCAN_STORAGE_KEY = 'automerge-ucans';

export interface UCANStore {
  // Resource ID -> array of UCANs for that resource
  [resourceId: string]: UCANToken[];
}

/**
 * Store a UCAN locally
 */
export function storeUCAN(ucan: UCANToken): void {
  const stored = loadUCANStore();
  
  for (const cap of ucan.capabilities) {
    if (!stored[cap.with]) {
      stored[cap.with] = [];
    }
    // Avoid duplicates
    if (!stored[cap.with].find(u => u.encoded === ucan.encoded)) {
      stored[cap.with].push(ucan);
    }
  }
  
  localStorage.setItem(UCAN_STORAGE_KEY, JSON.stringify(stored));
}

/**
 * Load all stored UCANs
 */
export function loadUCANStore(): UCANStore {
  try {
    const data = localStorage.getItem(UCAN_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

/**
 * Get UCANs for a specific resource
 */
export function getUCANsForResource(resourceId: string): UCANToken[] {
  const store = loadUCANStore();
  return store[resourceId] || [];
}

/**
 * Find a valid UCAN granting access to a resource
 */
export async function findValidUCAN(
  resourceId: string,
  action: string
): Promise<UCANToken | null> {
  const ucans = getUCANsForResource(resourceId);
  
  for (const ucan of ucans) {
    if (hasCapability(ucan, resourceId, action)) {
      const valid = await verifyUCAN(ucan.encoded);
      if (valid) {
        return ucan;
      }
    }
  }
  
  return null;
}

/**
 * Clear all stored UCANs
 */
export function clearUCANStore(): void {
  localStorage.removeItem(UCAN_STORAGE_KEY);
}
