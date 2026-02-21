<script lang="ts">
  import { init, doc, identity, type DocResult } from 'svelte-locally';
  import { onMount } from 'svelte';

  // Document structure
  interface Note {
    title: string;
    content: string;
    lastEdited: number;
  }

  // State
  let note = $state<DocResult<Note> | null>(null);
  let userId = $state<string | null>(null);

  // Local editing state
  let titleInput = $state('');
  let contentInput = $state('');
  let isSyncing = $state(false);

  // Track if we're currently editing (to avoid overwriting user input)
  let isEditing = $state(false);

  onMount(async () => {
    // Initialize with sync
    init({
      sync: 'wss://sync.automerge.org',
    });

    // Create or load the shared note
    note = doc<Note>('shared-note', {
      title: 'Untitled Note',
      content: '',
      lastEdited: Date.now(),
    });

    // Get user identity
    const user = await identity();
    userId = user.id;
  });

  // Sync remote changes to local state (top-level $effect)
  $effect(() => {
    if (note?.data && !isEditing) {
      titleInput = note.data.title;
      contentInput = note.data.content;
    }
  });

  // Debounced save
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleTitleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    titleInput = target.value;
    isEditing = true;
    debouncedSave();
  }

  function handleContentChange(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    contentInput = target.value;
    isEditing = true;
    debouncedSave();
  }

  function debouncedSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    isSyncing = true;

    saveTimeout = setTimeout(() => {
      if (note) {
        note.change(doc => {
          doc.title = titleInput;
          doc.content = contentInput;
          doc.lastEdited = Date.now();
        });
      }
      isSyncing = false;
      isEditing = false;
    }, 50);
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  function formatUserId(id: string): string {
    return id.slice(0, 8) + '...' + id.slice(-4);
  }
</script>

<main>
  <header>
    <a href="/" class="back">← Back</a>
    <h1>📝 Collaborative Editor</h1>
    <p>Open this page in two tabs — edits sync in real-time</p>
  </header>

  <!-- Status Bar -->
  <section class="status-bar">
    <div class="status-item" class:active={note?.status.ready}>
      {note?.status.ready ? '✅ Loaded' : '⏳ Loading...'}
    </div>
    <div class="status-item" class:active={note?.status.online}>
      {note?.status.online ? '🌐 Online' : '📴 Offline'}
    </div>
    <div class="status-item" class:syncing={isSyncing}>
      {isSyncing ? '💾 Saving...' : '✓ Saved'}
    </div>
  </section>

  <!-- User Identity -->
  {#if userId}
    <section class="identity">
      <strong>Your ID:</strong>
      <code title={userId}>{formatUserId(userId)}</code>
    </section>
  {/if}

  <!-- Editor -->
  {#if note?.data}
    <section class="editor">
      <input
        type="text"
        class="title-input"
        value={titleInput}
        oninput={handleTitleChange}
        placeholder="Note title..."
      />

      <textarea
        class="content-input"
        value={contentInput}
        oninput={handleContentChange}
        placeholder="Start typing..."
        rows="15"
      ></textarea>

      <div class="meta">
        Last edited: {formatTime(note.data.lastEdited)}
      </div>
    </section>

    <!-- Instructions -->
    <section class="instructions">
      <h3>Try this:</h3>
      <ol>
        <li>Open this page in a <strong>second browser tab</strong></li>
        <li>Type something in one tab</li>
        <li>Watch it appear in the other tab instantly</li>
        <li>Try editing <strong>both tabs at once</strong> — changes merge automatically!</li>
      </ol>
      <p class="note">
        💡 The sync happens through <code>wss://sync.automerge.org</code> —
        a public relay server. Your data is end-to-end encrypted.
      </p>
    </section>
  {:else}
    <p class="loading">Loading editor...</p>
  {/if}
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
    margin-bottom: 1.5rem;
  }

  .back {
    display: inline-block;
    margin-bottom: 1rem;
    color: #666;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back:hover {
    color: #333;
  }

  header h1 {
    margin: 0 0 0.5rem;
    font-size: 2rem;
  }

  header p {
    margin: 0;
    color: #666;
  }

  .status-bar {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .status-item {
    padding: 0.5rem 1rem;
    background: #e0e0e0;
    border-radius: 20px;
    font-size: 0.9rem;
  }

  .status-item.active {
    background: #c8e6c9;
  }

  .status-item.syncing {
    background: #fff3cd;
  }

  .identity {
    background: #e3f2fd;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .identity code {
    background: rgba(0,0,0,0.1);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .editor {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    margin-bottom: 1.5rem;
  }

  .title-input {
    width: 100%;
    padding: 0.75rem;
    font-size: 1.5rem;
    font-weight: bold;
    border: none;
    border-bottom: 2px solid #eee;
    margin-bottom: 1rem;
    outline: none;
    background: transparent;
  }

  .title-input:focus {
    border-bottom-color: #4CAF50;
  }

  .content-input {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: none;
    outline: none;
    resize: vertical;
    min-height: 300px;
    font-family: inherit;
    line-height: 1.6;
    background: transparent;
  }

  .content-input:focus {
    background: #fafafa;
  }

  .meta {
    font-size: 0.85rem;
    color: #999;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }

  .instructions {
    background: #fff8e1;
    padding: 1.5rem;
    border-radius: 12px;
  }

  .instructions h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }

  .instructions ol {
    margin: 0 0 1rem;
    padding-left: 1.25rem;
  }

  .instructions li {
    margin: 0.5rem 0;
  }

  .instructions .note {
    margin: 0;
    font-size: 0.9rem;
    color: #666;
  }

  .instructions code {
    background: rgba(0,0,0,0.1);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.85rem;
  }

  .loading {
    text-align: center;
    color: #666;
    padding: 3rem;
  }
</style>
