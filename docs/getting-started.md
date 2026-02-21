# Getting Started

Build a syncing todo app in 10 minutes.

## Prerequisites

- Node.js 18+
- A Svelte 5 project (SvelteKit or Vite)

## Installation

```bash
npm install svelte-locally
```

## Step 1: Initialize and Create a Document

**Important:** You must call `init()` before using `doc()` or `collection()`. In SvelteKit, do this inside `onMount()`.

```svelte
<!-- src/routes/+page.svelte -->
<script>
  import { init, doc } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  // State must use $state for reactivity
  let todos = $state(null);
  
  onMount(() => {
    // Initialize svelte-locally first
    init();
    
    // Then create or load your document
    todos = doc('my-todos', { items: [] });
  });
</script>
```

## Step 2: Display the Data

Use `todos.data` to access the document's contents. It's reactive — your UI updates automatically when data changes.

```svelte
<script>
  import { init, doc } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  let todos = $state(null);
  
  onMount(() => {
    init();
    todos = doc('my-todos', { items: [] });
  });
</script>

{#if todos?.status.ready}
  <h1>My Todos ({todos.data.items.length})</h1>
  
  <ul>
    {#each todos.data.items as item}
      <li>{item.text}</li>
    {/each}
  </ul>
{:else}
  <p>Loading...</p>
{/if}
```

## Step 3: Modify the Data

Use `todos.change()` to update the document. Pass a function that modifies the doc.

```svelte
<script>
  import { init, doc } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  let todos = $state(null);
  
  onMount(() => {
    init();
    todos = doc('my-todos', { items: [] });
  });
  
  function addTodo() {
    if (!todos) return;
    const text = prompt('What needs to be done?');
    if (!text) return;
    
    todos.change(doc => {
      doc.items.push({ 
        id: crypto.randomUUID(),
        text, 
        done: false 
      });
    });
  }
  
  function toggleTodo(id) {
    todos?.change(doc => {
      const item = doc.items.find(i => i.id === id);
      if (item) item.done = !item.done;
    });
  }
  
  function deleteTodo(id) {
    todos?.change(doc => {
      const index = doc.items.findIndex(i => i.id === id);
      if (index >= 0) doc.items.splice(index, 1);
    });
  }
</script>

{#if todos?.status.ready}
  <h1>My Todos</h1>
  
  <button onclick={addTodo}>Add Todo</button>
  
  <ul>
    {#each todos.data.items as item}
      <li>
        <input 
          type="checkbox" 
          checked={item.done}
          onchange={() => toggleTodo(item.id)}
        />
        <span class:done={item.done}>{item.text}</span>
        <button onclick={() => deleteTodo(item.id)}>×</button>
      </li>
    {/each}
  </ul>
{:else}
  <p>Loading...</p>
{/if}

<style>
  .done { text-decoration: line-through; opacity: 0.5; }
</style>
```

## Step 4: Enable Sync

By default, `init()` enables sync to the public Automerge relay server. Your data syncs across all devices/tabs automatically.

To use a custom sync server or disable sync:

```svelte
<script>
  onMount(() => {
    // Custom sync server
    init({ sync: 'wss://your-server.com' });
    
    // Or disable sync (local-only)
    init({ sync: false });
  });
</script>
```

## What's Happening?

1. **Local storage**: Data is saved to IndexedDB on your device
2. **Reactive state**: `todos.data` updates your UI automatically
3. **Conflict-free**: If two devices edit simultaneously, changes merge automatically
4. **Offline-ready**: Works without internet, syncs when reconnected

## Status Object

Every document has a `status` object:

```typescript
todos.status.ready    // true when document is loaded
todos.status.syncing  // true when sending/receiving changes
todos.status.online   // true when connected to internet
todos.status.error    // error message, or null
```

## Next Steps

- **[Core Concepts](./core-concepts.md)** — Understand CRDTs and UCAN
- **[Collections](./api/collection.md)** — For large lists (thousands of items)
- **[Queries](./api/query.md)** — Filter and sort your data
- **[Auth](./api/auth.md)** — User identity and sharing
