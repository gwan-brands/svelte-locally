/**
 * Grants Storage
 * 
 * Manages access grants (who has access to what documents).
 * Designed for future auto-sync capability - currently stores locally in IndexedDB.
 * 
 * A grant represents permission given to a DID for a specific document.
 */

import type { Role } from './roles';

// ============ Types ============

export interface Grant {
  /** Unique grant ID */
  id: string;
  /** Document URL (automerge:...) */
  docUrl: string;
  /** Recipient DID */
  recipientDid: string;
  /** Granted role */
  role: Role;
  /** When the grant was created */
  grantedAt: number;
  /** When the grant expires (null = never) */
  expiresAt: number | null;
  /** Who granted this (the issuer DID) */
  grantedBy: string;
  /** The encoded UCAN token */
  token: string;
  /** Whether this grant has been revoked */
  revoked: boolean;
}

export interface ReceivedGrant {
  /** Document URL */
  docUrl: string;
  /** Our role */
  role: Role;
  /** Who granted us access */
  fromDid: string;
  /** When we received it */
  receivedAt: number;
  /** When it expires */
  expiresAt: number | null;
  /** The encoded UCAN token */
  token: string;
}

// ============ Storage Keys ============

const GRANTS_ISSUED_KEY = 'svelte-locally:grants:issued';
const GRANTS_RECEIVED_KEY = 'svelte-locally:grants:received';

// ============ Environment Detection ============

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

// ============ Issued Grants (grants we've given to others) ============

/**
 * Store a grant we've issued to someone
 */
export function storeIssuedGrant(grant: Grant): void {
  if (!isBrowser) return;
  
  const grants = getIssuedGrants();
  // Remove any existing grant for same doc+recipient
  const filtered = grants.filter(
    g => !(g.docUrl === grant.docUrl && g.recipientDid === grant.recipientDid)
  );
  filtered.push(grant);
  localStorage.setItem(GRANTS_ISSUED_KEY, JSON.stringify(filtered));
}

/**
 * Get all grants we've issued
 */
export function getIssuedGrants(): Grant[] {
  if (!isBrowser) return [];
  
  try {
    const data = localStorage.getItem(GRANTS_ISSUED_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Get grants for a specific document
 */
export function getGrantsForDoc(docUrl: string): Grant[] {
  return getIssuedGrants().filter(g => g.docUrl === docUrl && !g.revoked);
}

/**
 * Revoke a grant
 */
export function revokeGrant(docUrl: string, recipientDid: string): boolean {
  if (!isBrowser) return false;
  
  const grants = getIssuedGrants();
  let found = false;
  
  const updated = grants.map(g => {
    if (g.docUrl === docUrl && g.recipientDid === recipientDid && !g.revoked) {
      found = true;
      return { ...g, revoked: true };
    }
    return g;
  });
  
  if (found) {
    localStorage.setItem(GRANTS_ISSUED_KEY, JSON.stringify(updated));
  }
  
  return found;
}

// ============ Received Grants (grants others have given to us) ============

/**
 * Store a grant we've received from someone
 */
export function storeReceivedGrant(grant: ReceivedGrant): void {
  if (!isBrowser) return;
  
  const grants = getReceivedGrants();
  // Remove any existing grant for same doc (keep latest)
  const filtered = grants.filter(g => g.docUrl !== grant.docUrl);
  filtered.push(grant);
  localStorage.setItem(GRANTS_RECEIVED_KEY, JSON.stringify(filtered));
}

/**
 * Get all grants we've received
 */
export function getReceivedGrants(): ReceivedGrant[] {
  if (!isBrowser) return [];
  
  try {
    const data = localStorage.getItem(GRANTS_RECEIVED_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Get our grant for a specific document
 */
export function getReceivedGrantForDoc(docUrl: string): ReceivedGrant | null {
  const grants = getReceivedGrants();
  const grant = grants.find(g => g.docUrl === docUrl);
  
  if (grant && grant.expiresAt && grant.expiresAt < Date.now()) {
    // Expired
    return null;
  }
  
  return grant ?? null;
}

/**
 * Check if we have access to a document
 */
export function hasAccessToDoc(docUrl: string): boolean {
  return getReceivedGrantForDoc(docUrl) !== null;
}

/**
 * Get our role for a document
 */
export function getRoleForDoc(docUrl: string): Role | null {
  const grant = getReceivedGrantForDoc(docUrl);
  return grant?.role ?? null;
}

// ============ Clear All ============

export function clearAllGrants(): void {
  if (!isBrowser) return;
  localStorage.removeItem(GRANTS_ISSUED_KEY);
  localStorage.removeItem(GRANTS_RECEIVED_KEY);
}

// ============ ID Generation ============

export function generateGrantId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `grant-${timestamp}-${random}`;
}
