/**
 * init() - App-level configuration for svelte-locally
 *
 * Call once at app startup to configure sync, storage, and options.
 *
 * @example
 * ```typescript
 * import { init } from 'svelte-locally';
 *
 * init({
 *   sync: 'wss://sync.automerge.org',
 * });
 * ```
 */

import { Repo, type PeerId, type DocumentId } from '@automerge/automerge-repo';
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import { getGrantsForDoc, getReceivedGrantForDoc } from './auth/grants';

// ============ Configuration Types ============

export interface InitConfig {
  /**
   * WebSocket sync server URL
   * @default 'wss://sync.automerge.org'
   */
  sync?: string | false;

  /**
   * Users directory service URL (for email→DID lookups)
   */
  users?: string;

  /**
   * Enable local storage (IndexedDB)
   * @default true
   */
  storage?: boolean;

  /**
   * Enable same-browser tab sync (BroadcastChannel)
   * @default true
   */
  broadcastChannel?: boolean;

  /**
   * Compaction settings for long-lived documents
   */
  compaction?: {
    /** Compact after this many changes */
    threshold?: number;
    /** Compact on interval (e.g., '1h', '30m') */
    interval?: string;
  };

  /**
   * Share policy: control which documents sync with other peers
   * - 'all': Share all documents (default, open)
   * - 'explicit': Only share documents with issued tokens
   * - custom function: (peerId, docId) => boolean
   * @default 'all'
   */
  sharePolicy?: 'all' | 'explicit' | ((peerId: string, documentId: string) => Promise<boolean>);
}

// ============ Environment Detection ============

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// ============ Singleton State ============

let repo: Repo | null = null;
let config: InitConfig = {};
let initialized = false;

// ============ Initialization ============

/**
 * Initialize svelte-locally with configuration.
 *
 * **Must be called before using doc() or collection().**
 * In SvelteKit, call this inside onMount().
 *
 * @param options Configuration options
 *
 * @example
 * ```svelte
 * <script>
 *   import { init, collection } from 'svelte-locally';
 *   import { onMount } from 'svelte';
 *
 *   let todos = $state(null);
 *
 *   onMount(() => {
 *     init({ sync: 'wss://sync.automerge.org' });
 *     todos = collection('todos');
 *   });
 * </script>
 * ```
 */
export function init(options: InitConfig = {}): void {
  if (initialized) {
    return; // Already initialized
  }

  if (!isBrowser) {
    // SSR - don't initialize, will auto-init on client
    return;
  }

  config = {
    sync: 'wss://sync.automerge.org',
    storage: true,
    broadcastChannel: true,
    ...options,
  };

  const networkAdapters = [];

  // BroadcastChannel for same-browser tab sync
  if (config.broadcastChannel) {
    try {
      networkAdapters.push(new BroadcastChannelNetworkAdapter());
    } catch (e) {
      // BroadcastChannel not available
    }
  }

  // WebSocket for cross-device sync
  if (config.sync) {
    try {
      networkAdapters.push(new BrowserWebSocketClientAdapter(config.sync));
    } catch (e) {
      // WebSocket adapter failed
    }
  }

  // Build share policy
  let sharePolicy: ((peerId: PeerId, documentId?: DocumentId) => Promise<boolean>) | undefined;
  
  if (config.sharePolicy === 'explicit') {
    // Only share documents we've explicitly shared (have tokens issued or received)
    sharePolicy = async (_peerId: PeerId, documentId?: DocumentId) => {
      if (!documentId) return false;
      const docUrl = `automerge:${documentId}`;
      // Check if we've issued grants OR received access
      const issued = getGrantsForDoc(docUrl);
      const received = getReceivedGrantForDoc(docUrl);
      return issued.length > 0 || received !== null;
    };
  } else if (typeof config.sharePolicy === 'function') {
    // Custom share policy
    const customPolicy = config.sharePolicy;
    sharePolicy = async (peerId: PeerId, documentId?: DocumentId) => {
      if (!documentId) return false;
      return customPolicy(peerId as string, documentId as string);
    };
  }
  // 'all' or undefined = no sharePolicy (default: share everything)

  // Create Repo
  repo = new Repo({
    storage: config.storage ? new IndexedDBStorageAdapter() : undefined,
    network: networkAdapters,
    sharePolicy,
  });

  initialized = true;
}

/**
 * Get the singleton Repo instance
 *
 * @throws Error if init() hasn't been called
 */
export function getRepo(): Repo {
  if (!repo) {
    throw new Error(
      '[svelte-locally] Not initialized. Call init() before using doc() or collection().\n\n' +
      'Example:\n' +
      '  import { init, collection } from "svelte-locally";\n\n' +
      '  onMount(() => {\n' +
      '    init();  // Call init first\n' +
      '    const todos = collection("todos");\n' +
      '  });'
    );
  }
  return repo;
}

/**
 * Get current configuration
 */
export function getConfig(): Readonly<InitConfig> {
  return config;
}

/**
 * Check if svelte-locally is initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Reset state (mainly for testing)
 */
export function reset(): void {
  repo = null;
  config = {};
  initialized = false;
}
