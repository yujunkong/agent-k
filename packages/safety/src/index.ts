/**
 * @agent-k/safety — Permission / deny / secrets / checkpoint / hooks / verification.
 *
 * Feature IDs:
 * - SAFE-001 PermissionGate
 * - SAFE-002 denyGlobs (isPathDenied)
 * - SAFE-003 terminalDenyPatterns
 * - SAFE-004 writeGate (canWrite)
 * - SAFE-005 SecretsVault + InMemorySecretsVault
 * - SAFE-006 CheckpointManager
 * - SAFE-007 VerificationFirst policy
 * - SAFE-008 VerificationMicroLoop
 * - SAFE-009 RelatedTestRunner + StubRelatedTestRunner
 * - SAFE-010 HooksSystem
 *
 * Depends on @agent-k/shared only (not @agent-k/core — cycle avoidance).
 */

export * from './types';
export * from './denyGlobs';
export * from './terminalDenyPatterns';
export * from './PermissionGate';
export * from './writeGate';
export * from './SecretsVault';
export * from './CheckpointManager';
export * from './VerificationFirst';
export * from './VerificationMicroLoop';
export * from './RelatedTestRunner';
export * from './HooksSystem';
