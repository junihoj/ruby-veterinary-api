/**
 * Public API of the Identity context (§6.1). Other modules depend only on this
 * abstract port, bound to the concrete facade with `useExisting` (§3).
 *
 * M1: shape only — methods (getUserById, resolveRoles, ...) arrive with Phase 2
 * (register/login/refresh/logout/me). Consumers: care-coordination,
 * care-messaging, operations.
 */

export abstract class IdentityFacadePort {}
