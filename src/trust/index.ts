/**
 * Trust Module - Exports
 *
 * Provides trust-based confirmation tiers, policy engine, and status tracking.
 */

// Core types
export {
  ConfirmationTier,
  TrustProfile,
  TrustSource,
  ActionRisk,
  ConfirmationEstimates,
  TrustThresholds,
  KDepthConfig,
  ConfirmationConfig,
  DEFAULT_CONFIRMATION_CONFIG,
  getRequiredTier,
  getKDepth,
  estimateConfirmationTimes,
  TIER_NAMES,
  TIER_DESCRIPTIONS,
} from './types';

// Confirmation tracker
export {
  TrackedTx,
  ConfirmationEvents,
  ConfirmationTracker,
} from './confirmationTracker';

// Policy engine
export {
  ValueThresholds,
  PolicyRule,
  TrustPolicy,
  PolicyContext,
  PolicyResult,
  PolicyEngine,
  POLICIES,
  BALANCED_POLICY,
  CONSERVATIVE_POLICY,
  AGGRESSIVE_POLICY,
} from './policy';

// Status service
export {
  TxStatus,
  BatchStatusRequest,
  BatchStatusResponse,
  StatusServiceConfig,
  DEFAULT_STATUS_CONFIG,
  StatusService,
  formatStatusResponse,
} from './status';
