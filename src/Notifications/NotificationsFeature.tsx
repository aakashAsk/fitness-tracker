// Everything that runs while the `notifications` flag is ON. Loaded lazily
// by NotificationsRoot, so expo-notifications is not even evaluated while
// the flag is off.
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from '@firebase/auth';
import * as Notifications from 'expo-notifications';

import { auth } from '../Firebase/firebaseConfig';
import { syncReminders } from '../Services/reminderService';
import { useReminderSync } from '../Store/useReminderSync';

export default function NotificationsFeature() {
  const [signedIn, setSignedIn] = useState(!!auth.currentUser);

  useEffect(() => onAuthStateChanged(auth, user => setSignedIn(!!user)), []);

  // Without a handler, a reminder that arrives while the app is open is
  // delivered silently — the user sees nothing until they background it.
  // Removing the feature (flag flipped off mid-session) must also stop
  // what the OS would otherwise keep firing every week, so unmounting
  // clears the handler and every scheduled reminder.
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    return () => {
      Notifications.setNotificationHandler(null);
      // Goes through the serial queue so it also supersedes a sync that
      // is still in flight.
      syncReminders([]).catch(() => undefined);
    };
  }, []);

  useReminderSync(signedIn);

  return null;
}
