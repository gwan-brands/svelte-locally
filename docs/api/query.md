# query()

Filter, sort, and limit collection items. Returns a reactive view.

## Usage

```typescript
import { collection, query } from 'svelte-locally';

const todos = collection<Todo>('todos');

const activeTodos = query(todos)
  .where(t => !t.done)
  .orderBy('createdAt', 'desc')
  .limit(10);
```

## Returns: QueryResult<T>

```typescript
interface QueryResult<T> {
  /** Filtered/sorted items (reactive) */
  readonly items: CollectionItem<T>[];
  
  /** Total matching count (before limit) */
  readonly count: number;
}
```

## Methods

### .where(predicate)

Filter items by a predicate function.

```typescript
// Filter incomplete todos
query(todos).where(t => !t.done)

// Filter by priority
query(todos).where(t => t.priority === 'high')

// Chain multiple filters (AND)
query(todos)
  .where(t => !t.done)
  .where(t => t.priority === 'high')
```

### .orderBy(field, direction)

Sort by a field.

```typescript
// Sort by date, newest first
query(todos).orderBy('createdAt', 'desc')

// Sort by name, A-Z
query(todos).orderBy('name', 'asc')

// Custom comparator
query(todos).orderBy((a, b) => a.priority - b.priority)
```

### .limit(n)

Take first N results.

```typescript
// Get top 10
query(todos).limit(10)
```

### .offset(n)

Skip first N results (for pagination).

```typescript
// Skip first 10, take next 10
query(todos).offset(10).limit(10)
```

## Examples

### Filter and Sort

```svelte
<script>
  import { collection, query } from 'svelte-locally';
  
  const todos = collection<Todo>('todos');
  
  const highPriority = query(todos)
    .where(t => t.priority === 'high')
    .orderBy('createdAt', 'desc');
</script>

<h2>High Priority ({highPriority.count})</h2>
{#each highPriority.items as todo}
  <div>{todo.text}</div>
{/each}
```

### Pagination

```svelte
<script>
  import { collection, query } from 'svelte-locally';
  
  const PAGE_SIZE = 10;
  let page = $state(0);
  
  const todos = collection<Todo>('todos');
  
  // Reactive query updates when page changes
  const paginated = $derived(
    query(todos)
      .orderBy('createdAt', 'desc')
      .offset(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
  );
  
  const totalPages = $derived(Math.ceil(paginated.count / PAGE_SIZE));
</script>

{#each paginated.items as todo}
  <div>{todo.text}</div>
{/each}

<div>
  <button onclick={() => page--} disabled={page === 0}>
    Previous
  </button>
  <span>Page {page + 1} of {totalPages}</span>
  <button onclick={() => page++} disabled={page >= totalPages - 1}>
    Next
  </button>
</div>
```

### Search

```svelte
<script>
  let search = $state('');
  
  const todos = collection<Todo>('todos');
  
  const results = $derived(
    query(todos)
      .where(t => t.text.toLowerCase().includes(search.toLowerCase()))
      .limit(20)
  );
</script>

<input bind:value={search} placeholder="Search..." />

{#each results.items as todo}
  <div>{todo.text}</div>
{/each}
```

## Convenience Functions

For simple cases, use these shortcuts:

### whereEq(collection, field, value)

```typescript
import { whereEq } from 'svelte-locally';

// Instead of: query(todos).where(t => t.status === 'active')
const active = whereEq(todos, 'status', 'active');
```

### take(collection, n)

```typescript
import { take } from 'svelte-locally';

// Instead of: query(todos).limit(5)
const first5 = take(todos, 5);
```

### sortBy(collection, field, direction)

```typescript
import { sortBy } from 'svelte-locally';

// Instead of: query(todos).orderBy('name', 'asc')
const sorted = sortBy(todos, 'name', 'asc');
```

## Performance

Queries run client-side on the loaded items. For large collections:

- Use `.limit()` to avoid processing thousands of items
- Consider server-side filtering for huge datasets
- Queries are reactive but efficient (only re-run when source changes)

## Related

- [collection()](./collection.md) — Create collections
- [doc()](./doc.md) — For single documents
