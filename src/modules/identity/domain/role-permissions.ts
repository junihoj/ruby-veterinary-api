/**
 * Additive role → permission map (ADR-0011). Roles accumulate; permissions
 * are the coarse grants staff routes check via @Requires. The `client` role
 * carries no staff permissions. This map is the single source for the
 * `permissions` claim in access tokens.
 */
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  client: [],
  receptionist: ['ops:read'],
  veterinarian: ['rx:review'],
  vet_technician: [],
  // Catalog maintenance (commerce.yaml admin products; shop-manager parity).
  practice_manager: ['ops:read', 'ops:inbox', 'rx:review', 'catalog:write'],
} as const;

export function permissionsForRoles(roles: readonly string[]): string[] {
  const permissions = new Set<string>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      permissions.add(permission);
    }
  }
  return [...permissions];
}
