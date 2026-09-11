import { Dumbbell, Coffee, Droplet, Wind, Building2, Utensils } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { WeekDay } from './WeekStrip';
import { UpcomingItem } from './UpcomingCard';
import { TimelineRowData } from './TimelineRow';

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

export const timelineRows: TimelineRowData[] = [
  { id: 'r6am', time: '6:00 AM', kind: 'note', text: 'Awake · Resting HRV 72ms' },
  {
    id: 'r7am',
    time: '7:00 AM',
    kind: 'cards',
    cards: [
      {
        id: 'breakfast',
        icon: Coffee,
        iconColor: colors.meal,
        iconBg: withOpacity(colors.meal, 0.15),
        title: 'High Protein Breakfast',
        badge: { label: 'Done', variant: 'done' },
        description: '420 kcal · 38g Protein (Eggs, Avocado, Sourdough)',
        timeRange: '7:00 - 7:45',
      },
    ],
  },
  { id: 'r8am', time: '8:00 AM', kind: 'note', text: '' },
  {
    id: 'r9am',
    time: '9:00 AM',
    kind: 'cards',
    cards: [
      {
        id: 'hydration',
        icon: Droplet,
        iconColor: colors.water,
        iconBg: withOpacity(colors.water, 0.15),
        title: 'Hydration Intake',
        description: '500ml mineral water + electrolytes logged · 9:30 AM',
        timeRange: '',
        progress: 0.42,
        liveTimeLabel: '9:42 AM',
      },
    ],
  },
  { id: 'r10am', time: '10:00 AM', kind: 'note', text: 'Deep Focus Period · Heart Rate 64 bpm' },
  { id: 'r11am', time: '11:00 AM', kind: 'note', text: '' },
  { id: 'r12pm', time: '12:00 PM', kind: 'note', text: '' },
  {
    id: 'r1pm',
    time: '1:00 PM',
    kind: 'cards',
    cards: [
      {
        id: 'lunch',
        icon: Utensils,
        iconColor: colors.meal,
        iconBg: withOpacity(colors.meal, 0.15),
        title: 'Pre-Fuel Lunch',
        description: '680 kcal · Grilled lemon chicken quinoa bowl',
        timeRange: '1:00 - 1:45',
      },
    ],
  },
  { id: 'r2pm', time: '2:00 PM', kind: 'note', text: '' },
  { id: 'r3pm', time: '3:00 PM', kind: 'note', text: '' },
  {
    id: 'r4pm',
    time: '4:00 PM',
    kind: 'cards',
    cards: [
      {
        id: 'mobility',
        icon: Wind,
        iconColor: colors.aiRecovery,
        iconBg: withOpacity(colors.aiRecovery, 0.15),
        title: 'Mobility & Autonomic Reset',
        badge: { label: 'Recovery', variant: 'recovery' },
        description: 'Thoracic spine drills + 20min guided NSDR',
        timeRange: '4:30 - 5:00',
      },
    ],
  },
  {
    id: 'r5pm',
    time: '5:00 PM',
    kind: 'note',
    text: 'Pre-Workout C4 Energy drink reminder · 5:45 PM',
  },
  {
    id: 'r6pm',
    time: '6:00 PM',
    kind: 'cards',
    cards: [
      {
        id: 'checkin',
        icon: Building2,
        iconColor: colors.gym,
        iconBg: withOpacity(colors.gym, 0.15),
        title: 'FitZone Downtown Facility',
        description: 'Check-in Badge #42 · Towel & Locker Reserved',
        timeRange: '8:00 PM',
      },
      {
        id: 'push-day-main',
        icon: Dumbbell,
        iconColor: colors.onPrimaryFixed,
        iconBg: colors.primaryContainer,
        title: 'Push Day: Hypertrophy',
        badge: { label: 'Main Focus', variant: 'focus' },
        description: 'Chest, Anterior Delts & Triceps · 5 Core Movements',
        timeRange: '6:15 - 7:15 PM',
        emphasized: true,
        exercises: [
          { name: 'Barbell Bench Press', detail: '4 × 8' },
          { name: 'Incline DB Press', detail: '3 × 10' },
          { name: 'Cable Flyes', detail: '3 × 15' },
          { name: 'Overhead Extensions', detail: '' },
        ],
        kcal: 'Estimated 520 kcal',
      },
    ],
  },
  { id: 'r7pm', time: '7:00 PM', kind: 'note', text: 'Sauna Recovery 15 min session' },
  {
    id: 'r8pm',
    time: '8:00 PM',
    kind: 'cards',
    cards: [
      {
        id: 'dinner',
        icon: Utensils,
        iconColor: colors.meal,
        iconBg: withOpacity(colors.meal, 0.15),
        title: 'Post-Workout Anabolic Meal',
        description: '650 kcal · Wild salmon, asparagus & baked sweet potato',
        timeRange: '8:00 - 8:45',
      },
    ],
  },
  { id: 'r9pm', time: '9:00 PM', kind: 'note', text: 'Sleep Hygiene Prep · Blue blockers on' },
];