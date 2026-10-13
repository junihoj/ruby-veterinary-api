/**
 * Public API of the Operations context (§6.1). Other modules depend only on this
 * abstract port, bound to the concrete facade with `useExisting` (§3).
 *
 * M1: shape only — methods arrive with the owning context's phase. Schema: operations.
 * Consumers: staff back office only (leaf).
 */

export abstract class OperationsFacadePort {}
