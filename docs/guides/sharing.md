# Sharing Documents

Share documents with other users using UCAN tokens.

## Overview

Sharing in svelte-locally works differently from traditional apps:

| Traditional | svelte-locally |
|-------------|----------------|
| Server checks permissions | Client verifies tokens |
| Centralized access control | Decentralized capabilities |
| Server stores ACLs | Users carry tokens |

## Basic Sharing Flow

```
1. Alice creates a document
   └─► Alice gets owner UCAN

2. Alice shares with Bob
   └─► Alice creates delegated UCAN for Bob

3. Bob imports the token
   └─► Bob can now access the document

4. Sync happens peer-to-peer
   └─► No server permission check needed
```

## Implementation

### Step 1: Create Document with Owner Token

```svelte
<script>
  import { doc, createAuthState } from 'svelte-locally';
  
  const auth = createAuthState();
  const myDoc = doc('shared-notes', { content: '' });
  
  $effect(() => {
    auth.init();
  });
  
  // Create owner UCAN when doc is ready
  $effect(() => {
    if (auth.auth && myDoc.url) {
      auth.auth.createDocToken(myDoc.url);
    }
  });
</script>
```

### Step 2: Generate Share Link

```svelte
<script>
  import { doc, createAuthState } from 'svelte-locally';
  
  const auth = createAuthState();
  const myDoc = doc('shared-notes', { content: '' });
  
  let shareLink = $state('');
  
  async function shareWithAnyone() {
    if (!auth.auth || !myDoc.url) return;
    
    // Create a read-only token (no specific recipient)
    // In production, you'd share with a specific DID
    const token = await auth.auth.share(
      myDoc.url,
      'did:key:*',  // Public share (anyone with link)
      'read'
    );
    
    // Create shareable link
    const params = new URLSearchParams({
      doc: myDoc.url,
      token: token.encoded,
    });
    
    shareLink = `${window.location.origin}/shared?${params}`;
  }
</script>

<button onclick={shareWithAnyone}>Generate Share Link</button>

{#if shareLink}
  <input type="text" readonly value={shareLink} />
  <button onclick={() => navigator.clipboard.writeText(shareLink)}>
    Copy
  </button>
{/if}
```

### Step 3: Open Shared Document

```svelte
<!-- src/routes/shared/+page.svelte -->
<script>
  import { docFromUrl, createAuthState } from 'svelte-locally';
  import { page } from '$app/stores';
  
  const auth = createAuthState();
  
  $effect(() => {
    auth.init();
  });
  
  // Get doc URL and token from query params
  const docUrl = $derived($page.url.searchParams.get('doc'));
  const token = $derived($page.url.searchParams.get('token'));
  
  // Import the shared token
  $effect(() => {
    if (auth.auth && token) {
      auth.auth.importToken(token);
    }
  });
  
  // Load the shared document
  const sharedDoc = $derived(
    docUrl ? docFromUrl(docUrl) : null
  );
</script>

{#if !docUrl}
  <p>Invalid share link</p>
{:else if !sharedDoc?.status.ready}
  <p>Loading shared document...</p>
{:else}
  <div>
    <h1>Shared Document</h1>
    <pre>{JSON.stringify(sharedDoc.data, null, 2)}</pre>
  </div>
{/if}
```

## Permission Levels

### Read Only

```typescript
await auth.share(docUrl, recipientDid, 'read');
// Recipient can: view document
// Recipient cannot: edit, share
```

### Read + Write

```typescript
await auth.share(docUrl, recipientDid, 'write');
// Recipient can: view, edit
// Recipient cannot: share with others
```

### Full Access (Admin)

```typescript
await auth.share(docUrl, recipientDid, 'admin');
// Recipient can: view, edit, share with others
```

## Checking Permissions

```svelte
<script>
  const auth = createAuthState();
  const docUrl = '...';
  
  let canWrite = $state(false);
  
  $effect(() => {
    if (auth.auth) {
      auth.auth.can('doc/write', docUrl).then(result => {
        canWrite = result;
      });
    }
  });
</script>

{#if canWrite}
  <button onclick={saveChanges}>Save</button>
{:else}
  <p>Read-only access</p>
{/if}
```

## Sharing with Specific Users

To share with a specific user, you need their DID:

```svelte
<script>
  let recipientDid = $state('');
  
  async function shareWithUser() {
    if (!recipientDid.startsWith('did:key:')) {
      alert('Invalid DID');
      return;
    }
    
    const token = await auth.auth.share(
      myDoc.url,
      recipientDid,
      'write'
    );
    
    // Send token to recipient (email, message, etc.)
    console.log('Share this token:', token.encoded);
  }
</script>

<input 
  bind:value={recipientDid}
  placeholder="did:key:z6Mk..."
/>
<button onclick={shareWithUser}>Share</button>
```

## Revoking Access

UCAN tokens can't be revoked directly, but you can:

1. **Use short expiration times**
   ```typescript
   // Token expires in 1 hour
   await auth.share(docUrl, recipientDid, 'read', { expiresIn: 3600 });
   ```

2. **Create a new document** and migrate data
   ```typescript
   const newDoc = doc('notes-v2', oldDoc.data);
   // Only share new doc with intended recipients
   ```

3. **Use a revocation service** (advanced, requires server)

## Security Considerations

1. **Tokens are bearer credentials** — anyone with the token has access
2. **Share over secure channels** — HTTPS, encrypted messaging
3. **Use short expirations** for sensitive documents
4. **Validate DIDs** before sharing with specific users

## Related

- [Auth API](../api/auth.md)
- [Core Concepts: UCAN](../core-concepts.md#ucan-user-controlled-authorization-networks)
