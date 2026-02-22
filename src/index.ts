/**
 * svelte-locally - Local-first data sync for Svelte
 * 
 * Features:
 * - Local-first data with Automerge CRDTs
 * - Decentralized auth with UCAN
 * - Offline-capable, syncs when online
 * - User-owned data
 * 
 * @example
 * ```typescript
 * import { init, doc, identity } from 'svelte-locally';
 * 
 * // Initialize once
 * init({ sync: 'wss://sync.automerge.org' });
 * 
 * // Create/load documents
 * const { data, status, change } = doc('my-todos', { items: [] });
 * 
 * // Get user identity
 * const me = await identity();
 * console.log(me.id); // did:key:z6Mk...
 * 
 * // Share access
 * const token = await me.createToken(doc.url, 'writer', { expires: '7d' });
 * ```
 * 
 * @packageDocumentation
 */

// ============ Core API ============

// Initialization
export { 
  init, 
  getRepo, 
  getConfig, 
  isInitialized,
  type InitConfig 
} from './init.svelte';

// Document API
export { 
  doc, 
  docFromUrl,
  docFromId,  // friendlier alias for docFromUrl
  type DocResult, 
  type DocStatus,
  type DocSubscriber,
  type Unsubscribe,
} from './doc.svelte';

// Collection API (scalable lists)
export {
  collection,
  type CollectionResult,
  type CollectionStatus,
  type CollectionItem,
  type CollectionSubscriber,
} from './collection.svelte';

// Query API (filtering, sorting, limiting)
export {
  query,
  whereEq,
  take,
  sortBy,
  type QueryBuilder,
  type WhereFn,
  type SortDirection,
  type CompareFn,
} from './query.svelte';

// ============ Identity & Auth ============

// Identity (user's cryptographic identity)
export { 
  identity,
  initAuth,
  createAuthState,
  type Auth,
  type CreateTokenOptions,
  type GrantOptions,
} from './auth';

// Roles
export {
  type Role,
  ROLES,
  roleHasCapability,
  roleCanDelegate,
  getCapabilitiesForRole,
} from './auth';

// Grants
export {
  type Grant,
  type ReceivedGrant,
  getGrantsForDoc,
  getReceivedGrants,
  getReceivedGrantForDoc,
  hasAccessToDoc,
  getRoleForDoc,
} from './auth';

// Auth internals (for advanced use)
export {
  // Keypair management
  generateKeypair,
  getOrCreateKeypair,
  publicKeyToDid,
  didToPublicKey,
  sign,
  verify,
  type Keypair,
  
  // UCAN tokens
  createUCAN,
  createOwnerUCAN,
  delegateUCAN,
  decodeUCAN,
  verifyUCAN,
  hasCapability,
  storeUCAN,
  findValidUCAN,
  type UCANToken,
  type Capability,
} from './auth';
