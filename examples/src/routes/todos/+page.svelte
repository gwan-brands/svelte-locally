<script lang="ts">
  import { init, doc, collection, query, identity, type DocResult, type CollectionResult } from 'svelte-locally';
  import { onMount } from 'svelte';

  // ============ Data Types ============

  // Settings stored in a single document
  interface Settings {
    listTitle: string;
  }

  // Todo items stored as a collection (one doc per item)
  interface Todo {
    text: string;
    done: boolean;
    createdAt: number;
  }

  // ============ State ============

  // These will be initialized in onMount (need $state for reactivity)
  let settings = $state<DocResult<Settings> | null>(null);
  let todos = $state<CollectionResult<Todo> | null>(null);

  // Filter state
  type Filter = 'all' | 'active' | 'done';
  let filter = $state<Filter>('all');

  // Reactive filtered query (only when todos is initialized)
  const filteredTodos = $derived(
    todos ? query(todos)
      .where(todo => {
        if (filter === 'active') return !todo.done;
        if (filter === 'done') return todo.done;
        return true;
      })
      .orderBy('createdAt', 'desc') : { items: [] }
  );

  // User identity
  let userId = $state<string | null>(null);

  // ============ Lifecycle ============

  onMount(async () => {
    // Initialize with sync enabled
    init({
      sync: 'wss://sync.automerge.org',
    });

    // Now create doc and collection AFTER init
    settings = doc<Settings>('todo-settings', {
      listTitle: 'My Todo List',
    });
    todos = collection<Todo>('todos');

    // Get user's identity
    const user = await identity();
    userId = user.id;
  });

  // ============ Actions ============

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

  // Format user ID for display
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
  </section>

  <!-- User Identity -->
  {#if userId}
    <section class="identity">
      <strong>Your ID:</strong>
      <code title={userId}>{formatUserId(userId)}</code>
      <small>(auto-generated, stored on your device)</small>
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
    </section>

    <!-- Explanation -->
    <section class="explanation">
      <h3>How it works</h3>
      <ul>
        <li>
          <strong>doc()</strong> — Settings stored in a single document
        </li>
        <li>
          <strong>collection()</strong> — Each todo is a separate document (scales better)
        </li>
        <li>
          <strong>Works offline</strong> — Changes sync when reconnected
        </li>
        <li>
          <strong>No account needed</strong> — Your identity is cryptographic
        </li>
        <li>
          <strong>Conflicts auto-merge</strong> — Edit on two devices, changes combine
        </li>
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
    cursor: help;
  }

  .identity small {
    color: #666;
    width: 100%;
  }

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

  .explanation {
    background: #fff8e1;
    padding: 1.5rem;
    border-radius: 12px;
  }

  .explanation h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }

  .explanation ul {
    margin: 0;
    padding-left: 1.25rem;
  }

  .explanation li {
    margin: 0.75rem 0;
  }

  .explanation strong {
    color: #333;
  }

  .loading-message {
    text-align: center;
    color: #666;
    padding: 3rem;
  }
</style>
