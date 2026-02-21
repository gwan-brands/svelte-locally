# init()

Initialize svelte-locally with configuration options.

## Usage

```typescript
import { init } from 'svelte-locally';

init({
  sync: 'wss://sync.automerge.org',
});
```

## When to Call

Call `init()` once at app startup, before using any documents. In SvelteKit, call it in `+layout.svelte`:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { init } from 'svelte-locally';
  import { onMount } from 'svelte';
  
  onMount(() => {
    init({ sync: 'wss://sync.automerge.org' });
  });
</script>

<slot />
```

## Options

```typescript
interface InitConfig {
  /** WebSocket sync server URL. Set to false to disable. */
  sync?: string | false;
  
  /** Users directory service URL (for email→DID lookups) */
  users?: string;
  
  /** Enable IndexedDB storage. Default: true */
  storage?: boolean;
  
  /** Enable same-browser tab sync. Default: true */
  broadcastChannel?: boolean;
}
```

### sync

WebSocket URL for cross-device sync.

```typescript
// Use public relay (free, no auth)
init({ sync: 'wss://sync.automerge.org' });

// Use your own relay
init({ sync: 'wss://sync.yourapp.com' });

// Disable sync (local-only)
init({ sync: false });
```

### storage

Enable/disable IndexedDB persistence.

```typescript
// Default: enabled
init({ storage: true });

// Disable (data lost on page refresh)
init({ storage: false });
```

### broadcastChannel

Enable/disable sync across browser tabs.

```typescript
// Default: enabled (tabs sync instantly)
init({ broadcastChannel: true });
```

## Auto-Initialization

If you use `doc()` without calling `init()`, the library auto-initializes with defaults:

```typescript
// These are the defaults:
{
  sync: 'wss://sync.automerge.org',
  storage: true,
  broadcastChannel: true,
}
```

## Related

- [doc()](./doc.md) — Create/load documents
- [SvelteKit Guide](../guides/sveltekit.md) — SSR setup
