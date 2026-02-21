/**
 * Role-based access control
 * 
 * Maps roles to capabilities for UCAN-based authorization.
 */

export type Role = 'reader' | 'writer' | 'admin';

export interface RoleDefinition {
  can: string[];
  canDelegate: Role[];
}

/**
 * Role hierarchy and capabilities
 */
export const ROLES: Record<Role, RoleDefinition> = {
  reader: {
    can: ['read'],
    canDelegate: [],
  },
  writer: {
    can: ['read', 'write'],
    canDelegate: [],
  },
  admin: {
    can: ['read', 'write', 'delegate'],
    canDelegate: ['reader', 'writer', 'admin'],
  },
};

/**
 * Check if a role has a specific capability
 */
export function roleHasCapability(role: Role, capability: string): boolean {
  return ROLES[role].can.includes(capability) || ROLES[role].can.includes('*');
}

/**
 * Check if a role can delegate to another role
 */
export function roleCanDelegate(role: Role, targetRole: Role): boolean {
  return ROLES[role].canDelegate.includes(targetRole);
}

/**
 * Get the minimum role required for a capability
 */
export function minRoleForCapability(capability: string): Role | null {
  if (capability === 'read') return 'reader';
  if (capability === 'write') return 'writer';
  if (capability === 'delegate') return 'admin';
  return null;
}

/**
 * Get capabilities for a role
 */
export function getCapabilitiesForRole(role: Role): string[] {
  return [...ROLES[role].can];
}
