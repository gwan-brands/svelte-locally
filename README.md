# svelte-locally

[![npm version](https://img.shields.io/npm/v/svelte-locally.svg)](https://www.npmjs.com/package/svelte-locally)
[![license](https://img.shields.io/npm/l/svelte-locally.svg)](https://github.com/gwan-co/svelte-locally/blob/main/LICENSE)

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
      todos.change(draft => {
        draft.items.push({ text, done: false });
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
});
```

### `doc(id, initial)`

Create or load a synced document.

```typescript
const counter = doc('my-counter', { count: 0 });

// Read data (reactive)
counter.data.count   // → 0

// Mutate data
counter.change(draft => {
  draft.count = draft.count + 1;
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
todos.update(id, doc => { doc.done = true; });
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
const user = await identity();

user.id    // "did:key:z6MkhaXgBZD..."
user.did   // same as id
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

MIT © [Joe O'Heron](https://github.com/gwan-co)
