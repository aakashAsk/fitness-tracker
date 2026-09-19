// Single source of truth for color tokens — PulseFit.
//
// Sourced from the PulseFit Design Tokens spec (brand / domain /
// feedback / themes.light / themes.dark), with the dark surfaces taken
// from the "Kinetic Glow Dark" direction in DESIGN.md.
//
// The exported `colors` is a LIVE view of whichever theme is active —
// reading `colors.background` today and after a theme switch gives
// different values from the same import. That is what lets every screen
// keep its plain `import { colors }` and still repaint when the user
// flips the dark-mode switch in Settings. See ./ThemeContext.tsx for
// how a switch is applied, and why StyleSheet bodies must be wrapped in
// `themedStyles` rather than `StyleSheet.create`.
//
// There is intentionally only ONE `colors` export and ONE file. Add
// new shades here — do not re-introduce `color.ts`.

// ── Theme-invariant tokens ───────────────────────────────────────────
// Domain and feedback hues carry meaning (calories are always coral,
// water is always blue), so they do not change between themes. The two
// brand anchors ARE re-tuned: at their light-theme saturation they sit
// too close to the dark canvas to read as "lit".

const brandLight = {
    primary: '#4F6BF6',
    primaryGlow: 'rgba(79, 107, 246, 0.35)',
    secondary: '#FF6433',
    secondaryGlow: 'rgba(255, 100, 51, 0.35)',
} as const;

const brandDark = {
    primary: '#6C88FF',
    primaryGlow: 'rgba(108, 136, 255, 0.35)',
    secondary: '#FF7A59',
    secondaryGlow: 'rgba(255, 122, 89, 0.35)',
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

    // Sleep — a night-sky indigo, kept distinct from `recovery`'s violet,
    // which the Steps tile already uses right beside it.
    sleep: '#4F46E5',
} as const;

const feedback = {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
} as const;

const absolutes = {
    black: '#000000',
    white: '#FFFFFF',
} as const;

// ── Per-theme surfaces ───────────────────────────────────────────────

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
    // The canvas is darker than the cards sitting on it, so elevation
    // reads as light rather than as a cast shadow — shadows are
    // effectively invisible against #0A0D14.
    background: '#0A0D14',
    surface: '#161C2C',
    surfaceLow: '#121622',
    surfaceContainer: '#1F273D',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    border: 'rgba(255, 255, 255, 0.08)',
    navBackground: 'rgba(22, 28, 44, 0.9)',
} as const;

// Keyed off the light theme's shape but with widened values: both
// palettes have to share one type, and `as const` would otherwise make
// '#0A0D14' and '#FAF8FF' incompatible literal types.
type Surfaces = Record<keyof typeof surfacesLight, string>;
type Brand = Record<keyof typeof brandLight, string>;

/**
 * Old "Kinetic Obsidian" token names, kept working while screens still
 * reference them (Workout plan-builder, Schedule) so they don't
 * hard-crash after the PulseFit palette swap. Derived from the theme's
 * own surfaces so both themes get correct aliases — remove an entry
 * here once every file using it has been migrated.
 */
const aliasesFor = (surfaces: Surfaces, brand: Brand) =>
    ({
        canvasDeep: surfaces.background,
        cardBackgroud: surfaces.surface,
        cardBorder: surfaces.border,
        onPrimary: absolutes.white,
        onPrimaryFixed: absolutes.white,
        onSurface: surfaces.textPrimary,
        onSurfaceVariant: surfaces.textSecondary,
        pillBackground: brand.primary + '24', // withOpacity(primary, 0.14)
        pillSuccessBorder: feedback.success + '4d', // withOpacity(success, 0.3)
        pillText: brand.primary,
        primaryContainer: brand.primary,
        primaryDark: brand.primary,
        surfaceContainerHigh: surfaces.surfaceContainer,
        surfaceContainerHighest: surfaces.surfaceContainer,
        surfaceContainerLow: surfaces.surfaceLow,
        aiRecovery: domain.recovery,
        gym: feedback.info,
    }) as const;

export const lightColors = {
    ...brandLight,
    ...domain,
    ...feedback,
    ...surfacesLight,
    ...absolutes,
    ...aliasesFor(surfacesLight, brandLight),
} as const;

export const darkColors = {
    ...brandDark,
    ...domain,
    ...feedback,
    ...surfacesDark,
    ...absolutes,
    ...aliasesFor(surfacesDark, brandDark),
} as const;

export type ThemeMode = 'light' | 'dark';
export type AppColors = Record<keyof typeof lightColors, string>;

export const palettes: Record<ThemeMode, AppColors> = {
    light: lightColors,
    dark: darkColors,
};

// ── The live palette ─────────────────────────────────────────────────
// Light is the initial value: a user who has never touched the switch,
// and every screen shown before their saved preference has loaded, gets
// the light theme.

let activeMode: ThemeMode = 'light';

export const getActiveMode = (): ThemeMode => activeMode;

/**
 * Swaps the palette that `colors` reads through. Callers must also
 * rebuild the themed StyleSheets and re-render — use `useTheme()`'s
 * `setMode` from ./ThemeContext rather than calling this directly.
 */
export const setActivePalette = (mode: ThemeMode): void => {
    activeMode = mode;
};

/**
 * A live view of the active palette, not a snapshot. Property reads are
 * forwarded to the current theme, so a component that reads
 * `colors.textPrimary` during render picks up a theme switch on its
 * next render with no code change. Values captured OUTSIDE a render —
 * a module-level `const`, or a `StyleSheet.create` body — are frozen at
 * import time and will NOT follow the theme; wrap those in
 * `themedStyles` from ./ThemeContext.
 */
export const colors: AppColors = new Proxy({} as AppColors, {
    get: (_target, key) => (palettes[activeMode] as Record<string | symbol, unknown>)[key],
    has: (_target, key) => key in lightColors,
    ownKeys: () => Reflect.ownKeys(lightColors),
    // Required for spread and Object.keys to see anything: ownKeys is
    // ignored unless each key also reports as an enumerable,
    // configurable own property.
    getOwnPropertyDescriptor: (_target, key) => ({
        value: (palettes[activeMode] as Record<string | symbol, unknown>)[key],
        enumerable: true,
        configurable: true,
    }),
});

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
