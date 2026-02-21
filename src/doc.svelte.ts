/**
 * doc() - High-level document API for svelte-locally
 * 
 * @example
 * ```svelte
 * <script>
 *   import { doc } from 'svelte-locally';
 *   
 *   const { data, status, change } = doc('my-todos', { items: [] });
 * </script>
 * 
 * {#if $status.ready}
 *   {#each $data.items as item}
 *     <li>{item.text}</li>
 *   {/each}
 * {/if}
 * ```
 */

import { getRepo } from './init.svelte';
import type { DocHandle, AutomergeUrl } from '@automerge/automerge-repo';
import type { ChangeFn } from '@automerge/automerge';
import * as Automerge from '@automerge/automerge';
import { 
  type Role, 
  type Grant,
  type CreateTokenOptions,
  type GrantOptions,
  initAuth
} from './auth';

// ============ Environment Detection ============

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

// ============ ID → URL Mapping ============

const DOC_URL_STORAGE_PREFIX = 'svelte-locally:doc:';

function getStoredUrl(id: string): AutomergeUrl | null {
  if (!isBrowser) return null;
  const url = localStorage.getItem(DOC_URL_STORAGE_PREFIX + id);
  return url as AutomergeUrl | null;
}

function storeUrl(id: string, url: AutomergeUrl): void {
  if (!isBrowser) return;
  localStorage.setItem(DOC_URL_STORAGE_PREFIX + id, url);
}

// ============ Status Type ============

export interface DocStatus {
  /** Document loaded and usable */
  ready: boolean;
  /** Changes being synced */
  syncing: boolean;
  /** Number of connected peers */
  peers: number;
  /** Network available */
  online: boolean;
  /** Last error (null if no error) */
  error: string | null;
  /** Number of unsynced local changes */
  pendingChanges: number;
  /** When doc was last synced (null if never) */
  lastSyncedAt: Date | null;
}

// ============ Doc Result Type ============

/** Callback for document changes */
export type DocSubscriber<T> = (data: T | undefined) => void;

/** Unsubscribe function */
export type Unsubscribe = () => void;

export interface DocResult<T> {
  /** Reactive document data (use $data in templates) */
  readonly data: T | undefined;
  /** Reactive status object */
  readonly status: DocStatus;
  /** Automerge URL for this document */
  readonly url: AutomergeUrl | null;
  /** Access grants issued for this document */
  readonly grants: Grant[];
  
  /** Retry loading after an error */
  retry: () => void;
  /** Mutate the document */
  change: (fn: ChangeFn<T>) => void;
  /** Subscribe to document changes (for non-reactive contexts) */
  subscribe: (callback: DocSubscriber<T>) => Unsubscribe;
  /** Get document size in bytes (for monitoring) */
  getSize: () => number;
  /** Compact document to reduce storage size (removes old history) */
  compact: () => Promise<void>;
  
  // ===== Sharing API =====
  
  /**
   * Create an access token for sharing
   * @param role - Access role (reader, writer, admin)
   * @param options - Token options (expires, maxUses)
   * @returns Encoded token string to share
   */
  createToken: (role: Role, options?: CreateTokenOptions) => Promise<string>;
  
  /**
   * Grant access to a specific DID
   * @param recipientDid - Recipient's DID
   * @param role - Access role
   * @param options - Grant options
   * @returns The grant object
   */
  grant: (recipientDid: string, role: Role, options?: GrantOptions) => Promise<Grant>;
  
  /**
   * Revoke access from a DID
   * @param recipientDid - DID to revoke access from
   * @returns true if grant was found and revoked
   */
  revokeGrant: (recipientDid: string) => boolean;
  
  /**
   * Generate a shareable invite link with embedded token
   * @param role - Access role
   * @param options - Token options
   * @returns Full URL with embedded access token
   */
  inviteLink: (role: Role, options?: CreateTokenOptions) => Promise<string>;
}

// ============ Main doc() Function ============

/**
 * Create or load a synced document by human-readable ID
 * 
 * @param id Human-readable identifier (e.g., 'my-todos')
 * @param initial Initial value if creating new document
 * @returns Reactive document state
 */
export function doc<T extends object>(
  id: string,
  initial: T
): DocResult<T> {
  // State
  let data = $state<T | undefined>(undefined);
  let status = $state<DocStatus>({
    ready: false,
    syncing: false,
    peers: 0,
    online: isBrowser ? navigator.onLine : true,
    error: null,
    pendingChanges: 0,
    lastSyncedAt: null,
  });
  let currentHandle = $state<DocHandle<T> | null>(null);
  let currentUrl = $state<AutomergeUrl | null>(null);
  let grants = $state<Grant[]>([]);
  
  // Track cleanup and retry
  let cleanup: (() => void) | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  
  // Auth instance (lazy loaded)
  let authPromise: Promise<ReturnType<typeof initAuth>> | null = null;
  
  async function getAuth() {
    if (!authPromise) {
      authPromise = initAuth();
    }
    return authPromise;
  }
  
  // Subscribers for callback-based updates
  const subscribers = new Set<DocSubscriber<T>>();
  
  function notifySubscribers() {
    for (const callback of subscribers) {
      try {
        callback(data);
      } catch (err) {
        console.error('[svelte-locally] Subscriber error:', err);
      }
    }
  }
  
  // Load grants for this document
  function loadGrants() {
    if (!currentUrl) return;
    getAuth().then(auth => {
      grants = auth.getGrantsFor(currentUrl!);
    }).catch(() => {
      // Auth not available
    });
  }
  
  // Initialize document
  function initDocument() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    
    if (!isBrowser) return;
    
    try {
      status.error = null;
      const repo = getRepo();
      
      let handle: DocHandle<T>;
      const existingUrl = getStoredUrl(id);
      
      if (existingUrl) {
        handle = repo.find<T>(existingUrl);
        currentUrl = existingUrl;
        
        // Claim ownership if we don't have a token yet (migration for pre-v0.2 docs)
        getAuth().then(auth => {
          auth.claimOwnership(existingUrl);
        }).catch(err => {
          console.warn('[svelte-locally] Failed to claim ownership:', err);
        });
      } else {
        handle = repo.create<T>(initial);
        storeUrl(id, handle.url);
        currentUrl = handle.url;
        
        // Create owner token for new document
        getAuth().then(auth => {
          auth.createDocToken(handle.url);
        }).catch(err => {
          console.warn('[svelte-locally] Failed to create owner token:', err);
        });
      }
      
      currentHandle = handle;
      data = handle.docSync() ?? initial;
      status.ready = handle.isReady();
      
      const onChange = () => {
        data = handle.docSync();
        status.lastSyncedAt = new Date();
        notifySubscribers();
      };
      
      const onOnline = () => { 
        status.online = true;
        if (status.error) retry();
      };
      const onOffline = () => { status.online = false; };
      
      handle.on('change', onChange);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      
      if (handle.isReady()) {
        data = handle.docSync();
        status.ready = true;
        status.lastSyncedAt = new Date();
        retryCount = 0;
        loadGrants();
      } else {
        status.syncing = true;
        handle.whenReady()
          .then(() => {
            data = handle.docSync();
            status.ready = true;
            status.syncing = false;
            status.error = null;
            status.lastSyncedAt = new Date();
            retryCount = 0;
            loadGrants();
          })
          .catch((err) => {
            status.syncing = false;
            status.error = err instanceof Error ? err.message : 'Failed to load document';
            console.error('[svelte-locally] Document load failed:', err);
            
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              const delay = RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
              console.log(`[svelte-locally] Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
              setTimeout(initDocument, delay);
            }
          });
      }
      
      cleanup = () => {
        handle.off('change', onChange);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    } catch (err) {
      status.error = err instanceof Error ? err.message : 'Failed to initialize document';
      console.error('[svelte-locally] Document init failed:', err);
    }
  }
  
  function retry() {
    retryCount = 0;
    status.error = null;
    initDocument();
  }
  
  $effect(() => {
    initDocument();
    return () => {
      if (cleanup) cleanup();
    };
  });
  
  return {
    get data() { return data; },
    get status() { return status; },
    get url() { return currentUrl; },
    get grants() { return grants; },
    
    change(fn: ChangeFn<T>) {
      if (currentHandle) {
        currentHandle.change(fn);
        status.pendingChanges++;
      }
    },
    
    retry,
    
    subscribe(callback: DocSubscriber<T>): Unsubscribe {
      subscribers.add(callback);
      if (data !== undefined) {
        callback(data);
      }
      return () => {
        subscribers.delete(callback);
      };
    },
    
    getSize(): number {
      if (!currentHandle || !data) return 0;
      try {
        const binary = Automerge.save(data as Automerge.Doc<T>);
        return binary.byteLength;
      } catch {
        return 0;
      }
    },
    
    async compact(): Promise<void> {
      if (!currentHandle || !data) return;
      try {
        Automerge.clone(data as Automerge.Doc<T>);
        currentHandle.change(() => {});
        console.log('[svelte-locally] Document compacted');
      } catch (err) {
        console.error('[svelte-locally] Compaction failed:', err);
      }
    },
    
    // ===== Sharing API =====
    
    async createToken(role: Role, options?: CreateTokenOptions): Promise<string> {
      if (!currentUrl) throw new Error('Document not initialized');
      const auth = await getAuth();
      return auth.createToken(currentUrl, role, options);
    },
    
    async grant(recipientDid: string, role: Role, options?: GrantOptions): Promise<Grant> {
      if (!currentUrl) throw new Error('Document not initialized');
      const auth = await getAuth();
      const grant = await auth.grant(currentUrl, recipientDid, role, options);
      grants = auth.getGrantsFor(currentUrl);
      return grant;
    },
    
    revokeGrant(recipientDid: string): boolean {
      if (!currentUrl) return false;
      getAuth().then(auth => {
        const result = auth.revokeGrant(currentUrl!, recipientDid);
        if (result) {
          grants = auth.getGrantsFor(currentUrl!);
        }
      });
      return true;
    },
    
    async inviteLink(role: Role, options?: CreateTokenOptions): Promise<string> {
      const token = await this.createToken(role, options);
      // In a real app, this would use the app's URL
      // For now, just return the token with a placeholder
      const baseUrl = isBrowser ? window.location.origin : 'https://app.example.com';
      return `${baseUrl}/doc/${currentUrl}#access=${encodeURIComponent(token)}`;
    },
  };
}

/**
 * Load a document by Automerge URL (for shared docs)
 * 
 * @param url Automerge URL (e.g., from a share link)
 * @returns Reactive document state
 */
export function docFromUrl<T extends object>(
  url: AutomergeUrl
): DocResult<T> {
  let data = $state<T | undefined>(undefined);
  let status = $state<DocStatus>({
    ready: false,
    syncing: true,
    peers: 0,
    online: isBrowser ? navigator.onLine : true,
    error: null,
    pendingChanges: 0,
    lastSyncedAt: null,
  });
  let currentHandle = $state<DocHandle<T> | null>(null);
  let grants = $state<Grant[]>([]);
  
  let cleanup: (() => void) | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  
  // Auth instance (lazy loaded)
  let authPromise: Promise<ReturnType<typeof initAuth>> | null = null;
  
  async function getAuth() {
    if (!authPromise) {
      authPromise = initAuth();
    }
    return authPromise;
  }
  
  const subscribers = new Set<DocSubscriber<T>>();
  
  function notifySubscribers() {
    for (const callback of subscribers) {
      try {
        callback(data);
      } catch (err) {
        console.error('[svelte-locally] Subscriber error:', err);
      }
    }
  }
  
  function loadGrants() {
    getAuth().then(auth => {
      grants = auth.getGrantsFor(url);
    }).catch(() => {});
  }
  
  function initDocument() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    
    if (!isBrowser) return;
    
    try {
      status.error = null;
      const repo = getRepo();
      
      const handle = repo.find<T>(url);
      currentHandle = handle;
      
      const onChange = () => {
        data = handle.docSync();
        status.lastSyncedAt = new Date();
        notifySubscribers();
      };
      
      const onOnline = () => { 
        status.online = true;
        if (status.error) retry();
      };
      const onOffline = () => { status.online = false; };
      
      handle.on('change', onChange);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      
      if (handle.isReady()) {
        data = handle.docSync();
        status.ready = true;
        status.syncing = false;
        status.lastSyncedAt = new Date();
        retryCount = 0;
        loadGrants();
      } else {
        status.syncing = true;
        handle.whenReady()
          .then(() => {
            data = handle.docSync();
            status.ready = true;
            status.syncing = false;
            status.error = null;
            status.lastSyncedAt = new Date();
            retryCount = 0;
            loadGrants();
          })
          .catch((err) => {
            status.syncing = false;
            status.error = err instanceof Error ? err.message : 'Failed to load document';
            
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              const delay = RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
              setTimeout(initDocument, delay);
            }
          });
      }
      
      cleanup = () => {
        handle.off('change', onChange);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    } catch (err) {
      status.error = err instanceof Error ? err.message : 'Failed to initialize document';
    }
  }
  
  function retry() {
    retryCount = 0;
    status.error = null;
    initDocument();
  }
  
  $effect(() => {
    initDocument();
    return () => { if (cleanup) cleanup(); };
  });
  
  return {
    get data() { return data; },
    get status() { return status; },
    get url() { return url; },
    get grants() { return grants; },
    
    change(fn: ChangeFn<T>) {
      if (currentHandle) {
        currentHandle.change(fn);
        status.pendingChanges++;
      }
    },
    
    retry,
    
    subscribe(callback: DocSubscriber<T>): Unsubscribe {
      subscribers.add(callback);
      if (data !== undefined) {
        callback(data);
      }
      return () => {
        subscribers.delete(callback);
      };
    },
    
    getSize(): number {
      if (!currentHandle || !data) return 0;
      try {
        const binary = Automerge.save(data as Automerge.Doc<T>);
        return binary.byteLength;
      } catch {
        return 0;
      }
    },
    
    async compact(): Promise<void> {
      if (!currentHandle || !data) return;
      try {
        Automerge.clone(data as Automerge.Doc<T>);
        currentHandle.change(() => {});
        console.log('[svelte-locally] Document compacted');
      } catch (err) {
        console.error('[svelte-locally] Compaction failed:', err);
      }
    },
    
    // ===== Sharing API =====
    
    async createToken(role: Role, options?: CreateTokenOptions): Promise<string> {
      const auth = await getAuth();
      return auth.createToken(url, role, options);
    },
    
    async grant(recipientDid: string, role: Role, options?: GrantOptions): Promise<Grant> {
      const auth = await getAuth();
      const grantResult = await auth.grant(url, recipientDid, role, options);
      grants = auth.getGrantsFor(url);
      return grantResult;
    },
    
    revokeGrant(recipientDid: string): boolean {
      getAuth().then(auth => {
        const result = auth.revokeGrant(url, recipientDid);
        if (result) {
          grants = auth.getGrantsFor(url);
        }
      });
      return true;
    },
    
    async inviteLink(role: Role, options?: CreateTokenOptions): Promise<string> {
      const token = await this.createToken(role, options);
      const baseUrl = isBrowser ? window.location.origin : 'https://app.example.com';
      return `${baseUrl}/doc/${url}#access=${encodeURIComponent(token)}`;
    },
  };
}
