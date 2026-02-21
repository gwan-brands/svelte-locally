# collection()

Create or load a scalable collection. Each item is stored as a separate document.

## When to Use

Use `collection()` instead of `doc()` when:
- You have many items (100+)
- Items can be loaded independently
- The list grows over time

## Usage

```typescript
import { collection } from 'svelte-locally';

interface Todo {
  text: string;
  done: boolean;
  createdAt: number;
}

const todos = collection<Todo>('todos');
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Collection name |

## Returns: CollectionResult<T>

```typescript
interface CollectionResult<T> {
  /** All items (reactive array) */
  readonly items: CollectionItem<T>[];
  
  /** Collection status (reactive) */
  readonly status: CollectionStatus;
  
  /** Add a new item, returns its ID */
  add: (data: T) => string;
  
  /** Get item by ID */
  get: (id: string) => CollectionItem<T> | undefined;
  
  /** Update item by ID */
  update: (id: string, fn: (draft: T) => void) => void;
  
  /** Remove item by ID */
  remove: (id: string) => void;
  
  /** Check if item exists */
  has: (id: string) => boolean;
  
  /** Retry after error */
  retry: () => void;
  
  /** Subscribe to changes */
  subscribe: (callback: (items: CollectionItem<T>[]) => void) => () => void;
}

/** Item with auto-generated ID */
type CollectionItem<T> = T & { id: string };
```

## Status Object

```typescript
interface CollectionStatus {
  ready: boolean;      // Collection loaded
  loadedCount: number; // Items currently loaded
  totalCount: number;  // Total items in collection
  syncing: boolean;    // Syncing changes
  online: boolean;     // Network available
  error: string | null;
}
```

## Examples

### Basic CRUD

```svelte
<script>
  import { collection } from 'svelte-locally';
  
  interface Todo {
    text: string;
    done: boolean;
  }
  
  const todos = collection<Todo>('todos');
  
  function addTodo(text: string) {
    const id = todos.add({ text, done: false });
    console.log('Created:', id);
  }
  
  function toggleTodo(id: string) {
    todos.update(id, draft => {
      draft.done = !draft.done;
    });
  }
  
  function deleteTodo(id: string) {
    todos.remove(id);
  }
</script>

{#if todos.status.ready}
  <ul>
    {#each todos.items as todo}
      <li>
        <input 
          type="checkbox" 
          checked={todo.done}
          onchange={() => toggleTodo(todo.id)}
        />
        {todo.text}
        <button onclick={() => deleteTodo(todo.id)}>×</button>
      </li>
    {/each}
  </ul>
  
  <p>{todos.status.loadedCount} of {todos.status.totalCount} loaded</p>
{:else}
  <p>Loading...</p>
{/if}
```

### With Query

```svelte
<script>
  import { collection, query } from 'svelte-locally';
  
  const todos = collection<Todo>('todos');
  
  // Filter to incomplete todos, sorted by creation date
  const activeTodos = query(todos)
    .where(t => !t.done)
    .orderBy('createdAt', 'desc')
    .limit(10);
</script>

<h2>Active ({activeTodos.count})</h2>
{#each activeTodos.items as todo}
  <div>{todo.text}</div>
{/each}
```

### Subscribe to Changes

```typescript
const todos = collection<Todo>('todos');

const unsubscribe = todos.subscribe(items => {
  console.log('Collection changed:', items.length, 'items');
});

// Later
unsubscribe();
```

## How It Works

Unlike `doc()`, which stores everything in one document, `collection()` creates:

1. A **manifest document** — tracks item IDs and order
2. **One document per item** — enables independent loading/syncing

```
collection('todos')
├── manifest: { items: { id1: url1, id2: url2 }, order: [id1, id2] }
├── item-1: { text: 'Buy milk', done: false }
└── item-2: { text: 'Walk dog', done: true }
```

Benefits:
- Scale to thousands of items
- Sync individual items (not entire list)
- Better conflict resolution (item-level)

## Related

- [query()](./query.md) — Filter and sort collections
- [doc()](./doc.md) — For single documents
- [Core Concepts](../core-concepts.md#documents-vs-collections)
