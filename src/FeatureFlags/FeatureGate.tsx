import React from 'react';

import type { FeatureFlagKey } from './registry';
import { useFeatureFlag } from './useFeatureFlag';

interface FeatureGateProps {
  flag: FeatureFlagKey;
  /** Shown instead of the children when the flag is off. Defaults to nothing. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Children are not mounted at all while the flag is off — not merely
 * hidden — so no effect runs and no listener inside them starts.
 */
export function FeatureGate({ flag, fallback = null, children }: FeatureGateProps) {
  const enabled = useFeatureFlag(flag);
  return <>{enabled ? children : fallback}</>;
}
