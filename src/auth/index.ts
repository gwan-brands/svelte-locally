/**
 * Auth Module - Role-based access control with UCAN
 *
 * Usage:
 *   const me = await identity();
 *   me.id // your public identity (DID)
 *   
 *   // Create access token for someone
 *   const token = await me.createToken(docUrl, 'writer', { expires: '7d' });
 *   
 *   // Import token someone sent you
 *   await me.importAccess(tokenString);
 */

export * from './keypair';
export * from './ucan';
export * from './roles';
export * from './grants';

import { getOrCreateKeypair, clearKeypair, type Keypair } from './keypair';
import {
  createOwnerUCAN,
  delegateUCAN,
  findValidUCAN,
  storeUCAN,
  clearUCANStore,
  hasCapability,
  decodeUCAN,
  createUCAN,
  type UCANToken,
  type Capability
} from './ucan';
import { type Role, getCapabilitiesForRole, roleCanDelegate, ROLES } from './roles';
import {
  storeIssuedGrant,
  storeReceivedGrant,
  getIssuedGrants,
  getReceivedGrants,
  getGrantsForDoc,
  getReceivedGrantForDoc,
  revokeGrant as revokeGrantStorage,
  generateGrantId,
  clearAllGrants,
  type Grant,
  type ReceivedGrant
} from './grants';

// ============ Types ============

export interface Auth {
  /** User's keypair */
  keypair: Keypair;
  /** User's DID (decentralized identifier) */
  id: string;
  /** Alias for id */
  did: string;

  /**
   * Check if we have a capability for a resource
   */
  can: (action: string, resourceId: string) => Promise<boolean>;

  /**
   * Get our UCAN for a resource
   */
  getToken: (resourceId: string) => Promise<UCANToken | null>;

  /**
   * Create owner token for a new document
   * Called internally when creating new docs
   */
  createDocToken: (resourceId: string) => Promise<UCANToken>;

  /**
   * Claim ownership of a document (creates owner token if none exists).
   * Use this for documents created before v0.2.0.
   */
  claimOwnership: (docUrl: string) => Promise<void>;

  /**
   * Create an access token for someone else
   * @param docUrl - Document URL
   * @param role - Access role (reader, writer, admin)
   * @param options - Token options
   * @returns Encoded token string to share
   */
  createToken: (
    docUrl: string,
    role: Role,
    options?: CreateTokenOptions
  ) => Promise<string>;

  /**
   * Grant access to a specific DID
   * @param docUrl - Document URL  
   * @param recipientDid - Recipient's DID
   * @param role - Access role
   * @param options - Grant options
   * @returns The grant object
   */
  grant: (
    docUrl: string,
    recipientDid: string,
    role: Role,
    options?: GrantOptions
  ) => Promise<Grant>;

  /**
   * Revoke access from a DID
   */
  revokeGrant: (docUrl: string, recipientDid: string) => boolean;

  /**
   * Get all grants we've issued for a document
   */
  getGrantsFor: (docUrl: string) => Grant[];

  /**
   * Import an access token someone sent us
   * @param token - Encoded token string
   * @returns The parsed token or null if invalid
   */
  importAccess: (token: string) => ReceivedGrant | null;

  /**
   * Get all access we've received
   */
  accessTokens: ReceivedGrant[];

  /**
   * Get our access for a specific document
   */
  getAccessFor: (docUrl: string) => ReceivedGrant | null;

  /**
   * Public identity info (shareable)
   */
  publicId: string;

  /**
   * Reset everything (clear keys and tokens)
   */
  reset: () => Promise<void>;

  // Legacy compatibility
  share: (
    resourceId: string,
    recipientDid: string,
    permission: 'read' | 'write' | 'admin'
  ) => Promise<UCANToken>;
  importToken: (encoded: string) => UCANToken | null;
}

export interface CreateTokenOptions {
  /** Expiry time: number (seconds), string ('7d', '1h'), or Date */
  expires?: number | string | Date;
  /** Maximum uses (not enforced locally, for documentation) */
  maxUses?: number;
}

export interface GrantOptions extends CreateTokenOptions {
  /** Note about why access was granted */
  note?: string;
}

// ============ Environment Detection ============

const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

// ============ Helper Functions ============

/**
 * Parse expiry to seconds from now
 */
function parseExpiry(expires?: number | string | Date): number {
  if (!expires) {
    return 86400 * 7; // Default: 7 days
  }
  
  if (typeof expires === 'number') {
    return expires;
  }
  
  if (expires instanceof Date) {
    return Math.floor((expires.getTime() - Date.now()) / 1000);
  }
  
  // Parse string like '7d', '1h', '30m'
  const match = expires.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) {
    throw new Error(`Invalid expiry format: ${expires}`);
  }
  
  const [, num, unit] = match;
  const value = parseInt(num, 10);
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    case 'w': return value * 604800;
    default: return 86400 * 7;
  }
}

/**
 * Map role to UCAN capabilities
 */
function roleToCapabilities(docUrl: string, role: Role): Capability[] {
  const caps = getCapabilitiesForRole(role);
  return caps.map(action => ({
    with: docUrl,
    can: `doc/${action}`
  }));
}

// ============ Main Auth Implementation ============

/**
 * Initialize auth system
 * 
 * @throws Error if called during SSR
 */
export async function initAuth(): Promise<Auth> {
  if (!isBrowser) {
    throw new Error('[svelte-locally] Auth cannot be initialized during SSR. Use createAuthState() in a client-side effect.');
  }
  
  const keypair = await getOrCreateKeypair();

  const auth: Auth = {
    keypair,
    id: keypair.did,
    did: keypair.did,
    publicId: keypair.did,

    async can(action: string, resourceId: string): Promise<boolean> {
      const ucan = await findValidUCAN(resourceId, action);
      return ucan !== null;
    },

    async getToken(resourceId: string): Promise<UCANToken | null> {
      return findValidUCAN(resourceId, 'doc/read');
    },

    async createDocToken(resourceId: string): Promise<UCANToken> {
      const ucan = await createOwnerUCAN(keypair, resourceId);
      storeUCAN(ucan);
      return ucan;
    },

    /**
     * Claim ownership of a document (creates owner token if none exists).
     * Use this for documents created before v0.2.0.
     */
    async claimOwnership(docUrl: string): Promise<void> {
      const existingProof = await findValidUCAN(docUrl, 'doc/admin');
      if (existingProof) return; // Already have ownership
      
      // Create owner token (self-issued)
      const ucan = await createOwnerUCAN(keypair, docUrl);
      storeUCAN(ucan);
    },

    async createToken(
      docUrl: string,
      role: Role,
      options?: CreateTokenOptions
    ): Promise<string> {
      // Check we have permission to create tokens
      let proof = await findValidUCAN(docUrl, 'doc/delegate');
      if (!proof) {
        // Check if we're the owner (have admin)
        proof = await findValidUCAN(docUrl, 'doc/admin');
        if (!proof) {
          throw new Error('No permission to create access tokens for this document');
        }
      }
      
      const expirySeconds = parseExpiry(options?.expires);
      const capabilities = roleToCapabilities(docUrl, role);
      
      // For bearer tokens, address to issuer (self)
      // Recipients verify the chain is valid, not that they're the audience
      const ucan = await createUCAN({
        issuer: keypair,
        audience: keypair.did, // Self-addressed bearer token
        capabilities,
        expiration: expirySeconds,
        proofs: [proof.encoded]
      });
      
      return ucan.encoded;
    },

    async grant(
      docUrl: string,
      recipientDid: string,
      role: Role,
      options?: GrantOptions
    ): Promise<Grant> {
      // Check we have permission to delegate
      const proof = await findValidUCAN(docUrl, 'doc/delegate');
      if (!proof) {
        const adminProof = await findValidUCAN(docUrl, 'doc/admin');
        if (!adminProof) {
          throw new Error('No permission to grant access to this document');
        }
      }
      
      const expirySeconds = parseExpiry(options?.expires);
      const capabilities = roleToCapabilities(docUrl, role);
      
      const ucan = await createUCAN({
        issuer: keypair,
        audience: recipientDid,
        capabilities,
        expiration: expirySeconds,
        proofs: proof ? [proof.encoded] : []
      });
      
      const grant: Grant = {
        id: generateGrantId(),
        docUrl,
        recipientDid,
        role,
        grantedAt: Date.now(),
        expiresAt: options?.expires ? Date.now() + expirySeconds * 1000 : null,
        grantedBy: keypair.did,
        token: ucan.encoded,
        revoked: false
      };
      
      storeIssuedGrant(grant);
      
      return grant;
    },

    revokeGrant(docUrl: string, recipientDid: string): boolean {
      return revokeGrantStorage(docUrl, recipientDid);
    },

    getGrantsFor(docUrl: string): Grant[] {
      return getGrantsForDoc(docUrl);
    },

    importAccess(token: string): ReceivedGrant | null {
      const ucan = decodeUCAN(token);
      if (!ucan) {
        console.warn('[Auth] Failed to decode token');
        return null;
      }
      
      // Check if token is for us, open audience, or a bearer token (self-addressed)
      const isForUs = ucan.audience === keypair.did;
      const isOpenAudience = ucan.audience === '*';
      const isBearerToken = ucan.audience === ucan.issuer; // Self-addressed = bearer
      
      if (!isForUs && !isOpenAudience && !isBearerToken) {
        console.warn('[Auth] Token not addressed to us and not a bearer token');
        return null;
      }
      
      // Check expiry
      const now = Math.floor(Date.now() / 1000);
      if (ucan.expiration && ucan.expiration < now) {
        console.warn('[Auth] Token expired');
        return null;
      }
      
      // Store the UCAN
      storeUCAN(ucan);
      
      // Determine role from capabilities
      let role: Role = 'reader';
      const hasWrite = ucan.capabilities.some(c => c.can.includes('write'));
      const hasDelegate = ucan.capabilities.some(c => c.can.includes('delegate') || c.can.includes('admin'));
      if (hasDelegate) role = 'admin';
      else if (hasWrite) role = 'writer';
      
      // Get doc URL from first capability
      const docUrl = ucan.capabilities[0]?.with ?? '';
      
      const receivedGrant: ReceivedGrant = {
        docUrl,
        role,
        fromDid: ucan.issuer,
        receivedAt: Date.now(),
        expiresAt: ucan.expiration ? ucan.expiration * 1000 : null,
        token
      };
      
      storeReceivedGrant(receivedGrant);
      
      return receivedGrant;
    },

    get accessTokens(): ReceivedGrant[] {
      return getReceivedGrants();
    },

    getAccessFor(docUrl: string): ReceivedGrant | null {
      return getReceivedGrantForDoc(docUrl);
    },

    async reset(): Promise<void> {
      await clearKeypair();
      clearUCANStore();
      clearAllGrants();
    },

    // Legacy compatibility
    async share(
      resourceId: string,
      recipientDid: string,
      permission: 'read' | 'write' | 'admin'
    ): Promise<UCANToken> {
      const proof = await findValidUCAN(resourceId, 'doc/share');
      if (!proof) {
        throw new Error('No permission to share this resource');
      }

      const capabilities: Capability[] = [
        { with: resourceId, can: `doc/${permission}` }
      ];
      if (permission === 'write' || permission === 'admin') {
        capabilities.push({ with: resourceId, can: 'doc/read' });
      }
      if (permission === 'admin') {
        capabilities.push({ with: resourceId, can: 'doc/share' });
      }

      return delegateUCAN(keypair, recipientDid, capabilities, proof, 3600 * 24 * 7);
    },

    importToken(encoded: string): UCANToken | null {
      const ucan = decodeUCAN(encoded);
      if (ucan && (ucan.audience === keypair.did || ucan.audience === '*')) {
        storeUCAN(ucan);
        return ucan;
      }
      console.warn('[Auth] UCAN not addressed to us');
      return null;
    }
  };

  return auth;
}

// ============ Simple Identity Function ============

/**
 * Get user identity (simpler API)
 * 
 * @example
 * const me = await identity();
 * console.log(me.id); // "did:key:z6Mk..."
 */
export async function identity(): Promise<Auth> {
  return initAuth();
}

// ============ Svelte-friendly Reactive State ============

/**
 * Svelte-friendly reactive auth state
 * 
 * Safe for SSR - will only initialize on client side.
 * 
 * @example
 * ```svelte
 * <script>
 *   import { createAuthState } from 'svelte-locally';
 *   
 *   const auth = createAuthState();
 *   
 *   $effect(() => {
 *     auth.init();
 *   });
 * </script>
 * 
 * {#if auth.loading}
 *   <p>Loading...</p>
 * {:else if auth.error}
 *   <p>Error: {auth.error}</p>
 * {:else}
 *   <p>Logged in as: {auth.id}</p>
 * {/if}
 * ```
 */
export function createAuthState() {
  let auth = $state<Auth | null>(null);
  let loading = $state(!isBrowser);
  let error = $state<string | null>(null);

  return {
    get auth() { return auth; },
    get loading() { return loading; },
    get error() { return error; },
    get id() { return auth?.id ?? null; },
    get did() { return auth?.did ?? null; },
    get accessTokens() { return auth?.accessTokens ?? []; },
    get isBrowser() { return isBrowser; },

    async init() {
      if (!isBrowser) return;
      
      try {
        loading = true;
        auth = await initAuth();
        error = null;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Auth initialization failed';
        console.error('[Auth]', err);
      } finally {
        loading = false;
      }
    },

    async createToken(docUrl: string, role: Role, options?: CreateTokenOptions) {
      if (!auth) throw new Error('Auth not initialized');
      return auth.createToken(docUrl, role, options);
    },

    async grant(docUrl: string, recipientDid: string, role: Role, options?: GrantOptions) {
      if (!auth) throw new Error('Auth not initialized');
      return auth.grant(docUrl, recipientDid, role, options);
    },

    importAccess(token: string) {
      if (!auth) throw new Error('Auth not initialized');
      return auth.importAccess(token);
    },

    async reset() {
      if (!isBrowser) return;
      await auth?.reset();
      auth = null;
      await this.init();
    }
  };
}
