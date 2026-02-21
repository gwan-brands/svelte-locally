# API Reference

Complete documentation for all svelte-locally functions.

## Core

| Function | Description |
|----------|-------------|
| [`init()`](./init.md) | Initialize the library |
| [`doc()`](./doc.md) | Create/load a document |
| [`collection()`](./collection.md) | Create/load a scalable collection |
| [`query()`](./query.md) | Filter and sort collections |

## Auth

| Function | Description |
|----------|-------------|
| [`identity()`](./auth.md) | Get user's cryptographic identity |
| [`createAuthState()`](./auth.md#createauthstate) | Svelte-friendly reactive auth |

## Quick Reference

```typescript
import { 
  // Core
  init,
  doc,
  collection,
  query,
  
  // Auth
  identity,
  createAuthState,
  
  // Query helpers
  whereEq,
  take,
  sortBy,
} from 'svelte-locally';
```
