# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-22

### Added

- **Sharing API** with role-based access control
  - `doc.createToken(role, options)` — Create bearer tokens for sharing
  - `doc.grant(did, role)` — Grant access to specific users
  - `doc.revokeGrant(did)` — Revoke access
  - `doc.inviteLink(role)` — Generate shareable URLs
  - `identity.importAccess(token)` — Import received tokens
  - Roles: `reader`, `writer`, `admin`

- **Backup & Restore**
  - `doc.export()` — Export document to binary
  - `importDoc(binary)` — Restore from backup

- **Loading Progress**
  - `status.loadProgress` — 0-100 during initial load

- **Share Policy**
  - `init({ sharePolicy: 'explicit' })` — Only sync shared documents (default)
  - `init({ sharePolicy: 'all' })` — Sync everything (open mode)

- **Offline Status**
  - `status.pendingChanges` — Unsynced local changes count
  - `status.lastSyncedAt` — Timestamp of last sync

- **Document Aliases**
  - `doc.id` — Friendlier than `doc.url`
  - `docFromId()` — Alias for `docFromUrl()`

### Changed

- Default `sharePolicy` is now `'explicit'` (secure by default)
- Parameter naming: `fn` → `modifier` / `predicate` / `compareFn`
- Replaced deprecated `docSync()` with `doc()`

### Fixed

- `$effect` orphan errors when loading documents dynamically
- Graceful fallback when `findWithProgress` unavailable

## [0.1.0] - 2026-02-19

### Added

- **Core APIs**
  - `init(config)` — Initialize with sync server, storage options
  - `doc(id, initial)` — Create/load reactive documents
  - `collection(name)` — Scalable lists with per-item documents
  - `identity()` — User's cryptographic identity (DID)

- **Query API**
  - `query(collection).where().orderBy().limit()`
  - `whereEq()`, `take()`, `sortBy()` convenience functions

- **Status Tracking**
  - `status.ready`, `status.syncing`, `status.online`, `status.error`

- **Subscriptions**
  - `doc.subscribe(callback)` for non-Svelte contexts

- **Document Utilities**
  - `doc.getSize()` — Bytes used
  - `doc.compact()` — Trim history

- **SSR Support**
  - All APIs gracefully handle server-side rendering

- **Error Handling**
  - Automatic retry with exponential backoff
  - `doc.retry()` for manual retry

### Dependencies

- Automerge 2.x with automerge-repo
- UCAN tokens via @ucans/ucans
- Ed25519 crypto via @noble/ed25519
