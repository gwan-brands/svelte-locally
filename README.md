# svelte-locally

[![npm version](https://img.shields.io/npm/v/svelte-locally.svg)](https://www.npmjs.com/package/svelte-locally)

Local-first data sync for Svelte 5.

- **Local-first:** Data stored on your device (IndexedDB)
- **Synced:** Changes sync via WebSocket when online
- **Offline:** Works without internet, syncs when reconnected
- **CRDT:** Conflicts auto-merge with [Automerge](https://automerge.org/)
- **Decentralized Auth:** [UCAN](https://ucan.xyz/) tokens, no server gatekeeping

## Installation

```bash
npm install svelte-locally
```

## Quick Start

```svelte
<script>
  import { init, doc } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  let todos = $state(null);
  
  onMount(() => {
    init({ sync: 'wss://sync.automerge.org' });
    todos = doc('my-todos', { items: [] });
  });
  
  function addItem() {
    if (!todos) return;
    const text = prompt('Todo text:');
    if (text) {
      todos.change(current => {
        current.items.push({ text, done: false });
      });
    }
  }
</script>

{#if !todos?.status.ready}
  <p>Loading...</p>
{:else}
  <button onclick={addItem}>Add Todo</button>
  <ul>
    {#each todos.data.items as item}
      <li>{item.text}</li>
    {/each}
  </ul>
{/if}
```

## API

### `init(config)`

Initialize svelte-locally. Call once at app startup.

```typescript
init({
  sync: 'wss://sync.automerge.org',  // Sync server (optional)
  storage: true,                       // IndexedDB (default: true)
  broadcastChannel: true,              // Tab sync (default: true)
  sharePolicy: 'explicit',             // Only sync shared docs (default)
});
```

**Share Policy:**
- `'explicit'` (default) — Only sync documents with issued/received tokens (secure)
- `'all'` — Sync all documents with any peer (open)
- Custom function — `(peerId, docId) => Promise<boolean>`

### `doc(id, initial)`

Create or load a synced document.

```typescript
const counter = doc('my-counter', { count: 0 });

// Read data (reactive)
counter.data.count   // → 0

// Mutate data
counter.change(current => {
  current.count = current.count + 1;
});

// Check status
counter.status.ready    // true when loaded
counter.status.syncing  // true when syncing
counter.status.online   // true when online
counter.status.error    // error message or null
```

### `collection(name)`

Scalable lists where each item is a separate document.

```typescript
interface Todo {
  text: string;
  done: boolean;
}

const todos = collection<Todo>('todos');

// CRUD operations
const id = todos.add({ text: 'Buy milk', done: false });
todos.update(id, current => { current.done = true; });
todos.remove(id);

// Reactive array
todos.items  // [{ id: '...', text: 'Buy milk', done: true }]

// Status
todos.status.ready
todos.status.totalCount
todos.status.loadedCount
```

### `query(collection)`

Filter, sort, and limit collection items.

```typescript
const active = query(todos)
  .where(t => !t.done)
  .orderBy('createdAt', 'desc')
  .limit(10);

// Reactive results
active.items
active.count  // total before limit
```

### `identity()`

Get the user's cryptographic identity.

```typescript
const me = await identity();

me.id    // "did:key:z6MkhaXgBZD..."
me.did   // same as id

// Import access token someone sent you
me.importAccess(tokenString);

// View all received access
me.accessTokens  // [{ docUrl, role, fromDid, ... }]
```

## Sharing

Role-based access control with shareable tokens.

**Roles:**
- `reader` — can read
- `writer` — can read + write
- `admin` — can read + write + delegate

```typescript
// Create a shareable token
const token = await doc.createToken('writer', { expires: '7d' });
// Send this token however you want (DM, email, etc.)

// Grant access to a specific user
await doc.grant(recipientDid, 'reader');

// Revoke access
doc.revokeGrant(recipientDid);

// View who has access
doc.grants  // [{ recipientDid, role, expiresAt, ... }]

// Generate one-click invite link
const link = await doc.inviteLink('reader');
// "https://app.com/doc/automerge:...#access=eyJ..."
```

**Receiving access:**
```typescript
const me = await identity();

// Import token someone sent you
const access = me.importAccess(tokenString);
// { docUrl, role, fromDid, expiresAt }

// Now you can open the document
const sharedDoc = docFromUrl(access.docUrl);
```

## Offline Status

Track sync state:

```typescript
doc.status.pendingChanges  // unsynced local changes
doc.status.lastSyncedAt    // Date | null
doc.status.online          // network available
```

## Backup & Restore

Export documents to binary format for backup:

```typescript
// Export a document
const backup = await doc.export();
if (backup) {
  // Save to file, cloud storage, etc.
  downloadFile(backup, 'my-document.backup');
}

// Restore from backup
import { importDoc, docFromId } from 'svelte-locally';

const fileData = await readFile('my-document.backup');
const docUrl = importDoc<MyType>(fileData);  // returns URL

// Load in a reactive context (e.g., $effect or component init)
let viewingId = $state(docUrl);
$effect(() => {
  if (viewingId) myDoc = docFromId<MyType>(viewingId);
});
```

## SSR Support

All APIs handle server-side rendering gracefully:

```svelte
<script>
  import { init, doc } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  let todos = $state(null);
  
  onMount(() => {
    init();
    todos = doc('todos', { items: [] });
  });
</script>

{#if !todos?.status.ready}
  <p>Loading...</p>
{:else}
  <!-- render todos -->
{/if}
```

## Error Handling

Built-in retry with exponential backoff:

```svelte
{#if todos?.status.error}
  <p>Error: {todos.status.error}</p>
  <button onclick={() => todos.retry()}>Retry</button>
{/if}
```

## Types

TypeScript types are exported for convenience:

```typescript
import type { DocResult, CollectionResult } from 'svelte-locally';

let settings: DocResult<Settings> | null = $state(null);
let todos: CollectionResult<Todo> | null = $state(null);
```

## Philosophy

- **Server-optional:** Sync relay is infrastructure, not authority
- **User-owned data:** Data lives on your device, you control access
- **UCAN for auth:** Capabilities verified client-side
- **CRDTs for sync:** Conflicts merge automatically

## Common Pitfalls

### 1. Always call `init()` first

```typescript
// ❌ Wrong - will throw
const todos = doc('todos', { items: [] });
init();

// ✅ Correct
init();
const todos = doc('todos', { items: [] });
```

### 2. Use `doc()` inside component initialization

`doc()` and `collection()` use Svelte's `$effect` internally, so they must be called during component init:

```typescript
// ❌ Wrong - $effect orphan error
async function loadDoc() {
  const myDoc = doc('settings', {});  // Error!
}

// ✅ Correct - in component script or $effect
const myDoc = doc('settings', {});

// ✅ Also correct - reactive loading
let docId = $state('doc-1');
let myDoc = $state(null);
$effect(() => {
  myDoc = docFromId(docId);
});
```

### 3. Handle SSR with `onMount`

In SvelteKit, browser APIs aren't available during SSR:

```svelte
<script>
  import { init, doc } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  let todos = $state(null);
  
  // ✅ Wrap in onMount for SSR safety
  onMount(() => {
    init();
    todos = doc('todos', { items: [] });
  });
</script>
```

### 4. `importDoc()` returns URL, not DocResult

```typescript
// ❌ Wrong - importDoc doesn't return a doc
const restored = importDoc(binary);
restored.change(...);  // Error!

// ✅ Correct - use URL with docFromId in reactive context
const docUrl = importDoc(binary);
viewingDocId = docUrl;  // Let $effect load it
```

### 5. Share tokens are bearer tokens

Anyone with the token string has access. Treat share tokens like passwords:

```typescript
const token = await doc.createToken('writer');
// ⚠️ Anyone with this string can edit the document
// Share securely (DM, email) - not in public URLs
```

## Examples

See the [examples](./examples) directory for working demos:
- Todo list with collections
- Collaborative editor

## Documentation

Full documentation in the [docs](./docs) directory:
- [Getting Started](./docs/getting-started.md)
- [Core Concepts](./docs/core-concepts.md)
- [API Reference](./docs/api/)
- [Guides](./docs/guides/)

## License

MIT © [Joe O'Heron](https://github.com/gwan-brands)
