import { Dumbbell, Building2 } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { WeekDay } from './WeekStrip';
import { UpcomingItem } from './UpcomingCard';

export const weekDays: WeekDay[] = [
  { label: 'MON', dayNumber: 31, dotCount: 2 },
  { label: 'TUE', dayNumber: 1, dotCount: 2 },
  { label: 'WED', dayNumber: 2, dotCount: 1 },
  { label: 'THU', dayNumber: 3, dotCount: 3, isActive: true },
  { label: 'FRI', dayNumber: 4, dotCount: 2 },
  { label: 'SAT', dayNumber: 5, dotCount: 2 },
  { label: 'SUN', dayNumber: 6, dotCount: 1 },
];

export const upcomingItems: UpcomingItem[] = [
  {
    id: 'gym-session',
    icon: Building2,
    iconColor: colors.gym,
    iconBg: withOpacity(colors.gym, 0.15),
    timeLabel: '6:00 PM',
    title: 'Gym Session',
    meta: 'Downtown Locker #42',
    footer: 'Starts in 6h 18m',
    footerColor: colors.onSurfaceVariant,
  },
  {
    id: 'push-day',
    icon: Dumbbell,
    iconColor: colors.onPrimaryFixed,
    iconBg: colors.primaryContainer,
    timeLabel: '6:15 PM - 60m',
    title: 'Push Day: Hypertrophy',
    meta: '5 exercises planned',
    footer: 'HIGH INTENSITY',
    footerColor: colors.primaryContainer,
  },
];
