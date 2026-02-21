<script lang="ts">
  import { init, doc, docFromUrl, identity, type DocResult, type Auth, type Role } from 'svelte-locally';
  import { onMount } from 'svelte';

  // Document structure
  interface Note {
    title: string;
    content: string;
    lastEdited: number;
  }

  // State - which doc to view
  let viewingSharedUrl = $state<string | null>(null);
  let note = $state<DocResult<Note> | null>(null);
  let user = $state<Auth | null>(null);

  // Local editing state
  let titleInput = $state('');
  let contentInput = $state('');
  let isSyncing = $state(false);
  let isEditing = $state(false);

  // Sharing state
  let showSharePanel = $state(false);
  let shareToken = $state<string | null>(null);
  let shareRole = $state<Role>('reader');
  let importToken = $state('');
  let importError = $state<string | null>(null);
  let importSuccess = $state(false);

  onMount(async () => {
    init({ sync: 'wss://sync.automerge.org' });
    
    // Load the default note
    note = doc<Note>('shared-note', {
      title: 'Untitled Note',
      content: '',
      lastEdited: Date.now(),
    });
    
    user = await identity();
  });

  // Watch for URL changes and load appropriate doc
  $effect(() => {
    if (viewingSharedUrl) {
      note = docFromUrl<Note>(viewingSharedUrl);
    }
  });

  // Open a shared document by URL
  function openSharedDoc(docUrl: string) {
    viewingSharedUrl = docUrl;
    showSharePanel = false;
    isEditing = false;
    titleInput = '';
    contentInput = '';
  }

  // Go back to own document
  function openOwnDoc() {
    viewingSharedUrl = null;
    note = doc<Note>('shared-note', {
      title: 'Untitled Note',
      content: '',
      lastEdited: Date.now(),
    });
  }

  // Sync remote changes to local state
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

  // Sharing functions
  async function createShareToken() {
    if (!note) return;
    try {
      shareToken = await note.createToken(shareRole, { expires: '7d' });
    } catch (err) {
      console.error('Failed to create share token:', err);
    }
  }

  async function copyToken() {
    if (shareToken) {
      await navigator.clipboard.writeText(shareToken);
      alert('Token copied to clipboard!');
    }
  }

  function handleImportToken() {
    if (!user || !importToken.trim()) return;
    
    importError = null;
    importSuccess = false;
    
    try {
      const result = user.importAccess(importToken.trim());
      if (result) {
        importSuccess = true;
        importToken = '';
        setTimeout(() => { importSuccess = false; }, 3000);
      } else {
        importError = 'Invalid or expired token';
      }
    } catch (err) {
      importError = err instanceof Error ? err.message : 'Failed to import token';
    }
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
    <p>Real-time sync with sharing controls</p>
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
    {#if note?.status.pendingChanges}
      <div class="status-item pending">
        {note.status.pendingChanges} pending
      </div>
    {/if}
  </section>

  <!-- User Identity -->
  {#if user}
    <section class="identity">
      <strong>Your ID:</strong>
      <code title={user.id}>{formatUserId(user.id)}</code>
      <button class="share-btn" onclick={() => showSharePanel = !showSharePanel}>
        {showSharePanel ? '✕ Close' : '🔗 Share'}
      </button>
    </section>
  {/if}

  <!-- Share Panel -->
  {#if showSharePanel && note}
    <section class="share-panel">
      <h3>🔗 Share This Document</h3>
      
      <!-- Create Token -->
      <div class="share-section">
        <h4>Create Share Token</h4>
        <div class="share-controls">
          <select bind:value={shareRole}>
            <option value="reader">👁️ Reader (view only)</option>
            <option value="writer">✏️ Writer (can edit)</option>
            <option value="admin">👑 Admin (full control)</option>
          </select>
          <button onclick={createShareToken}>Generate Token</button>
        </div>
        
        {#if shareToken}
          <div class="token-display">
            <code>{shareToken.slice(0, 50)}...</code>
            <button onclick={copyToken}>📋 Copy</button>
          </div>
          <p class="token-hint">Send this token to someone to grant them {shareRole} access.</p>
        {/if}
      </div>

      <!-- Import Token -->
      <div class="share-section">
        <h4>Import Access Token</h4>
        <div class="import-controls">
          <input 
            type="text" 
            placeholder="Paste token here..."
            bind:value={importToken}
          />
          <button onclick={handleImportToken}>Import</button>
        </div>
        {#if importError}
          <p class="error">{importError}</p>
        {/if}
        {#if importSuccess}
          <p class="success">✓ Access imported successfully!</p>
        {/if}
      </div>

      <!-- Current Grants -->
      <div class="share-section">
        <h4>Access Grants ({note.grants.length})</h4>
        {#if note.grants.length === 0}
          <p class="no-grants">No access granted yet.</p>
        {:else}
          <ul class="grants-list">
            {#each note.grants as grant}
              <li>
                <code>{formatUserId(grant.recipientDid)}</code>
                <span class="role-badge">{grant.role}</span>
                {#if grant.expiresAt}
                  <span class="expires">expires {new Date(grant.expiresAt).toLocaleDateString()}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Your Received Access -->
      {#if user && user.accessTokens.length > 0}
        <div class="share-section">
          <h4>Your Received Access</h4>
          <ul class="grants-list">
            {#each user.accessTokens as access}
              <li>
                <code title={access.docUrl}>{access.docUrl.slice(0, 20)}...</code>
                <span class="role-badge">{access.role}</span>
                <span class="from">from {formatUserId(access.fromDid)}</span>
                <button class="open-btn" onclick={() => openSharedDoc(access.docUrl)}>
                  Open →
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/if}

  <!-- Document Switcher (when viewing shared doc) -->
  {#if currentDocName !== 'shared-note'}
    <section class="doc-switcher">
      <span>Viewing shared document</span>
      <button onclick={openOwnDoc}>← Back to my note</button>
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
        {#if note.status.lastSyncedAt}
          · Synced: {formatTime(note.status.lastSyncedAt.getTime())}
        {/if}
      </div>
    </section>

    <!-- Instructions -->
    <section class="instructions">
      <h3>How sharing works:</h3>
      <ol>
        <li><strong>Create a token</strong> — Choose a role and generate</li>
        <li><strong>Send the token</strong> — Copy and send via any channel</li>
        <li><strong>Recipient imports</strong> — They paste and import</li>
        <li><strong>Access granted!</strong> — They can now view/edit</li>
      </ol>
      <p class="note">
        💡 Tokens are <strong>self-contained</strong> — no server stores who has access.
        The recipient proves access with the token itself (UCAN).
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

  .status-item.pending {
    background: #ffcdd2;
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

  .share-btn {
    margin-left: auto;
    padding: 0.4rem 0.8rem;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .share-btn:hover {
    background: #43A047;
  }

  /* Share Panel */
  .share-panel {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    margin-bottom: 1.5rem;
    border: 2px solid #4CAF50;
  }

  .share-panel h3 {
    margin: 0 0 1rem;
    font-size: 1.2rem;
  }

  .share-section {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #eee;
  }

  .share-section:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  .share-section h4 {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
    color: #666;
  }

  .share-controls, .import-controls {
    display: flex;
    gap: 0.5rem;
  }

  .share-controls select, .import-controls input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .share-controls button, .import-controls button {
    padding: 0.5rem 1rem;
    background: #2196F3;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .share-controls button:hover, .import-controls button:hover {
    background: #1976D2;
  }

  .token-display {
    margin-top: 0.75rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .token-display code {
    flex: 1;
    padding: 0.5rem;
    background: #f5f5f5;
    border-radius: 4px;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .token-display button {
    padding: 0.4rem 0.8rem;
    background: #666;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .token-hint {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
    color: #666;
  }

  .error {
    color: #d32f2f;
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
  }

  .success {
    color: #388e3c;
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
  }

  .no-grants {
    color: #999;
    font-style: italic;
    margin: 0;
  }

  .grants-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .grants-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #f9f9f9;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }

  .grants-list code {
    background: rgba(0,0,0,0.1);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
  }

  .role-badge {
    padding: 0.15rem 0.5rem;
    background: #e3f2fd;
    color: #1976D2;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .expires, .from {
    color: #999;
    font-size: 0.8rem;
  }

  .open-btn {
    margin-left: auto;
    padding: 0.25rem 0.5rem;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .open-btn:hover {
    background: #43A047;
  }

  .doc-switcher {
    background: #fff3cd;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.9rem;
  }

  .doc-switcher button {
    padding: 0.4rem 0.8rem;
    background: #666;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .doc-switcher button:hover {
    background: #555;
  }

  /* Editor */
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

  .loading {
    text-align: center;
    color: #666;
    padding: 3rem;
  }
</style>
