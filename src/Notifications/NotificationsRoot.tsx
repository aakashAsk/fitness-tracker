// The single entry point for notifications, mounted once at the app root.
// Nothing notification-related lives outside the `disabledPushNotification` flag:
// the feature is loaded lazily, and nothing is decided until the flags
// have loaded. While the kill switch is on this renders nothing and the
// expo-notifications module is never imported.
import React, { Suspense } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { useFeatureFlag, useFeatureFlagsReady } from '../FeatureFlags';

// Expo Go (Android) cannot run expo-notifications, and merely importing
// the module there logs an error that no try/catch can suppress. So in
// Expo Go none of the notification code is loaded, whatever the flag says.
// A development or production build is unaffected.
const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const NotificationsFeature = React.lazy(() => import('./NotificationsFeature'));

export function NotificationsRoot() {
  const flagsReady = useFeatureFlagsReady();
  // `disabledPushNotification` is a kill switch: true means OFF.
  const disabled = useFeatureFlag('disabledPushNotification');
  if (!flagsReady || IN_EXPO_GO || disabled) return null;

  return (
    <Suspense fallback={null}>
      <NotificationsFeature />
    </Suspense>
  );
}
