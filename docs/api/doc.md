# doc()

Create or load a synced document by name.

## Usage

```typescript
import { doc } from 'svelte-locally';

const counter = doc('my-counter', { count: 0 });
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Human-readable document name |
| `initial` | `T` | Initial value (used only when creating new) |

## Returns: DocResult<T>

```typescript
interface DocResult<T> {
  /** Current document data (reactive) */
  readonly data: T | undefined;
  
  /** Document status (reactive) */
  readonly status: DocStatus;
  
  /** Automerge URL (for sharing) */
  readonly url: AutomergeUrl | null;
  
  /** Modify the document */
  change: (fn: (draft: T) => void) => void;
  
  /** Retry after error */
  retry: () => void;
  
  /** Subscribe to changes (callback-based) */
  subscribe: (callback: (data: T) => void) => () => void;
  
  /** Get document size in bytes */
  getSize: () => number;
  
  /** Compact document (reduce storage) */
  compact: () => Promise<void>;
}
```

## Status Object

```typescript
interface DocStatus {
  ready: boolean;    // Document loaded and usable
  syncing: boolean;  // Changes being synced
  peers: number;     // Connected peer count
  online: boolean;   // Network available
  error: string | null;  // Error message or null
}
```

## Examples

### Basic Usage

```svelte
<script>
  import { doc } from 'svelte-locally';
  
  const settings = doc('user-settings', {
    theme: 'light',
    fontSize: 16,
  });
</script>

{#if settings.status.ready}
  <p>Theme: {settings.data.theme}</p>
  <p>Font size: {settings.data.fontSize}px</p>
{/if}
```

### Modifying Data

```svelte
<script>
  const settings = doc('user-settings', { theme: 'light' });
  
  function toggleTheme() {
    settings.change(draft => {
      draft.theme = draft.theme === 'light' ? 'dark' : 'light';
    });
  }
</script>

<button onclick={toggleTheme}>
  Toggle Theme
</button>
```

### Working with Arrays

```svelte
<script>
  const todos = doc('my-todos', { items: [] });
  
  function addItem(text) {
    todos.change(draft => {
      draft.items.push({ id: crypto.randomUUID(), text, done: false });
    });
  }
  
  function removeItem(id) {
    todos.change(draft => {
      const index = draft.items.findIndex(i => i.id === id);
      if (index >= 0) draft.items.splice(index, 1);
    });
  }
</script>
```

### Error Handling

```svelte
<script>
  const data = doc('my-data', {});
</script>

{#if data.status.error}
  <div class="error">
    <p>Error: {data.status.error}</p>
    <button onclick={() => data.retry()}>Retry</button>
  </div>
{:else if !data.status.ready}
  <p>Loading...</p>
{:else}
  <!-- render data -->
{/if}
```

### Subscribe to Changes

```typescript
const counter = doc('counter', { count: 0 });

// Subscribe returns an unsubscribe function
const unsubscribe = counter.subscribe(data => {
  console.log('Count changed:', data?.count);
});

// Later: stop listening
unsubscribe();
```

### Monitor Size

```typescript
const bigDoc = doc('large-data', { items: [] });

// Check size in bytes
console.log('Size:', bigDoc.getSize(), 'bytes');

// Compact to reduce storage
await bigDoc.compact();
```

## docFromUrl()

Load a document by its Automerge URL (for shared documents):

```typescript
import { docFromUrl } from 'svelte-locally';

// URL from a share link
const shared = docFromUrl<TodoList>('automerge:abc123...');
```

## Related

- [collection()](./collection.md) — For large lists
- [Core Concepts](../core-concepts.md) — How documents work
