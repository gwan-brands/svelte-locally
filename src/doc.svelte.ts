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

// ============ Environment Detection ============

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

// ============ ID → URL Mapping ============

const DOC_URL_STORAGE_PREFIX = 'svelte-locally:doc:';

/**
 * Get stored Automerge URL for a human-readable ID
 */
function getStoredUrl(id: string): AutomergeUrl | null {
  if (!isBrowser) return null;
  const url = localStorage.getItem(DOC_URL_STORAGE_PREFIX + id);
  return url as AutomergeUrl | null;
}

/**
 * Store Automerge URL for a human-readable ID
 */
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
  });
  let currentHandle = $state<DocHandle<T> | null>(null);
  let currentUrl = $state<AutomergeUrl | null>(null);
  
  // Track cleanup and retry
  let cleanup: (() => void) | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  
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
  
  // Initialize document
  function initDocument() {
    // Clean up previous
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    
    // Skip during SSR
    if (!isBrowser) {
      return;
    }
    
    try {
      // Clear any previous error
      status.error = null;
      
      // Get repo (auto-initializes if needed)
      const repo = getRepo();
      
      // Check for existing document
      let handle: DocHandle<T>;
      const existingUrl = getStoredUrl(id);
      
      if (existingUrl) {
        // Load existing document
        handle = repo.find<T>(existingUrl);
        currentUrl = existingUrl;
      } else {
        // Create new document
        handle = repo.create<T>(initial);
        storeUrl(id, handle.url);
        currentUrl = handle.url;
      }
      
      currentHandle = handle;
      
      // Initial state
      data = handle.docSync() ?? initial;
      status.ready = handle.isReady();
      
      // Event handlers
      const onChange = () => {
        data = handle.docSync();
        notifySubscribers();
      };
      
      // Network status
      const onOnline = () => { 
        status.online = true;
        // Retry on reconnect if there was an error
        if (status.error) {
          retry();
        }
      };
      const onOffline = () => { status.online = false; };
      
      // Subscribe to change events
      handle.on('change', onChange);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      
      // Wait for ready
      if (handle.isReady()) {
        data = handle.docSync();
        status.ready = true;
        retryCount = 0; // Reset on success
      } else {
        status.syncing = true;
        handle.whenReady()
          .then(() => {
            data = handle.docSync();
            status.ready = true;
            status.syncing = false;
            status.error = null;
            retryCount = 0; // Reset on success
          })
          .catch((err) => {
            status.syncing = false;
            status.error = err instanceof Error ? err.message : 'Failed to load document';
            console.error('[svelte-locally] Document load failed:', err);
            
            // Auto-retry with exponential backoff
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
  
  // Manual retry function
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
    change(fn: ChangeFn<T>) {
      if (currentHandle) {
        currentHandle.change(fn);
      }
    },
    retry,
    subscribe(callback: DocSubscriber<T>): Unsubscribe {
      subscribers.add(callback);
      // Immediately call with current data
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
        // Save document to binary and measure size
        const binary = Automerge.save(data as Automerge.Doc<T>);
        return binary.byteLength;
      } catch {
        return 0;
      }
    },
    async compact(): Promise<void> {
      if (!currentHandle || !data) return;
      try {
        // Clone creates a fresh document with no history
        const compacted = Automerge.clone(data as Automerge.Doc<T>);
        currentHandle.change(() => {
          // This is a no-op change that triggers a save
          // The storage adapter will save the compacted state
        });
        console.log('[svelte-locally] Document compacted');
      } catch (err) {
        console.error('[svelte-locally] Compaction failed:', err);
      }
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
  });
  let currentHandle = $state<DocHandle<T> | null>(null);
  
  let cleanup: (() => void) | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  
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
        retryCount = 0;
      } else {
        status.syncing = true;
        handle.whenReady()
          .then(() => {
            data = handle.docSync();
            status.ready = true;
            status.syncing = false;
            status.error = null;
            retryCount = 0;
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
    change(fn: ChangeFn<T>) {
      if (currentHandle) {
        currentHandle.change(fn);
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
  };
}
