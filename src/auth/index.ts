/**
 * Auth Module - Simple API for UCAN-based authorization
 *
 * Usage:
 *   const auth = await initAuth()
 *   auth.id // your public identity
 *   auth.can('doc/write', docId) // check capability
 *   await auth.createDocToken(docId) // create owner UCAN
 *   await auth.share(docId, recipientId, 'write') // delegate access
 */

export * from './keypair';
export * from './ucan';

import { getOrCreateKeypair, clearKeypair, type Keypair } from './keypair';
import {
  createOwnerUCAN,
  delegateUCAN,
  findValidUCAN,
  storeUCAN,
  clearUCANStore,
  hasCapability,
  decodeUCAN,
  type UCANToken,
  type Capability
} from './ucan';

export interface Auth {
  keypair: Keypair;
  id: string;

  // Check if we have a capability
  can: (action: string, resourceId: string) => Promise<boolean>;

  // Get our UCAN for a resource
  getToken: (resourceId: string) => Promise<UCANToken | null>;

  // Create owner UCAN for a new resource
  createDocToken: (resourceId: string) => Promise<UCANToken>;

  // Delegate access to someone else
  share: (
    resourceId: string,
    recipientDid: string,
    permission: 'read' | 'write' | 'admin'
  ) => Promise<UCANToken>;

  // Import a UCAN someone shared with us
  importToken: (encoded: string) => UCANToken | null;

  // Reset everything
  reset: () => Promise<void>;
}

// Environment detection for SSR
const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

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

  return {
    keypair,
    id: keypair.did,

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

    async share(
      resourceId: string,
      recipientDid: string,
      permission: 'read' | 'write' | 'admin'
    ): Promise<UCANToken> {
      // Find our proof for this resource
      const proof = await findValidUCAN(resourceId, 'doc/share');
      if (!proof) {
        throw new Error('No permission to share this resource');
      }

      // Map permission to capability
      const capabilities: Capability[] = [
        { with: resourceId, can: `doc/${permission}` }
      ];
      if (permission === 'write' || permission === 'admin') {
        capabilities.push({ with: resourceId, can: 'doc/read' });
      }
      if (permission === 'admin') {
        capabilities.push({ with: resourceId, can: 'doc/share' });
      }

      const delegated = await delegateUCAN(
        keypair,
        recipientDid,
        capabilities,
        proof,
        3600 * 24 * 7 // 7 days
      );

      return delegated;
    },

    importToken(encoded: string): UCANToken | null {
      const ucan = decodeUCAN(encoded);
      if (ucan && ucan.audience === keypair.did) {
        storeUCAN(ucan);
        return ucan;
      }
      console.warn('[Auth] UCAN not addressed to us');
      return null;
    },

    async reset(): Promise<void> {
      await clearKeypair();
      clearUCANStore();
    }
  };
}

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
  let loading = $state(!isBrowser); // Start as "loading" on SSR
  let error = $state<string | null>(null);

  return {
    get auth() { return auth; },
    get loading() { return loading; },
    get error() { return error; },
    get id() { return auth?.id ?? null; },
    /** Whether running in browser (false during SSR) */
    get isBrowser() { return isBrowser; },

    async init() {
      if (!isBrowser) {
        // Skip during SSR - will be called again on client hydration
        return;
      }
      
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

    async reset() {
      if (!isBrowser) return;
      await auth?.reset();
      auth = null;
      await this.init();
    }
  };
}
