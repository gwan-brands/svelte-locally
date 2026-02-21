import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateKeypair,
  publicKeyToDid,
  didToPublicKey,
  sign,
  verify,
} from '../src/auth/keypair';

describe('keypair', () => {
  describe('generateKeypair', () => {
    it('should generate a valid keypair', async () => {
      const keypair = await generateKeypair();
      
      expect(keypair).toHaveProperty('publicKey');
      expect(keypair).toHaveProperty('privateKey');
      expect(keypair).toHaveProperty('did');
      
      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keypair.publicKey.length).toBe(32);
      expect(keypair.privateKey.length).toBe(32);
    });

    it('should generate unique keypairs', async () => {
      const keypair1 = await generateKeypair();
      const keypair2 = await generateKeypair();
      
      expect(keypair1.did).not.toBe(keypair2.did);
    });
  });

  describe('publicKeyToDid', () => {
    it('should convert public key to did:key format', async () => {
      const keypair = await generateKeypair();
      const did = publicKeyToDid(keypair.publicKey);
      
      expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    });

    it('should produce consistent DID for same public key', async () => {
      const keypair = await generateKeypair();
      const did1 = publicKeyToDid(keypair.publicKey);
      const did2 = publicKeyToDid(keypair.publicKey);
      
      expect(did1).toBe(did2);
    });
  });

  describe('didToPublicKey', () => {
    it('should round-trip public key through DID', async () => {
      const keypair = await generateKeypair();
      const did = publicKeyToDid(keypair.publicKey);
      const recovered = didToPublicKey(did);
      
      expect(recovered).toEqual(keypair.publicKey);
    });

    it('should throw on invalid DID format', () => {
      expect(() => didToPublicKey('invalid')).toThrow('Invalid DID format');
      expect(() => didToPublicKey('did:web:example.com')).toThrow('Invalid DID format');
    });
  });

  describe('sign and verify', () => {
    it('should sign and verify a message', async () => {
      const keypair = await generateKeypair();
      const message = new TextEncoder().encode('Hello, World!');
      
      const signature = await sign(keypair.privateKey, message);
      const isValid = await verify(keypair.publicKey, signature, message);
      
      expect(isValid).toBe(true);
    });

    it('should reject tampered message', async () => {
      const keypair = await generateKeypair();
      const message = new TextEncoder().encode('Hello, World!');
      const tamperedMessage = new TextEncoder().encode('Hello, World?');
      
      const signature = await sign(keypair.privateKey, message);
      const isValid = await verify(keypair.publicKey, signature, tamperedMessage);
      
      expect(isValid).toBe(false);
    });

    it('should reject wrong public key', async () => {
      const keypair1 = await generateKeypair();
      const keypair2 = await generateKeypair();
      const message = new TextEncoder().encode('Hello, World!');
      
      const signature = await sign(keypair1.privateKey, message);
      const isValid = await verify(keypair2.publicKey, signature, message);
      
      expect(isValid).toBe(false);
    });
  });
});
