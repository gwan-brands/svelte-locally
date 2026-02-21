# SvelteKit Setup

svelte-locally works seamlessly with SvelteKit, including SSR.

## Installation

```bash
npm install svelte-locally
```

## Basic Setup

### 1. Initialize in Layout

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { init } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  onMount(() => {
    init({
      sync: 'wss://sync.automerge.org',
    });
  });
</script>

<slot />
```

### 2. Use in Pages

```svelte
<!-- src/routes/+page.svelte -->
<script>
  import { doc } from 'svelte-locally';
  
  const counter = doc('my-counter', { count: 0 });
  
  function increment() {
    counter.change(d => { d.count += 1 });
  }
</script>

{#if counter.status.ready}
  <button onclick={increment}>
    Count: {counter.data.count}
  </button>
{:else}
  <p>Loading...</p>
{/if}
```

## How SSR Works

During server-side rendering:
- `doc()` returns `{ data: undefined, status: { ready: false } }`
- No IndexedDB or WebSocket connections
- No "window is not defined" errors

On client hydration:
- Svelte's `$effect` triggers initialization
- Data loads from IndexedDB
- WebSocket connects for sync

**Result**: Fast initial render, then progressive enhancement.

## Auth with SSR

Use `createAuthState()` for SSR-safe auth:

```svelte
<script>
  import { createAuthState } from 'svelte-locally';
  
  const auth = createAuthState();
  
  // Initialize on client only
  $effect(() => {
    auth.init();
  });
</script>

{#if !auth.isBrowser}
  <!-- SSR: Show placeholder -->
  <p>Loading...</p>
{:else if auth.loading}
  <p>Initializing...</p>
{:else if auth.id}
  <p>Welcome, {auth.id.slice(0, 20)}...</p>
{/if}
```

## Loading States

Always handle the loading state:

```svelte
<script>
  const data = doc('my-data', { items: [] });
</script>

{#if data.status.error}
  <div class="error">
    <p>{data.status.error}</p>
    <button onclick={() => data.retry()}>Retry</button>
  </div>
{:else if !data.status.ready}
  <div class="loading">
    <p>Loading...</p>
  </div>
{:else}
  <div class="content">
    {#each data.data.items as item}
      <div>{item.text}</div>
    {/each}
  </div>
{/if}
```

## Preloading (Optional)

For faster perceived loading, you can show cached data immediately:

```svelte
<script>
  import { doc } from 'svelte-locally';
  
  const todos = doc('my-todos', { items: [] });
</script>

<!-- Show data even while syncing -->
{#if todos.data}
  {#each todos.data.items as item}
    <div>{item.text}</div>
  {/each}
  
  {#if todos.status.syncing}
    <p class="syncing">Syncing...</p>
  {/if}
{:else}
  <p>Loading...</p>
{/if}
```

## Deployment

### Vercel / Netlify / Cloudflare Pages

Works out of the box. No server needed — sync happens via WebSocket.

### Self-Hosted

If you want your own sync server, deploy an Automerge sync server:

```bash
npx @automerge/automerge-repo-sync-server
```

Then point to it:

```typescript
init({
  sync: 'wss://your-server.com',
});
```

## Common Issues

### "window is not defined"

Make sure you're using `onMount` or `$effect` for initialization:

```svelte
<!-- ❌ Wrong: runs on server -->
<script>
  import { init } from 'svelte-locally';
  init();  // Error on SSR!
</script>

<!-- ✅ Correct: runs on client only -->
<script>
  import { init } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  onMount(() => {
    init();
  });
</script>
```

### Hydration Mismatch

If you see hydration warnings, ensure SSR and client render the same loading state:

```svelte
<!-- ✅ Both SSR and client show "Loading..." initially -->
{#if !data.status.ready}
  <p>Loading...</p>
{:else}
  <p>{data.data.value}</p>
{/if}
```

## Related

- [Getting Started](../getting-started.md)
- [Auth API](../api/auth.md)
