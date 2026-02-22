<script lang="ts">
  import { init } from 'svelte-locally';
  import { onMount } from 'svelte';

  onMount(() => {
    init({ 
      sync: 'wss://sync.automerge.org',
      // Default sharePolicy is 'explicit' (secure)
      // Use sharePolicy: 'all' to share everything openly
    });
  });
</script>

<slot />
