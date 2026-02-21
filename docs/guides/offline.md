# Offline Support

svelte-locally is offline-first by design. Here's how to make the most of it.

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                    Your App                         │
├─────────────────────────────────────────────────────┤
│  doc.change(...)  ──────►  Local State (reactive)   │
│                               │                     │
│                               ▼                     │
│                          IndexedDB (persisted)      │
│                               │                     │
│                               ▼                     │
│                     WebSocket Sync (when online)    │
└─────────────────────────────────────────────────────┘
```

1. **Changes are instant** — applied to local state immediately
2. **Changes are persisted** — saved to IndexedDB
3. **Changes sync when possible** — sent via WebSocket when online

## Detecting Online Status

```svelte
<script>
  import { doc } from 'svelte-locally';
  
  const data = doc('my-data', {});
</script>

{#if data.status.online}
  <span class="status online">🟢 Online</span>
{:else}
  <span class="status offline">🔴 Offline</span>
{/if}

{#if data.status.syncing}
  <span class="syncing">Syncing...</span>
{/if}
```

## Optimistic Updates

Changes are applied locally before syncing. The UI updates immediately:

```svelte
<script>
  const todos = doc('todos', { items: [] });
  
  function addTodo(text) {
    // This updates the UI INSTANTLY
    // Sync happens in background
    todos.change(d => {
      d.items.push({ text, done: false });
    });
  }
</script>
```

Users don't wait for network — the app feels fast even on slow connections.

## Handling Sync Conflicts

Automerge CRDTs merge changes automatically. But you might want to show when changes came from elsewhere:

```svelte
<script>
  const data = doc('shared-doc', { content: '' });
  let lastLocalEdit = $state(Date.now());
  
  // Track when we edit locally
  function updateContent(text) {
    lastLocalEdit = Date.now();
    data.change(d => { d.content = text });
  }
  
  // Subscribe to all changes
  data.subscribe(doc => {
    if (Date.now() - lastLocalEdit > 1000) {
      // Change came from sync, not local edit
      showNotification('Document updated by another device');
    }
  });
</script>
```

## Offline Indicator Component

```svelte
<!-- OfflineIndicator.svelte -->
<script>
  let online = $state(navigator.onLine);
  
  $effect(() => {
    const handleOnline = () => online = true;
    const handleOffline = () => online = false;
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });
</script>

{#if !online}
  <div class="offline-banner">
    📡 You're offline. Changes will sync when you reconnect.
  </div>
{/if}

<style>
  .offline-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.5rem;
    background: #fef3c7;
    text-align: center;
    font-size: 0.875rem;
  }
</style>
```

## Pending Changes Indicator

Show users when changes are waiting to sync:

```svelte
<script>
  const data = doc('my-data', {});
</script>

<div class="sync-status">
  {#if !data.status.online}
    <span>📴 Offline</span>
  {:else if data.status.syncing}
    <span>🔄 Syncing...</span>
  {:else}
    <span>✅ Synced</span>
  {/if}
</div>
```

## Service Worker (PWA)

For a full offline experience, add a service worker:

```javascript
// src/service-worker.js
import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
```

Enable in `svelte.config.js`:

```javascript
export default {
  kit: {
    serviceWorker: {
      register: true,
    },
  },
};
```

## Best Practices

### 1. Always Show Current State

Don't block UI waiting for sync:

```svelte
<!-- ✅ Good: Show data, indicate sync status -->
{#if data.data}
  <Content data={data.data} />
  {#if data.status.syncing}
    <SyncIndicator />
  {/if}
{/if}

<!-- ❌ Bad: Block until synced -->
{#if data.status.ready && !data.status.syncing}
  <Content data={data.data} />
{/if}
```

### 2. Handle Errors Gracefully

```svelte
{#if data.status.error}
  <ErrorBanner 
    message={data.status.error}
    onRetry={() => data.retry()}
  />
{/if}
```

### 3. Communicate Status

Let users know what's happening:

- 🟢 "Saved" — changes persisted locally
- 🔄 "Syncing" — sending to server
- ✅ "Synced" — confirmed on server
- 📴 "Offline" — will sync when online

## Related

- [Core Concepts](../core-concepts.md)
- [Error Handling](../api/doc.md#error-handling)
