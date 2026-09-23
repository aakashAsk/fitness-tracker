// The one place a feature flag is declared. Firestore (`featureToggle`)
// holds the VALUES; this file holds identity, intent and safe defaults.
// A key in Firestore that is not listed here is ignored; a key listed
// here but absent from Firestore resolves to its default.
import type { FlagDefinition } from './types';

export const FEATURE_FLAGS = {
  // Named as a KILL switch: `enabled: true` means push notifications are
  // DISABLED. Absent everywhere it is false, so notifications stay on.
  disabledPushNotification: {
    key: 'disabledPushNotification',
    description:
      'Kill switch. When enabled=true, ALL notification code is off: the expo-notifications handler, workout/meal reminder scheduling, and the reminder settings UI; reminders already scheduled on the device are cancelled.',
    owner: 'aakash',
    defaultValue: false,
    createdAt: '2026-09-20',
    plannedRemoval: '2026-12-31',
    failMode: 'open',
  },

  // Spelling is the product's, not a typo on our side: "Add" here means
  // the advertisement, not an action. Keys are never renamed once they
  // exist in Firestore — retire and replace instead.
  enabledAddForSubscription: {
    key: 'enabledAddForSubscription',
    description:
      'Shows the subscription advert above the bottom navigation on the dashboard — the "Generate Adaptive Workout with AI" banner, which slides in after 5s and can be dismissed for the session.',
    owner: 'aakash',
    defaultValue: true,
    createdAt: '2026-09-20',
    plannedRemoval: '2026-12-19',
    // 'open' deliberately, against this file's usual rule that a new
    // feature is 'closed'. A closed flag is forced OFF whenever neither
    // Firestore nor the device cache has a value — defaultValue is not
    // consulted at all — which would mean the advert never appeared until
    // a `featureToggle/enabledAddForSubscription` document existed.
    //
    // The risk a closed fail mode protects against is a half-built
    // feature switching itself on when the backend is unreachable. This
    // is a self-contained banner with a dismiss button, so that risk is
    // a banner someone taps away. Set `enabled: false` on the Firestore
    // document to turn it off — a server value still wins over this.
    failMode: 'open',
  },
} as const satisfies Record<string, FlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
