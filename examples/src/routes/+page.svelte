<script lang="ts">
</script>

<main>
  <header>
    <h1>📦 svelte-locally</h1>
    <p>Local-first data with Svelte</p>
  </header>

  <section class="demos">
    <a href="/todos" class="demo-card">
      <span class="icon">✅</span>
      <h2>Todo List</h2>
      <p>Collection API demo — each todo is a separate document that syncs independently.</p>
    </a>

    <a href="/editor" class="demo-card">
      <span class="icon">📝</span>
      <h2>Collaborative Editor</h2>
      <p>Real-time text editing — open two tabs and watch changes sync character-by-character.</p>
    </a>
  </section>

  <section class="info">
    <h3>What is this?</h3>
    <p>
      <strong>svelte-locally</strong> is a local-first data library for Svelte. 
      Your data lives on your device, works offline, and syncs automatically when connected.
    </p>
    <ul>
      <li>No account required — cryptographic identity</li>
      <li>Works offline — sync when reconnected</li>
      <li>Conflicts auto-merge — no "last write wins"</li>
      <li>Open two tabs — see real-time sync</li>
    </ul>
  </section>
</main>

<style>
  :global(body) {
    font-family: system-ui, -apple-system, sans-serif;
    background: #f5f5f5;
    color: #333;
    margin: 0;
    padding: 0;
    line-height: 1.5;
  }

  main {
    max-width: 700px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
  }

  header h1 {
    margin: 0 0 0.5rem;
    font-size: 2.5rem;
  }

  header p {
    margin: 0;
    color: #666;
    font-size: 1.1rem;
  }

  .demos {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .demo-card {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .demo-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  }

  .demo-card .icon {
    font-size: 2.5rem;
    display: block;
    margin-bottom: 0.5rem;
  }

  .demo-card h2 {
    margin: 0 0 0.5rem;
    font-size: 1.3rem;
  }

  .demo-card p {
    margin: 0;
    color: #666;
    font-size: 0.95rem;
  }

  .info {
    background: #e8f4fd;
    padding: 1.5rem;
    border-radius: 12px;
  }

  .info h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }

  .info p {
    margin: 0 0 1rem;
  }

  .info ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .info li {
    margin: 0.5rem 0;
  }
</style>
