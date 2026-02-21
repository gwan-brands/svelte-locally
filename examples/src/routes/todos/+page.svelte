<script lang="ts">
  import { init, doc, collection, query, identity, type DocResult, type CollectionResult, type Auth, type Role } from 'svelte-locally';
  import { onMount } from 'svelte';

  // ============ Data Types ============

  interface Settings {
    listTitle: string;
  }

  interface Todo {
    text: string;
    done: boolean;
    createdAt: number;
  }

  // ============ State ============

  let settings = $state<DocResult<Settings> | null>(null);
  let todos = $state<CollectionResult<Todo> | null>(null);
  let user = $state<Auth | null>(null);

  // Filter state
  type Filter = 'all' | 'active' | 'done';
  let filter = $state<Filter>('all');

  // Sharing state
  let showShareModal = $state(false);
  let shareToken = $state<string | null>(null);
  let shareRole = $state<Role>('reader');
  let importInput = $state('');
  let importMessage = $state<{ type: 'success' | 'error', text: string } | null>(null);

  // Reactive filtered query
  const filteredTodos = $derived(
    todos ? query(todos)
      .where(todo => {
        if (filter === 'active') return !todo.done;
        if (filter === 'done') return todo.done;
        return true;
      })
      .orderBy('createdAt', 'desc') : { items: [] }
  );

  // ============ Lifecycle ============

  onMount(async () => {
    init({ sync: 'wss://sync.automerge.org' });

    settings = doc<Settings>('todo-settings', {
      listTitle: 'My Todo List',
    });
    todos = collection<Todo>('todos');
    user = await identity();
  });

  // ============ Todo Actions ============

  function addTodo() {
    if (!todos) return;
    const text = prompt('What needs to be done?');
    if (!text) return;

    todos.add({
      text,
      done: false,
      createdAt: Date.now(),
    });
  }

  function toggleTodo(id: string) {
    if (!todos) return;
    const todo = todos.get(id);
    if (todo) {
      todos.update(id, doc => {
        doc.done = !doc.done;
      });
    }
  }

  function deleteTodo(id: string) {
    if (!todos) return;
    todos.remove(id);
  }

  function updateTitle() {
    if (!settings) return;
    const newTitle = prompt('Enter new title:', settings.data?.listTitle);
    if (newTitle) {
      settings.change(doc => {
        doc.listTitle = newTitle;
      });
    }
  }

  // ============ Sharing Actions ============

  async function generateShareToken() {
    if (!settings) return;
    try {
      shareToken = await settings.createToken(shareRole, { expires: '7d' });
    } catch (err) {
      console.error('Failed to create token:', err);
    }
  }

  async function copyShareToken() {
    if (shareToken) {
      await navigator.clipboard.writeText(shareToken);
      alert('Copied to clipboard!');
    }
  }

  function handleImport() {
    if (!user || !importInput.trim()) return;
    
    importMessage = null;
    
    try {
      const result = user.importAccess(importInput.trim());
      if (result) {
        importMessage = { type: 'success', text: `✓ Imported ${result.role} access!` };
        importInput = '';
      } else {
        importMessage = { type: 'error', text: 'Invalid or expired token' };
      }
    } catch (err) {
      importMessage = { type: 'error', text: 'Failed to import token' };
    }
  }

  // ============ Helpers ============

  function formatUserId(id: string): string {
    return id.slice(0, 12) + '...' + id.slice(-6);
  }
</script>

<main>
  <header>
    <a href="/" class="back">← Back</a>
    <h1>📦 svelte-locally</h1>
    <p>Local-first data sync for Svelte</p>
  </header>

  <!-- Status Bar -->
  <section class="status-bar">
    <div class="status-item" class:active={settings?.status.ready && todos?.status.ready}>
      {settings?.status.ready && todos?.status.ready ? '✅ Loaded' : '⏳ Loading...'}
    </div>
    <div class="status-item" class:active={todos?.status.online}>
      {todos?.status.online ? '🌐 Online' : '📴 Offline'}
    </div>
    <div class="status-item">
      📝 {todos?.status.totalCount ?? 0} items
    </div>
    {#if settings?.status.pendingChanges || todos?.status.pendingChanges}
      <div class="status-item pending">
        ⏳ {(settings?.status.pendingChanges ?? 0) + (todos?.status.pendingChanges ?? 0)} pending
      </div>
    {/if}
  </section>

  <!-- User Identity -->
  {#if user}
    <section class="identity">
      <strong>Your ID:</strong>
      <code title={user.id}>{formatUserId(user.id)}</code>
      <button class="share-btn" onclick={() => showShareModal = !showShareModal}>
        {showShareModal ? '✕' : '🔗 Share'}
      </button>
    </section>
  {/if}

  <!-- Share Modal -->
  {#if showShareModal && settings}
    <section class="share-modal">
      <h3>🔗 Share Your Todo List</h3>
      
      <div class="share-row">
        <label>Access level:</label>
        <select bind:value={shareRole}>
          <option value="reader">👁️ Viewer</option>
          <option value="writer">✏️ Editor</option>
          <option value="admin">👑 Admin</option>
        </select>
        <button onclick={generateShareToken}>Generate</button>
      </div>

      {#if shareToken}
        <div class="token-box">
          <code>{shareToken.slice(0, 40)}...</code>
          <button onclick={copyShareToken}>📋</button>
        </div>
        <p class="hint">Share this token with someone to give them {shareRole} access.</p>
      {/if}

      <hr />

      <div class="share-row">
        <input 
          type="text" 
          placeholder="Paste a token to import..."
          bind:value={importInput}
        />
        <button onclick={handleImport}>Import</button>
      </div>

      {#if importMessage}
        <p class={importMessage.type}>{importMessage.text}</p>
      {/if}

      {#if settings.grants.length > 0}
        <div class="grants-section">
          <h4>Granted access ({settings.grants.length}):</h4>
          {#each settings.grants as grant}
            <div class="grant-item">
              <code>{formatUserId(grant.recipientDid)}</code>
              <span class="badge">{grant.role}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <!-- Todo App -->
  {#if settings?.data && todos?.status.ready}
    <section class="todo-app">
      <h2>
        {settings.data.listTitle}
        <button class="edit-title" onclick={updateTitle} title="Edit title">✏️</button>
      </h2>

      <button class="add-button" onclick={addTodo}>+ Add Todo</button>

      <!-- Filter tabs -->
      <div class="filter-tabs">
        <button class:active={filter === 'all'} onclick={() => filter = 'all'}>
          All ({todos?.items.length ?? 0})
        </button>
        <button class:active={filter === 'active'} onclick={() => filter = 'active'}>
          Active ({todos?.items.filter(t => !t.done).length ?? 0})
        </button>
        <button class:active={filter === 'done'} onclick={() => filter = 'done'}>
          Done ({todos?.items.filter(t => t.done).length ?? 0})
        </button>
      </div>

      {#if filteredTodos.items.length === 0}
        <p class="empty-message">
          {#if filter === 'all'}No todos yet. Add one above!
          {:else if filter === 'active'}No active todos.
          {:else}No completed todos.
          {/if}
        </p>
      {:else}
        <ul class="todo-list">
          {#each filteredTodos.items as todo (todo.id)}
            <li class:completed={todo.done}>
              <label>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onchange={() => toggleTodo(todo.id)}
                />
                <span class="todo-text">{todo.text}</span>
              </label>
              <button
                class="delete-button"
                onclick={() => deleteTodo(todo.id)}
                title="Delete"
              >
                ×
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <!-- Sync status -->
      {#if settings.status.lastSyncedAt}
        <p class="sync-time">
          Last synced: {settings.status.lastSyncedAt.toLocaleTimeString()}
        </p>
      {/if}
    </section>

    <!-- Explanation -->
    <section class="explanation">
      <h3>New in v0.2.0: Sharing!</h3>
      <ul>
        <li><strong>Create tokens</strong> — Generate access tokens with different roles</li>
        <li><strong>Share anywhere</strong> — Send tokens via any channel (no server involved)</li>
        <li><strong>Import access</strong> — Paste tokens to gain access to shared docs</li>
        <li><strong>Offline status</strong> — See pending changes and last sync time</li>
      </ul>
    </section>
  {:else}
    <p class="loading-message">Loading your todos...</p>
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
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
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

  .status-item.pending {
    background: #fff3cd;
  }

  .identity {
    background: #e3f2fd;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
    display: flex;
    flex-wrap: wrap;
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
  }

  .share-btn:hover {
    background: #43A047;
  }

  /* Share Modal */
  .share-modal {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    margin-bottom: 1.5rem;
    border: 2px solid #4CAF50;
  }

  .share-modal h3 {
    margin: 0 0 1rem;
  }

  .share-modal h4 {
    margin: 1rem 0 0.5rem;
    font-size: 0.9rem;
    color: #666;
  }

  .share-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .share-row select, .share-row input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 6px;
  }

  .share-row button {
    padding: 0.5rem 1rem;
    background: #2196F3;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .token-box {
    display: flex;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }

  .token-box code {
    flex: 1;
    padding: 0.5rem;
    background: #f5f5f5;
    border-radius: 4px;
    font-size: 0.8rem;
    overflow: hidden;
  }

  .token-box button {
    padding: 0.5rem;
    background: #666;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .hint {
    font-size: 0.85rem;
    color: #666;
    margin: 0.5rem 0;
  }

  .share-modal hr {
    margin: 1rem 0;
    border: none;
    border-top: 1px solid #eee;
  }

  .success { color: #388e3c; font-size: 0.9rem; }
  .error { color: #d32f2f; font-size: 0.9rem; }

  .grants-section {
    margin-top: 1rem;
  }

  .grant-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem;
    background: #f9f9f9;
    border-radius: 4px;
    margin-top: 0.25rem;
    font-size: 0.85rem;
  }

  .badge {
    padding: 0.1rem 0.4rem;
    background: #e3f2fd;
    color: #1976D2;
    border-radius: 8px;
    font-size: 0.75rem;
  }

  /* Todo App */
  .todo-app {
    background: white;
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    margin-bottom: 1.5rem;
  }

  .todo-app h2 {
    margin: 0 0 1rem;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .edit-title {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    opacity: 0.5;
    padding: 0.25rem;
  }

  .edit-title:hover {
    opacity: 1;
  }

  .add-button {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    margin-bottom: 1rem;
  }

  .add-button:hover {
    background: #43A047;
  }

  .filter-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .filter-tabs button {
    flex: 1;
    padding: 0.5rem;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .filter-tabs button.active {
    background: #333;
    color: white;
    border-color: #333;
  }

  .todo-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .todo-list li {
    display: flex;
    align-items: center;
    padding: 0.75rem;
    border-bottom: 1px solid #eee;
    gap: 0.5rem;
  }

  .todo-list li:last-child {
    border-bottom: none;
  }

  .todo-list label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    cursor: pointer;
  }

  .todo-list input[type="checkbox"] {
    width: 1.2rem;
    height: 1.2rem;
    cursor: pointer;
  }

  .todo-list li.completed .todo-text {
    text-decoration: line-through;
    color: #999;
  }

  .delete-button {
    background: none;
    border: none;
    color: #ccc;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0 0.5rem;
    line-height: 1;
  }

  .delete-button:hover {
    color: #f44336;
  }

  .empty-message {
    color: #999;
    text-align: center;
    padding: 2rem;
    font-style: italic;
  }

  .sync-time {
    font-size: 0.8rem;
    color: #999;
    text-align: right;
    margin: 1rem 0 0;
  }

  .explanation {
    background: #e8f5e9;
    padding: 1.5rem;
    border-radius: 12px;
  }

  .explanation h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    color: #2e7d32;
  }

  .explanation ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .explanation li {
    margin: 0.75rem 0;
  }

  .loading-message {
    text-align: center;
    color: #666;
    padding: 3rem;
  }
</style>
