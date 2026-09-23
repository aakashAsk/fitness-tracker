import React, { useMemo, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, PanResponder, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, withOpacity } from '../../Theme/colors';
import { SkeletonBlock } from '../../Components/Skeleton';
import { themedStyles } from '../../Theme/ThemeContext';
import SegmentedControl from '../../Components/SegmentedControl';
import { useNetCalories, type NetCaloriesRange } from '../../Hooks/useNetCalories';

type Range = NetCaloriesRange;

const RANGE_OPTIONS = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
] as const;

const TITLE = 'Net Calories';
const UNIT = 'Cal';

/** Symmetric ± bound for the y-axis, so 0 always sits at the vertical
 * midpoint — a net-calories chart is a deficit/surplus story, and that
 * only reads clearly when the zero line is fixed rather than wherever
 * the data happens to put it.
 *
 * `MIN_SPAN` keeps a near-empty week (a couple hundred kcal either way)
 * from stretching into a chart where every point hugs the centre line. */
const MIN_SPAN = 200;
function symmetricBound(values: (number | null)[]): number {
    const maxAbs = values.reduce((m: number, v) => (v === null ? m : Math.max(m, Math.abs(v))), 0);
    const padded = Math.max(maxAbs * 1.15, MIN_SPAN);
    const step = padded > 1000 ? 500 : padded > 500 ? 100 : 50;
    return Math.ceil(padded / step) * step;
}

const PLOT_HEIGHT = 150;
const PAD_X = 16;
// Headroom above the highest point so the value label sits clear of the line.
const PAD_TOP = 34;
const PAD_BOTTOM = 12;
const Y_AXIS_WIDTH = 34;
const TOOLTIP_WIDTH = 72;
const LABEL_WIDTH = 40;

interface Point {
    x: number;
    y: number;
}

/** Maps a value in [-bound, bound] to its y position — shared by the
 * points below and by the zero baseline, so both agree on the same
 * scale. */
function valueToY(value: number, bound: number): number {
    const usable = PLOT_HEIGHT - PAD_TOP - PAD_BOTTOM;
    const clamped = Math.max(-bound, Math.min(bound, value));
    return PAD_TOP + (1 - (clamped + bound) / (2 * bound)) * usable;
}

/** Slot i's x position out of `total` evenly-spaced slots — used for
 * both plotted points and x-axis labels, so a label always has a
 * position even when its slot has no data (a future weekday). A single
 * slot has no interval to divide the width by — center it instead of
 * computing (width / 0), which produces NaN. */
function xAt(i: number, total: number, width: number): number {
    if (total === 1) return width / 2;
    const step = (width - PAD_X * 2) / (total - 1);
    return PAD_X + i * step;
}

/** One slot per label (all 7 weekdays, all 4 weeks, all 12 months), so
 * x position depends on the FULL slot count — not how many values are
 * actually real — and a future/null value simply gets no point rather
 * than shifting every later slot leftward. */
function toPoints(values: (number | null)[], bound: number, width: number): (Point | null)[] {
    return values.map((value, i) => {
        if (value === null) return null;
        return { x: xAt(i, values.length, width), y: valueToY(value, bound) };
    });
}

// Horizontal-tangent cubic segments: smooth like a spline but can never
// overshoot the data (no dip below 0 or bump above a peak).
function smoothPath(points: Point[]): string {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const next = points[i];
        const mid = (prev.x + next.x) / 2;
        d += ` C ${mid} ${prev.y}, ${mid} ${next.y}, ${next.x} ${next.y}`;
    }
    return d;
}

export const CaloriesBurnCard: React.FC = () => {
    const [range, setRange] = useState<Range>('month');
    // The user's own pick; null means "show the most recent bucket",
    // which is also what every range change goes back to.
    const [picked, setPicked] = useState<number | null>(null);
    const [plotWidth, setPlotWidth] = useState(0);

    const { buckets, loading } = useNetCalories(range);
    const values = buckets.map((b) => b.net);
    const labels = buckets.map((b) => b.label);
    // The most recent slot that has actually happened — a future
    // weekday/week/month has nothing to select by default.
    const lastRealIndex = (() => {
        for (let i = values.length - 1; i >= 0; i--) {
            if (values[i] !== null) return i;
        }
        return null;
    })();
    const selected = picked ?? lastRealIndex;
    const bound = symmetricBound(values);

    const changeRange = (next: Range) => {
        setRange(next);
        setPicked(null);
    };

    const onPlotLayout = (event: LayoutChangeEvent) =>
        setPlotWidth(event.nativeEvent.layout.width);

    const points = plotWidth > 0 && values.length > 0 ? toPoints(values, bound, plotWidth) : [];
    // Only the real (non-future) points make the line/fill — they are
    // always a contiguous run from the start, so this is just "the line
    // so far", stopping at today rather than reaching every label.
    const realPoints = points.filter((p): p is Point => p !== null);
    const linePath = realPoints.length > 0 ? smoothPath(realPoints) : '';
    const zeroY = valueToY(0, bound);
    const areaPath =
        realPoints.length > 0
            ? `${linePath} L ${realPoints[realPoints.length - 1].x} ${zeroY} L ${realPoints[0].x} ${zeroY} Z`
            : '';

    const labelStep = points.length > 1 ? (plotWidth - PAD_X * 2) / (points.length - 1) : LABEL_WIDTH;
    const labelWidth = Math.min(LABEL_WIDTH, labelStep);

    const topY = PAD_TOP;
    const bottomY = PLOT_HEIGHT - PAD_BOTTOM;
    const point = selected !== null ? points[selected] : null;
    const selectedValue = (selected !== null ? values[selected] : null) ?? 0;
    // A deficit (burned more than eaten) reads as the "good" direction
    // for a fitness app, a surplus as the one worth noticing.
    const accent = selectedValue <= 0 ? colors.success : colors.error;
    const selectedLabel = `${selectedValue > 0 ? '+' : ''}${selectedValue} ${UNIT}`;

    // Whichever real (non-future) slot's x position is closest to a
    // touch — same snapping a single tap on a dot/label gets, but
    // driven continuously as the finger moves.
    const nearestRealIndex = (x: number): number | null => {
        let bestIndex: number | null = null;
        let bestDist = Infinity;
        for (let i = 0; i < points.length; i++) {
            if (points[i] === null) continue;
            const dist = Math.abs(xAt(i, points.length, plotWidth) - x);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }
        return bestIndex;
    };

    const scrub = (event: GestureResponderEvent) => {
        const nearest = nearestRealIndex(event.nativeEvent.locationX);
        if (nearest !== null) setPicked(nearest);
    };

    // Recreated only when the geometry it closes over actually changes —
    // a PanResponder's handlers are read once per touch, so a stale
    // closure would scrub against yesterday's plotWidth/points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: scrub,
                onPanResponderMove: scrub,
            }),
        [points, plotWidth],
    );

    return (
        <View style={styles.card} accessibilityLabel={`${TITLE}, this ${range}`}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    {TITLE}
                </Text>
                <SegmentedControl
                    size="sm"
                    options={RANGE_OPTIONS}
                    value={range}
                    onChange={changeRange}
                />
            </View>

            <View style={styles.chartRow}>
                <View style={[styles.yAxis, { width: Y_AXIS_WIDTH, height: PLOT_HEIGHT }]}>
                    <Text style={[styles.yLabel, { top: topY - 7 }]}>+{bound}</Text>
                    <Text style={[styles.yLabel, { top: zeroY - 7 }]}>0</Text>
                    <Text style={[styles.yLabel, { top: bottomY - 7 }]}>-{bound}</Text>
                </View>

                <View style={styles.plot} onLayout={onPlotLayout} {...panResponder.panHandlers}>
                    {loading && points.length === 0 ? (
                        <SkeletonBlock height={PLOT_HEIGHT} radius={12} />
                    ) : points.length > 0 ? (
                        <>
                            <Svg width={plotWidth} height={PLOT_HEIGHT}>
                                <Defs>
                                    <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                                        <Stop offset="0" stopColor={accent} stopOpacity={0.22} />
                                        <Stop offset="1" stopColor={accent} stopOpacity={0} />
                                    </LinearGradient>
                                </Defs>

                                {[topY, zeroY, bottomY].map(y => (
                                    <Line
                                        key={y}
                                        x1={0}
                                        x2={plotWidth}
                                        y1={y}
                                        y2={y}
                                        stroke={colors.border}
                                        strokeWidth={1}
                                        strokeDasharray="4 5"
                                    />
                                ))}

                                <Path d={areaPath} fill="url(#trendFill)" />
                                <Path
                                    d={linePath}
                                    stroke={withOpacity(accent, 0.75)}
                                    strokeWidth={1.75}
                                    strokeLinecap="round"
                                    fill="none"
                                />

                                {point ? (
                                    <Line
                                        x1={point.x}
                                        x2={point.x}
                                        y1={point.y}
                                        y2={zeroY}
                                        stroke={withOpacity(accent, 0.45)}
                                        strokeWidth={1.5}
                                        strokeDasharray="3 4"
                                    />
                                ) : null}

                                {points.map((p, i) => {
                                    if (!p) return null;
                                    return (
                                        <React.Fragment key={`${range}-${i}`}>
                                            {i === selected ? (
                                                <>
                                                    <Circle
                                                        cx={p.x}
                                                        cy={p.y}
                                                        r={9}
                                                        fill={withOpacity(accent, 0.25)}
                                                    />
                                                    <Circle
                                                        cx={p.x}
                                                        cy={p.y}
                                                        r={5.5}
                                                        fill={accent}
                                                        stroke={colors.surface}
                                                        strokeWidth={2}
                                                    />
                                                </>
                                            ) : (
                                                <Circle
                                                    cx={p.x}
                                                    cy={p.y}
                                                    r={4}
                                                    fill={accent}
                                                    stroke={colors.surface}
                                                    strokeWidth={2}
                                                />
                                            )}
                                            {/* Invisible, larger hit target laid over every dot —
                                                any dot on the line can be tapped to show its
                                                value, not just the one the x-axis label points
                                                to. Drawn last (on top) so it always catches the
                                                touch instead of the visible circle beneath it. */}
                                            <Circle
                                                cx={p.x}
                                                cy={p.y}
                                                r={14}
                                                fill="transparent"
                                                onPress={() => setPicked(i)}
                                            />
                                        </React.Fragment>
                                    );
                                })}
                            </Svg>

                            {point ? (
                                <Text
                                    style={[
                                        styles.tooltip,
                                        {
                                            width: TOOLTIP_WIDTH,
                                            left: Math.min(
                                                Math.max(point.x - TOOLTIP_WIDTH / 2, 0),
                                                plotWidth - TOOLTIP_WIDTH,
                                            ),
                                            top: Math.max(point.y - 34, 0),
                                        },
                                    ]}
                                >
                                    {selectedLabel}
                                </Text>
                            ) : null}

                            <View style={styles.xAxis}>
                                {labels.map((label, i) => {
                                    const hasData = points[i] !== null;
                                    const x = xAt(i, labels.length, plotWidth);
                                    return (
                                        <TouchableOpacity
                                            key={`${range}-${i}`}
                                            activeOpacity={hasData ? 0.7 : 1}
                                            disabled={!hasData}
                                            onPress={() => setPicked(i)}
                                            style={[
                                                styles.xLabelTouch,
                                                { width: labelWidth, left: x - labelWidth / 2 },
                                            ]}
                                            accessibilityRole={hasData ? 'button' : undefined}
                                            accessibilityLabel={
                                                hasData
                                                    ? `${label}, ${(values[i] as number) > 0 ? '+' : ''}${values[i]} ${UNIT}`
                                                    : `${label}, no data yet`
                                            }
                                        >
                                            <Text
                                                numberOfLines={1}
                                                style={[
                                                    styles.xLabel,
                                                    i === selected && { color: accent, fontWeight: '800' },
                                                    !hasData && styles.xLabelFuture,
                                                ]}
                                            >
                                                {label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </>
                    ) : null}
                </View>
            </View>

        </View>
    );
};

const styles = themedStyles(() => ({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 14,
    },
    title: {
        flexShrink: 1,
        fontSize: 17,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    chartRow: {
        flexDirection: 'row',
    },
    yAxis: {
        position: 'relative',
    },
    yLabel: {
        position: 'absolute',
        left: 0,
        fontSize: 11,
        fontWeight: '600',
        color: colors.textMuted,
    },
    plot: {
        flex: 1,
        position: 'relative',
    },
    tooltip: {
        position: 'absolute',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    xAxis: {
        height: 28,
        position: 'relative',
        marginTop: 4,
    },
    xLabelTouch: {
        position: 'absolute',
        top: 0,
        alignItems: 'center',
        paddingVertical: 6,
    },
    xLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    // A day/week/month that hasn't happened yet — same slot on the axis,
    // no line reaching it.
    xLabelFuture: {
        color: colors.textMuted,
        fontWeight: '500',
    },
}));

export default CaloriesBurnCard;
