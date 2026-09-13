// Single source of truth for color tokens — PulseFit.
//
// Sourced from the PulseFit Design Tokens spec (brand / domain /
// feedback / themes.light / themes.dark). `colors` below is flattened
// to the dark theme, since the app is dark-only today; `lightColors`
// and `darkColors` are kept as full theme objects for when light-mode
// support is added.
//
// There is intentionally only ONE `colors` export and ONE file. Add
// new shades here — do not re-introduce `color.ts`.

const brand = {
    primary: '#4F6BF6',
    primaryGlow: 'rgba(79, 107, 246, 0.35)',
    secondary: '#FF6433',
    secondaryGlow: 'rgba(255, 100, 51, 0.35)',
} as const;

const domain = {
    // Nutrition
    calories: '#FF6433',
    protein: '#4F6BF6',
    carbs: '#FF8A65',
    fats: '#F59E0B',

    // Fitness
    hypertrophy: '#6366F1',
    cardio: '#EC4899',
    recovery: '#8B5CF6',

    // Hydration
    water: '#0284C7',
    waterBg: 'rgba(2, 132, 199, 0.12)',
} as const;

const feedback = {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
} as const;

const surfacesLight = {
    background: '#FAF8FF',
    surface: '#FFFFFF',
    surfaceLow: '#F2F3FF',
    surfaceContainer: '#ECEEFB',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: 'rgba(0, 0, 0, 0.06)',
    navBackground: 'rgba(255, 255, 255, 0.85)',
} as const;

const surfacesDark = {
    background: '#10131A',
    surface: '#191B23',
    surfaceLow: '#0B0E15',
    surfaceContainer: '#1F273D',
    textPrimary: '#F9FAFB',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    border: 'rgba(255, 255, 255, 0.08)',
    navBackground: 'rgba(16, 19, 26, 0.85)',
} as const;

const absolutes = {
    black: '#000000',
    white: '#FFFFFF',
} as const;

export const lightColors = {
    ...brand,
    ...domain,
    ...feedback,
    ...surfacesLight,
    ...absolutes,
} as const;

export const darkColors = {
    ...brand,
    ...domain,
    ...feedback,
    ...surfacesDark,
    ...absolutes,
} as const;

// Compatibility bridge — old "Kinetic Obsidian" (dark theme) token
// names, kept working while screens still reference them (Workout
// plan-builder, Schedule) so they don't hard-crash after the PulseFit
// palette swap. Remove an entry here once every file using it has been
// migrated to the token names above.
const legacyAliases = {
    canvasDeep: lightColors.background,
    cardBackgroud: lightColors.surface,
    cardBorder: lightColors.border,
    onPrimary: lightColors.white,
    onPrimaryFixed: lightColors.white,
    onSurface: lightColors.textPrimary,
    onSurfaceVariant: lightColors.textSecondary,
    pillBackground: '#4F6BF624', // withOpacity(primary, 0.14)
    pillSuccessBorder: '#10B9814d', // withOpacity(success, 0.3)
    pillText: lightColors.primary,
    primaryContainer: lightColors.primary,
    primaryDark: lightColors.primary,
    surfaceContainerHigh: lightColors.surfaceContainer,
    surfaceContainerHighest: lightColors.surfaceContainer,
    surfaceContainerLow: lightColors.surfaceLow,
    aiRecovery: domain.recovery,
    gym: feedback.info,
} as const;

// App-wide default palette — light theme, matching the current PulseFit
// UI direction (dashboard redesign onward), plus the legacy aliases
// above. `darkColors` is kept ready for whenever dark-mode support is
// added back.
export const colors = { ...lightColors, ...legacyAliases };

export type AppColors = typeof colors;

/**
 * Overrides a color token's alpha, accepting either a 6-digit hex
 * token (withOpacity('#10B981', 0.4) -> '#10B98166') or an
 * 'rgba(r, g, b, a)' string (several tokens — border, navBackground,
 * primaryGlow, waterBg, secondaryGlow — are rgba to begin with).
 * Naively appending a hex alpha suffix to an rgba string produces an
 * invalid CSS value (e.g. 'rgba(0, 0, 0, 0.06)99'), which RN Web
 * rejects outright — so rgba inputs get their existing alpha replaced
 * instead of a suffix appended.
 *
 * Applied inline via `style` so it never depends on how a given Tailwind
 * version resolves opacity on arbitrary values.
 */
export const withOpacity = (color: string, alpha: number): string => {
    const clamped = Math.max(0, Math.min(1, alpha));

    const rgbaMatch = color.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/,
    );
    if (rgbaMatch) {
        const [, r, g, b] = rgbaMatch;
        return `rgba(${r}, ${g}, ${b}, ${clamped})`;
    }

    const channel = Math.round(clamped * 255)
        .toString(16)
        .padStart(2, '0');
    return `${color}${channel}`;
};
