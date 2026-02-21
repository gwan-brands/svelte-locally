# Core Concepts

Understanding the ideas behind svelte-locally.

## Local-First

**Traditional apps**: Your data lives on a server. You need internet to use the app.

**Local-first apps**: Your data lives on YOUR device. The server is just for sync.

| Traditional | Local-First |
|-------------|-------------|
| Server owns data | You own data |
| Needs internet | Works offline |
| Server is authority | Server is relay |
| Account required | Optional identity |

### Why Local-First?

1. **Speed**: No network round-trip for reads/writes
2. **Privacy**: Data stays on your device by default
3. **Reliability**: Works when the server is down
4. **Ownership**: You control your data, not a company

## CRDTs (Conflict-Free Replicated Data Types)

When two people edit the same document offline, what happens when they reconnect?

**Traditional approach**: Last write wins, or manual conflict resolution.

**CRDT approach**: Changes merge automatically. No conflicts.

### How It Works

CRDTs track the *intent* of each change, not just the final value:

```
Device A: "Add item: Buy milk"
Device B: "Add item: Walk dog"

Result: Both items appear. No conflict.
```

Even concurrent edits to the same field merge sensibly:

```
Device A: Changes "Hello" to "Hello World"
Device B: Changes "Hello" to "Hello!"

Result: "Hello World!" (both edits preserved)
```

### Automerge

svelte-locally uses [Automerge](https://automerge.org/), a mature CRDT library. It handles:

- Text editing (character-by-character merge)
- Lists (concurrent inserts/deletes)
- Nested objects
- Counters
- And more

You just call `change()` — Automerge handles the rest.

## Documents vs Collections

### Documents

A **document** is a single unit of data identified by a name:

```typescript
const settings = doc('user-settings', { theme: 'dark' });
const profile = doc('my-profile', { name: '', bio: '' });
```

Good for:
- Single entities (settings, profile, preferences)
- Small to medium data (< 1000 items in arrays)
- Data that's always loaded together

### Collections

A **collection** stores each item as a separate document:

```typescript
const todos = collection<Todo>('todos');
const messages = collection<Message>('chat-messages');
```

Good for:
- Large lists (thousands of items)
- Data that grows over time
- Items that can be loaded independently

### When to Use Which?

| Use Case | Recommendation |
|----------|----------------|
| User settings | `doc()` |
| Shopping cart | `doc()` |
| Todo list (< 100 items) | `doc()` |
| Todo list (> 100 items) | `collection()` |
| Chat messages | `collection()` |
| Blog posts | `collection()` |

## UCAN (User Controlled Authorization Networks)

Traditional auth: Server checks if you're allowed to do something.

UCAN auth: You carry a **token** that proves what you can do.

### How It Works

1. **You have a keypair** (generated automatically, stored on device)
2. **Your keypair has a DID** (Decentralized Identifier) — like a username you don't register
3. **You create tokens** that grant capabilities to yourself or others
4. **Tokens are self-verifying** — no server check needed

### Example Flow

```
1. Alice creates a document
   → She gets a UCAN: "Alice can do anything with doc:abc123"

2. Alice shares with Bob
   → She creates a new UCAN: "Bob can read doc:abc123"
   → This UCAN references Alice's UCAN as proof

3. Bob accesses the document
   → His app verifies the UCAN chain locally
   → No server permission check needed
```

### Why UCAN?

- **Offline-capable**: Verify permissions without a server
- **Delegatable**: Share access by creating child tokens
- **Revocable**: Tokens expire, can be time-limited
- **Decentralized**: No central authority

## Sync Architecture

```
┌─────────────┐     ┌─────────────┐
│  Device A   │     │  Device B   │
│  (IndexedDB)│     │  (IndexedDB)│
└──────┬──────┘     └──────┬──────┘
       │                   │
       │   WebSocket       │
       └───────┬───────────┘
               │
        ┌──────┴──────┐
        │ Sync Relay  │
        │  (optional) │
        └─────────────┘
```

- **Sync relay**: Just forwards messages. Doesn't store data. Doesn't check permissions.
- **BroadcastChannel**: Syncs across tabs in the same browser (no server needed)
- **IndexedDB**: Persists data locally

## Next Steps

- **[API Reference](./api/)** — Complete function documentation
- **[SvelteKit Guide](./guides/sveltekit.md)** — SSR setup
- **[Sharing Guide](./guides/sharing.md)** — Implement sharing with UCAN
