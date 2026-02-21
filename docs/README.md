# svelte-locally Documentation

Local-first data sync for Svelte. Your data lives on the user's device, syncs when online, works offline, and merges conflicts automatically.

## Why svelte-locally?

- **Offline-first**: Works without internet, syncs when connected
- **User-owned data**: Data stays on the user's device
- **No backend required**: Sync server is optional infrastructure, not authority
- **Conflict-free**: CRDTs auto-merge changes from multiple devices
- **Decentralized auth**: UCAN tokens — no server permission checks

## Quick Links

| Guide | Description |
|-------|-------------|
| [Getting Started](./getting-started.md) | Install and build your first app |
| [Core Concepts](./core-concepts.md) | Understand local-first, CRDTs, UCAN |
| [API Reference](./api/) | Complete API documentation |
| [Guides](./guides/) | SvelteKit, offline patterns, sharing |

## 30-Second Example

```svelte
<script>
  import { init, doc } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  let counter = $state(null);
  
  onMount(() => {
    init();  // Required: call init() first
    counter = doc('my-counter', { count: 0 });
  });
  
  function increment() {
    counter?.change(d => { d.count += 1 });
  }
</script>

{#if counter?.status.ready}
  <button onclick={increment}>
    Count: {counter.data.count}
  </button>
{:else}
  <p>Loading...</p>
{/if}
```

That's it. The counter persists locally, syncs across tabs, and works offline.

## Installation

```bash
npm install svelte-locally
```

## Next Steps

1. **[Getting Started](./getting-started.md)** — Build a todo app in 10 minutes
2. **[Core Concepts](./core-concepts.md)** — Understand how it works
3. **[SvelteKit Guide](./guides/sveltekit.md)** — SSR and deployment
4. **[Common Pitfalls](./guides/pitfalls.md)** — Avoid common mistakes
