<script lang="ts">
  import { init } from 'svelte-locally';
  import { onMount } from 'svelte';

  onMount(() => {
    init({ sync: 'wss://sync.automerge.org' });
  });
</script>

<slot />
