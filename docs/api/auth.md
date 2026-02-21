# Auth API

Decentralized identity and authorization with UCAN tokens.

## Overview

Every user gets a cryptographic identity stored on their device:
- **Keypair** — Ed25519 public/private keys
- **DID** — Decentralized Identifier (like `did:key:z6Mk...`)
- **UCAN tokens** — Capability tokens for authorization

No server, no account creation, no passwords.

## identity()

Get the user's identity. Creates one automatically if it doesn't exist.

```typescript
import { identity } from 'svelte-locally';

const user = await identity();

console.log(user.id);  // did:key:z6MkhaXgBZD...
```

### Returns: Auth

```typescript
interface Auth {
  /** User's DID (public identifier) */
  id: string;
  
  /** Full keypair (includes private key) */
  keypair: Keypair;
  
  /** Check if user has a capability */
  can: (action: string, resourceId: string) => Promise<boolean>;
  
  /** Get UCAN token for a resource */
  getToken: (resourceId: string) => Promise<UCANToken | null>;
  
  /** Create owner UCAN for a new resource */
  createDocToken: (resourceId: string) => Promise<UCANToken>;
  
  /** Delegate access to another user */
  share: (resourceId: string, recipientDid: string, permission: 'read' | 'write' | 'admin') => Promise<UCANToken>;
  
  /** Import a UCAN someone shared with you */
  importToken: (encoded: string) => UCANToken | null;
  
  /** Reset identity (generates new keypair) */
  reset: () => Promise<void>;
}
```

## createAuthState()

Svelte-friendly reactive auth state. Safe for SSR.

```svelte
<script>
  import { createAuthState } from 'svelte-locally';
  
  const auth = createAuthState();
  
  // Initialize on mount (skips during SSR)
  $effect(() => {
    auth.init();
  });
</script>

{#if auth.loading}
  <p>Loading identity...</p>
{:else if auth.error}
  <p>Error: {auth.error}</p>
{:else}
  <p>Logged in as: {auth.id}</p>
{/if}
```

### Returns

```typescript
{
  /** Full Auth object (null until loaded) */
  auth: Auth | null;
  
  /** Loading state */
  loading: boolean;
  
  /** Error message or null */
  error: string | null;
  
  /** User's DID (shortcut for auth?.id) */
  id: string | null;
  
  /** Whether running in browser */
  isBrowser: boolean;
  
  /** Initialize auth (call in $effect) */
  init: () => Promise<void>;
  
  /** Reset identity */
  reset: () => Promise<void>;
}
```

## Examples

### Display User ID

```svelte
<script>
  import { createAuthState } from 'svelte-locally';
  
  const auth = createAuthState();
  
  $effect(() => {
    auth.init();
  });
  
  // Shorten DID for display
  function shortId(did: string) {
    return did.slice(0, 20) + '...' + did.slice(-6);
  }
</script>

{#if auth.id}
  <p>Your ID: {shortId(auth.id)}</p>
  <button onclick={() => navigator.clipboard.writeText(auth.id)}>
    Copy
  </button>
{/if}
```

### Check Permissions

```typescript
const user = await identity();

// Check if user can write to a document
if (await user.can('doc/write', documentId)) {
  // Allow editing
}
```

### Create Owner Token

When you create a document, create an owner UCAN:

```typescript
const user = await identity();
const doc = doc('my-doc', { content: '' });

// Create owner UCAN after doc is ready
if (doc.url) {
  await user.createDocToken(doc.url);
}
```

### Share Access

```typescript
const user = await identity();

// Share read access with another user
const token = await user.share(
  documentId,
  'did:key:z6MkRecipient...',  // Their DID
  'read'  // Permission level
);

// Give them the encoded token
const encoded = token.encoded;  // Base64 string they can import
```

### Import Shared Token

```typescript
const user = await identity();

// Import a token someone shared with you
const token = user.importToken(encodedToken);

if (token) {
  console.log('Access granted to:', token.capabilities);
}
```

## Permission Levels

| Level | Capabilities |
|-------|--------------|
| `read` | `doc/read` |
| `write` | `doc/read`, `doc/write` |
| `admin` | `doc/read`, `doc/write`, `doc/share` |

## DIDs Explained

A DID (Decentralized Identifier) is like a username you don't register:

```
did:key:z6MkhaXgBZDvotDUGRCh8Cc8VpL8qYBJ...
│   │   └─ Base58-encoded public key
│   └───── Method (key = derived from key)
└───────── Scheme (decentralized identifier)
```

- Generated from your cryptographic keypair
- Globally unique without a registry
- You control it (no one can take it)

## UCAN Explained

UCAN (User Controlled Authorization Networks) tokens are like permission slips:

```
┌─────────────────────────────────┐
│ UCAN Token                      │
├─────────────────────────────────┤
│ Issuer: did:key:zAlice...       │ ← Who created it
│ Audience: did:key:zBob...       │ ← Who it's for
│ Capabilities:                   │
│   - doc:abc123 can doc/read     │ ← What they can do
│   - doc:abc123 can doc/write    │
│ Expires: 2024-01-01             │ ← When it expires
│ Proof: [parent UCAN]            │ ← Chain of authority
└─────────────────────────────────┘
```

- Self-verifying (no server check needed)
- Delegatable (Alice → Bob → Charlie)
- Time-limited
- Revocable

## Related

- [Core Concepts: UCAN](../core-concepts.md#ucan-user-controlled-authorization-networks)
- [Sharing Guide](../guides/sharing.md)
