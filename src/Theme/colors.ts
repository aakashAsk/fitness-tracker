// Single source of truth for color tokens — FitTrack "Kinetic Obsidian".
//
// Values come from the project color system spec. Token names are kept
// stable so every consumer picks up the palette automatically; several
// names are aliases that resolve to the same hex (e.g. `onSurface` /
// `textPrimary`) to avoid churn in existing screens.
//
// There is intentionally only ONE `colors` export and ONE file. Add new
// shades here — do not re-introduce `color.ts`.
export const colors = {
  // ── Brand & core accents ───────────────────────────────────
  primary: '#7CFF4F', // Electric Lime — primary CTA, active pills, progress
  primaryContainer: '#7CFF4F',
  primaryDark: '#5ED936', // Kinetic Green Dark — pressed states, active borders
  primaryHighlight: '#5ED936',
  success: '#4ADE80', // completed checkmarks, sync confirmation
  onPrimary: '#0C0E12', // text/icons on top of Electric Lime
  onPrimaryFixed: '#0C0E12',
  textOnAccent: '#0C0E12',

  // ── Surfaces & background hierarchy ────────────────────────
  canvasDeep: '#0C0E12', // deepest app canvas
  background: '#0F1115', // root screen background
  neutral: '#0F1115',
  surface: '#111317', // bottom nav, global header
  surfaceBase: '#111317',
  cardBackgroud: '#181B21', // standard content cards / panels
  surfaceContainer: '#181B21',
  surfaceCard: '#181B21',
  surfaceContainerLow: '#1A1C20', // secondary grouped / inactive cards
  backgroundSecondary: '#20242C', // input fields, nested blocks, selectors
  surfaceElevated: '#20242C',
  surfaceContainerHigh: '#282A2E', // hover states, active segments
  surfaceContainerHighest: '#37393E',
  surfaceBright: '#37393E',

  // ── Borders, dividers, outlines ───────────────────────────
  border: '#292D35', // standard 1px structural border
  cardBorder: '#292D35',
  divider: '#1F232B', // timeline guides, nav top border
  barNormal: '#1F232B',
  activeOutline: 'rgba(124, 255, 79, 0.3)', // neon glow on active cards
  pillBorder: 'rgba(124, 255, 79, 0.3)',
  pillSuccessBorder: 'rgba(124, 255, 79, 0.3)',

  // ── Typography ────────────────────────────────────────────
  textPrimary: '#F5F7FA', // headers, card titles, key metrics
  onSurface: '#F5F7FA',
  textSecondary: '#9AA1AD', // subtitles, metadata, unit labels
  onSurfaceVariant: '#9AA1AD',
  textMuted: '#6B7280', // inactive days, disabled options, timestamps

  // ── Pills / status badges ─────────────────────────────────
  pillBackground: '#304B2C',
  pillText: '#7CFF4F',

  // ── Semantic event & category accents ─────────────────────
  workout: '#7CFF4F', // training days, workout cards
  meal: '#FB923C', // warm orange — scheduled meals, food icons
  mealAmber: '#FBBF24', // amber — macro carb indicators
  warning: '#FBBF24',
  tertiaryContainer: '#FB923C',
  gym: '#38BDF8', // sky blue — gym venue badges
  water: '#60A5FA', // cobalt — hydration logs & pacer
  aiRecovery: '#A78BFA', // muted violet — Kinetic AI, NSDR, supplements
  secondary: '#A78BFA',
  secondaryHighlight: '#252039',
  error: '#F87171', // soft coral — alerts, missed intervals, cancel
  alert: '#F87171',

  // ── Absolutes ─────────────────────────────────────────────
  white: '#FFFFFF',
  black: '#000000',
} as const;

export type AppColors = typeof colors;

/**
 * Adds an alpha channel to a 6-digit hex token, e.g.
 * withOpacity(colors.success, 0.4) -> '#4ADE8066'
 *
 * Applied inline via `style` so it never depends on how a given Tailwind
 * version resolves opacity on arbitrary values.
 */
export const withOpacity = (hex: string, alpha: number): string => {
  const clamped = Math.max(0, Math.min(1, alpha));
  const channel = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${channel}`;
};
