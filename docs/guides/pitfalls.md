# Common Pitfalls

Known gotchas and how to avoid them.

## 1. Init Order Matters

**Problem:** Creating `doc()` or `collection()` before calling `init()` uses default config.

```svelte
<script>
  // ❌ BAD: collection created at module level, before init()
  const todos = collection('todos');
  
  onMount(() => {
    init({ sync: 'wss://my-server.com' }); // Too late! Already auto-initialized
  });
</script>
```

**Solution:** Create docs/collections after init:

```svelte
<script>
  let todos = $state(null);
  
  onMount(() => {
    init({ sync: 'wss://my-server.com' });
    todos = collection('todos'); // ✅ Created after init
  });
</script>
```

## 2. $effect in Svelte 5

**Problem:** `$effect` can't be inside callbacks like `onMount`.

```svelte
<script>
  onMount(() => {
    // ❌ BAD: $effect inside onMount throws error
    $effect(() => {
      console.log(todos?.items);
    });
  });
</script>
```

**Solution:** Put `$effect` at top level:

```svelte
<script>
  let todos = $state(null);
  
  onMount(() => {
    init();
    todos = collection('todos');
  });
  
  // ✅ GOOD: $effect at top level
  $effect(() => {
    if (todos?.items) {
      console.log(todos.items);
    }
  });
</script>
```

## 3. Reactivity Requires $state

**Problem:** Variables assigned in `onMount` need `$state` for reactivity.

```svelte
<script>
  // ❌ BAD: not reactive
  let todos;
  
  onMount(() => {
    todos = collection('todos');
  });
</script>

{todos?.items.length} <!-- Won't update -->
```

**Solution:** Use `$state`:

```svelte
<script>
  // ✅ GOOD: reactive
  let todos = $state(null);
  
  onMount(() => {
    todos = collection('todos');
  });
</script>

{todos?.items.length} <!-- Updates correctly -->
```

## 4. SSR and Browser-Only Code

**Problem:** svelte-locally uses browser APIs (IndexedDB, localStorage). SSR will fail.

**Solution:** All svelte-locally code must run in `onMount` or behind browser checks:

```svelte
<script>
  import { browser } from '$app/environment';
  
  let todos = $state(null);
  
  onMount(() => {
    // onMount only runs in browser
    init();
    todos = collection('todos');
  });
</script>

{#if todos}
  <!-- Only render when loaded -->
{/if}
```

## 5. Null Checks in Templates

**Problem:** Accessing properties before data loads causes errors.

```svelte
<!-- ❌ BAD: crashes if todos is null -->
{todos.items.length}
```

**Solution:** Use optional chaining and fallbacks:

```svelte
<!-- ✅ GOOD: safe access -->
{todos?.items.length ?? 0}

<!-- Or guard with {#if} -->
{#if todos?.status.ready}
  {todos.items.length}
{/if}
```

## 6. Automerge Array Methods

**Problem:** Some array methods like `indexOf` may not work reliably on Automerge proxy arrays.

**Solution:** Use loops or spread to plain array first:

```typescript
// Inside a change function:
manifestHandle.change(doc => {
  // ❌ May not work
  const idx = doc.items.indexOf(id);
  
  // ✅ Reliable
  let idx = -1;
  for (let i = 0; i < doc.items.length; i++) {
    if (doc.items[i] === id) {
      idx = i;
      break;
    }
  }
});
```
