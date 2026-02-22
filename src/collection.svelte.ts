/**
 * collection() - Scalable list API for svelte-locally
 * 
 * Unlike doc() which stores everything in one document, collection() creates
 * a separate document per item. This scales better for large lists and gives
 * better conflict resolution (item-level, not array-level).
 * 
 * @example
 * ```svelte
 * <script>
 *   import { collection } from 'svelte-locally';
 *   
 *   const todos = collection<Todo>('todos');
 *   
 *   function addTodo(text: string) {
 *     todos.add({ text, done: false });
 *   }
 * </script>
 * 
 * {#each todos.items as todo}
 *   <li>{todo.text}</li>
 * {/each}
 * ```
 */

import { getRepo } from './init.svelte';
import type { DocHandle, AutomergeUrl, Repo } from '@automerge/automerge-repo';
import type { ChangeFn } from '@automerge/automerge';

// ============ Environment Detection ============

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

// ============ Types ============

/** Internal manifest structure - tracks all items in a collection */
interface CollectionManifest {
  /** Map of item ID to Automerge URL */
  items: Record<string, string>;
  /** Creation order for default sorting */
  order: string[];
}

/** An item in the collection with its ID */
export type CollectionItem<T> = T & { 
  /** Unique identifier for this item */
  readonly id: string;
};

/** Status of the collection */
export interface CollectionStatus {
  /** Manifest loaded and ready */
  ready: boolean;
  /** Number of items loaded */
  loadedCount: number;
  /** Total items in collection */
  totalCount: number;
  /** Currently syncing */
  syncing: boolean;
  /** Network available */
  online: boolean;
  /** Last error (null if no error) */
  error: string | null;
  /** Number of unsynced local changes */
  pendingChanges: number;
  /** When collection was last synced (null if never) */
  lastSyncedAt: Date | null;
  /** Loading progress 0-100 (during initial load) */
  loadProgress: number;
}

/** Collection API return type */
export interface CollectionResult<T extends object> {
  /** All loaded items (reactive) */
  readonly items: CollectionItem<T>[];
  /** Collection status */
  readonly status: CollectionStatus;
  
  /** Add a new item to the collection */
  add: (data: T) => string;
  /** Get a single item by ID */
  get: (id: string) => CollectionItem<T> | undefined;
  /** Update an item by ID */
  update: (id: string, modifier: ChangeFn<T>) => void;
  /** Remove an item by ID */
  remove: (id: string) => void;
  /** Check if an item exists */
  has: (id: string) => boolean;
  /** Retry loading after an error */
  retry: () => void;
  /** Subscribe to collection changes */
  subscribe: (callback: CollectionSubscriber<T>) => Unsubscribe;
}

/** Callback for collection changes */
export type CollectionSubscriber<T extends object> = (items: CollectionItem<T>[]) => void;

/** Unsubscribe function */
export type Unsubscribe = () => void;

// ============ ID Generation ============

/** Generate a unique ID for a new item */
function generateId(): string {
  // Timestamp + random suffix for uniqueness
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

// ============ Storage Keys ============

const MANIFEST_STORAGE_PREFIX = 'svelte-locally:collection:';

function getManifestStorageKey(name: string): string {
  return MANIFEST_STORAGE_PREFIX + name;
}

function getStoredManifestUrl(name: string): AutomergeUrl | null {
  if (!isBrowser) return null;
  const url = localStorage.getItem(getManifestStorageKey(name));
  return url as AutomergeUrl | null;
}

function storeManifestUrl(name: string, url: AutomergeUrl): void {
  if (!isBrowser) return;
  localStorage.setItem(getManifestStorageKey(name), url);
}

// ============ Main collection() Function ============

/**
 * Create or load a collection by name
 * 
 * @param name Human-readable collection name (e.g., 'todos', 'users')
 * @returns Collection API with reactive items and CRUD methods
 * 
 * @example
 * ```typescript
 * interface Todo {
 *   text: string;
 *   done: boolean;
 * }
 * 
 * const todos = collection<Todo>('todos');
 * 
 * // Add an item
 * const id = todos.add({ text: 'Buy milk', done: false });
 * 
 * // Update an item
 * todos.update(id, doc => { doc.done = true; });
 * 
 * // Remove an item
 * todos.remove(id);
 * 
 * // Iterate (reactive)
 * todos.items.forEach(todo => console.log(todo.text));
 * ```
 */
export function collection<T extends object>(
  name: string
): CollectionResult<T> {
  // State
  let items = $state<CollectionItem<T>[]>([]);
  let status = $state<CollectionStatus>({
    ready: false,
    loadedCount: 0,
    totalCount: 0,
    syncing: false,
    online: isBrowser ? navigator.onLine : true,
    error: null,
    pendingChanges: 0,
    lastSyncedAt: null,
    loadProgress: 0,
  });
  
  
  // Internal state
  let repo: Repo | null = null;
  let manifestHandle: DocHandle<CollectionManifest> | null = null;
  let itemHandles = new Map<string, DocHandle<T>>();
  let cleanup: (() => void) | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;
  
  // Subscribers for callback-based updates
  const subscribers = new Set<CollectionSubscriber<T>>();
  
  function notifySubscribers() {
    for (const callback of subscribers) {
      try {
        callback(items);
      } catch (err) {
        console.error('[svelte-locally] Subscriber error:', err);
      }
    }
  }
  
  // Load an individual item document
  async function loadItem(id: string, url: AutomergeUrl): Promise<void> {
    if (itemHandles.has(id)) return; // Already loaded
    
    const handle = await repo!.find<T>(url);
    itemHandles.set(id, handle);
    
    const updateItem = () => {
      const doc = handle.doc();
      if (!doc) return;
      
      // Update or add to items array
      const index = items.findIndex(item => item.id === id);
      const itemWithId = { ...doc, id } as CollectionItem<T>;
      
      if (index >= 0) {
        // Update existing - only if data changed
        const existing = items[index];
        if (JSON.stringify(existing) !== JSON.stringify(itemWithId)) {
          items[index] = itemWithId;
          notifySubscribers();
        }
      } else {
        items.push(itemWithId);
        status.loadedCount = items.length;
        notifySubscribers();
      }
    };
    
    handle.on('change', updateItem);
    
    if (handle.isReady()) {
      updateItem();
    } else {
      handle.whenReady().then(updateItem);
    }
  }
  
  // Remove an item from local state
  function unloadItem(id: string): void {
    itemHandles.delete(id);
    items = items.filter(item => item.id !== id);
    status.loadedCount = items.length;
  }
  
  // Sync items array with manifest
  let isSyncing = false;
  
  function syncWithManifest(manifest: CollectionManifest): void {
    // Prevent re-entry during sync
    if (isSyncing) return;
    isSyncing = true;
    
    try {
      // Count items with valid URLs
      let validCount = 0;
      
      // Load new items (only if not already handled)
      for (const id of manifest.order) {
        const url = manifest.items[id];
        if (url) {
          validCount++;
          if (!itemHandles.has(id)) {
            loadItem(id, url as AutomergeUrl);
          }
        }
      }
      
      status.totalCount = validCount;
      
      // Remove deleted items (items we have handles for but aren't in manifest anymore)
      const manifestIds = new Set(manifest.order);
      const toRemove: string[] = [];
      for (const id of itemHandles.keys()) {
        if (!manifestIds.has(id)) {
          toRemove.push(id);
        }
      }
      for (const id of toRemove) {
        unloadItem(id);
      }
      
      // Reorder items to match manifest order (only if needed)
      const currentOrder = items.map(i => i.id).join(',');
      const targetOrder = manifest.order.filter(id => items.some(i => i.id === id)).join(',');
      
      if (currentOrder !== targetOrder) {
        const sorted = [...items].sort((a, b) => {
          const aIndex = manifest.order.indexOf(a.id);
          const bIndex = manifest.order.indexOf(b.id);
          return aIndex - bIndex;
        });
        // Only reassign if order actually changed
        if (sorted.map(i => i.id).join(',') !== currentOrder) {
          items = sorted;
        }
      }
    } finally {
      isSyncing = false;
    }
  }
  
  // Initialize collection
  async function initCollection() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    
    if (!isBrowser) return;
    
    try {
      status.error = null;
      repo = getRepo();
      
      // Get or create manifest
      const existingUrl = getStoredManifestUrl(name);
      
      if (existingUrl) {
        // Try findWithProgress for loading updates, fall back to find()
        if (typeof repo.findWithProgress === 'function') {
          const progress = repo.findWithProgress<CollectionManifest>(existingUrl);
          
          // Subscribe to progress updates if available
          let unsubProgress: (() => void) | null = null;
          if ('subscribe' in progress) {
            unsubProgress = progress.subscribe((p) => {
              if (p.state === 'loading' && 'progress' in p) {
                status.loadProgress = Math.round(p.progress * 100);
              } else if (p.state === 'ready') {
                status.loadProgress = 100;
              }
            });
          }
          
          // Wait for manifest to be ready
          if ('untilReady' in progress) {
            manifestHandle = await progress.untilReady(['ready', 'unavailable']);
          } else {
            manifestHandle = await repo.find<CollectionManifest>(existingUrl);
          }
          
          // Cleanup progress subscription
          if (unsubProgress) unsubProgress();
        } else {
          // Fallback for older automerge-repo versions
          manifestHandle = await repo.find<CollectionManifest>(existingUrl);
        }
        status.loadProgress = 100;
      } else {
        manifestHandle = repo.create<CollectionManifest>({
          items: {},
          order: [],
        });
        storeManifestUrl(name, manifestHandle.url);
        status.loadProgress = 100;
      }
      
      // Handle manifest changes
      const onManifestChange = () => {
        const manifest = manifestHandle!.doc();
        if (manifest) {
          syncWithManifest(manifest);
        }
      };
      
      const onManifestReady = () => {
        status.ready = true;
        status.syncing = false;
        status.error = null;
        retryCount = 0;
        onManifestChange();
      };
      
      manifestHandle.on('change', onManifestChange);
      
      // Network status
      const onOnline = () => { 
        status.online = true;
        if (status.error) retry();
      };
      const onOffline = () => { status.online = false; };
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      
      // Initial load
      if (manifestHandle.isReady()) {
        onManifestReady();
      } else {
        status.syncing = true;
        manifestHandle.whenReady()
          .then(onManifestReady)
          .catch((err) => {
            status.syncing = false;
            status.error = err instanceof Error ? err.message : 'Failed to load collection';
            
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              const delay = RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
              setTimeout(initCollection, delay);
            }
          });
      }
      
      cleanup = () => {
        manifestHandle?.off('change', onManifestChange);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        itemHandles.clear();
      };
    } catch (err) {
      status.error = err instanceof Error ? err.message : 'Failed to initialize collection';
    }
  }
  
  // Manual retry function
  function retry() {
    retryCount = 0;
    status.error = null;
    initCollection();
  }
  
  $effect(() => {
    initCollection();
    return () => { if (cleanup) cleanup(); };
  });
  
  return {
    get items() { return items; },
    get status() { return status; },
    
    add(data: T): string {
      if (!repo || !manifestHandle) {
        throw new Error('Collection not initialized');
      }
      
      const id = generateId();
      
      // Create item document
      const itemHandle = repo.create<T>(data);
      itemHandles.set(id, itemHandle);
      
      // Set up change listener for this item
      const updateItem = () => {
        const doc = itemHandle.doc();
        if (!doc) return;
        
        const index = items.findIndex(item => item.id === id);
        const itemWithId = { ...doc, id } as CollectionItem<T>;
        
        if (index >= 0) {
          items[index] = itemWithId;
        } else {
          items.push(itemWithId);
          status.loadedCount = items.length;
        }
        notifySubscribers();
      };
      
      itemHandle.on('change', updateItem);
      
      // Add to manifest (this triggers sync, but we've already set up the handle)
      manifestHandle.change(manifest => {
        manifest.items[id] = itemHandle.url;
        manifest.order.push(id);
      });
      
      // Initialize item data immediately
      updateItem();
      
      return id;
    },
    
    get(id: string): CollectionItem<T> | undefined {
      return items.find(item => item.id === id);
    },
    
    update(id: string, modifier: ChangeFn<T>): void {
      const handle = itemHandles.get(id);
      if (handle) {
        handle.change(modifier);
      }
    },
    
    remove(id: string): void {
      if (!manifestHandle) return;
      
      // Remove from local state immediately
      const handle = itemHandles.get(id);
      if (handle) {
        itemHandles.delete(id);
      }
      items = items.filter(item => item.id !== id);
      status.loadedCount = items.length;
      notifySubscribers();
      
      // Update manifest
      manifestHandle.change(manifest => {
        // Remove from items map
        delete manifest.items[id];
        
        // Remove from order array - use loop (more reliable with Automerge proxies)
        let index = -1;
        for (let i = 0; i < manifest.order.length; i++) {
          if (manifest.order[i] === id) {
            index = i;
            break;
          }
        }
        if (index >= 0) {
          manifest.order.splice(index, 1);
        }
      });
      
      // Update totalCount based on actual manifest state
      const manifest = manifestHandle.doc();
      status.totalCount = manifest ? manifest.order.length : 0;
    },
    
    has(id: string): boolean {
      return itemHandles.has(id);
    },
    
    retry,
    
    subscribe(callback: CollectionSubscriber<T>): Unsubscribe {
      subscribers.add(callback);
      // Immediately call with current items
      if (items.length > 0) {
        callback(items);
      }
      return () => {
        subscribers.delete(callback);
      };
    },
  };
}
