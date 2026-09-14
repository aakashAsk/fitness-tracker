import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Activity, TrendingUp } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import { fetchWorkoutLogsForUser } from '../../Services/workoutLogService';
import {
    buildWorkoutProgress,
    formatCompact,
    formatTrendLabel,
    type WorkoutProgress,
} from '../../Services/progressService';
import TrendGraph from './TrendGraph';

// Progress across every logged session — not scoped to the selected
// date or to one exercise, so it has something to draw whenever the
// user has trained at all.

type Metric = 'volume' | 'avgWeight' | 'reps';

const METRICS: { key: Metric; label: string; unit: string }[] = [
    { key: 'volume', label: 'Volume', unit: 'kg' },
    // Average load per rep, not the day's heaviest set — see
    // SessionTotals.avgWeight for why it is weighted by reps.
    { key: 'avgWeight', label: 'Avg Weight', unit: 'kg' },
    { key: 'reps', label: 'Reps', unit: '' },
];

const EMPTY: WorkoutProgress = {
    sessions: [],
    totalVolume: 0,
    totalSets: 0,
    totalReps: 0,
    bestWeight: 0,
    avgWeight: 0,
};

export interface WorkoutProgressCardProps {
    /**
     * Bumped by the parent after a log is saved, to re-read. The card
     * owns its own fetch because it spans all history, not the selected
     * day's exercises.
     */
    refreshKey?: number;
}

export const WorkoutProgressCard: React.FC<WorkoutProgressCardProps> = ({ refreshKey = 0 }) => {
    const [progress, setProgress] = useState<WorkoutProgress>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [metric, setMetric] = useState<Metric>('volume');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchWorkoutLogsForUser()
            .then((logs) => {
                if (!cancelled) setProgress(buildWorkoutProgress(logs));
            })
            .catch(() => {
                if (!cancelled) setProgress(EMPTY);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    const { sessions } = progress;

    const values = useMemo(
        () =>
            sessions.map((session) =>
                metric === 'volume'
                    ? session.volume
                    : metric === 'avgWeight'
                      ? session.avgWeight
                      : session.reps,
            ),
        [sessions, metric],
    );

    const active = METRICS.find((entry) => entry.key === metric)!;
    const latest = values.length > 0 ? values[values.length - 1] : 0;
    const previous = values.length > 1 ? values[values.length - 2] : 0;
    const delta = previous > 0 ? latest - previous : 0;
    // Percentage rather than an absolute — a 400kg swing in volume means
    // something very different at 2,000kg than at 20,000kg.
    const deltaPercent = previous > 0 ? Math.round((delta / previous) * 100) : 0;

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                    <View style={styles.titleRow}>
                        <TrendingUp size={16} color={colors.primary} strokeWidth={2.4} />
                        <Text style={styles.title}>Training Progress</Text>
                    </View>

                    <View style={styles.statRow}>
                        <Text style={styles.value}>
                            {metric === 'volume' ? formatCompact(latest) : latest || '—'}
                        </Text>
                        {active.unit ? <Text style={styles.unit}>{active.unit}</Text> : null}

                        {delta !== 0 ? (
                            <View
                                style={[
                                    styles.deltaBadge,
                                    {
                                        backgroundColor: withOpacity(
                                            delta > 0 ? colors.success : colors.error,
                                            0.16,
                                        ),
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.deltaText,
                                        { color: delta > 0 ? colors.success : colors.error },
                                    ]}
                                >
                                    {delta > 0 ? '▲' : '▼'} {Math.abs(deltaPercent)}%
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>

                {sessions.length > 0 ? (
                    <View style={styles.runsPill}>
                        <Text style={styles.runsPillText}>
                            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
                        </Text>
                    </View>
                ) : null}
            </View>

            {sessions.length > 0 ? (
                <View style={styles.metricRow}>
                    {METRICS.map((entry) => {
                        const isActive = entry.key === metric;
                        return (
                            <TouchableOpacity
                                key={entry.key}
                                activeOpacity={0.8}
                                onPress={() => setMetric(entry.key)}
                                style={[styles.metricChip, isActive && styles.metricChipActive]}
                            >
                                <Text
                                    style={[
                                        styles.metricText,
                                        isActive && styles.metricTextActive,
                                    ]}
                                >
                                    {entry.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ) : null}

            {sessions.length >= 2 ? (
                <>
                    <TrendGraph values={values} />

                    {/* Only the ends are labelled — one label per session
                        collides as soon as there are more than a few. */}
                    <View style={styles.labelsRow}>
                        <Text style={styles.label}>{formatTrendLabel(sessions[0].date)}</Text>
                        <Text style={styles.labelActive}>
                            {formatTrendLabel(sessions[sessions.length - 1].date)}
                        </Text>
                    </View>

                    <View style={styles.summaryRow}>
                        <View style={styles.summaryTile}>
                            <Text style={styles.summaryValue}>
                                {formatCompact(progress.totalVolume)}
                            </Text>
                            <Text style={styles.summaryLabel}>Total kg</Text>
                        </View>
                        <View style={styles.summaryTile}>
                            <Text style={styles.summaryValue}>{progress.totalSets}</Text>
                            <Text style={styles.summaryLabel}>Sets</Text>
                        </View>
                        <View style={styles.summaryTile}>
                            <Text style={styles.summaryValue}>{progress.totalReps}</Text>
                            <Text style={styles.summaryLabel}>Reps</Text>
                        </View>
                        <View style={styles.summaryTile}>
                            <Text style={styles.summaryValue}>{progress.avgWeight}</Text>
                            <Text style={styles.summaryLabel}>Avg kg</Text>
                        </View>
                    </View>
                </>
            ) : (
                <View style={styles.emptyBox}>
                    <Activity size={18} color={colors.textMuted} strokeWidth={2.2} />
                    <Text style={styles.emptyText}>
                        {loading
                            ? 'Loading your training history…'
                            : sessions.length === 1
                              ? 'One session logged. Log another to see your trend.'
                              : 'Log a workout to start tracking your progress.'}
                    </Text>
                </View>
            )}
        </View>
    );
};

export default WorkoutProgressCard;

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 16,
        marginHorizontal: spacing.screenHorizontalPadding,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.07,
        shadowRadius: 18,
        elevation: 3,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
    },
    headerLeft: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 5,
        marginTop: 6,
    },
    value: {
        fontSize: 26,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.6,
    },
    unit: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textSecondary,
        marginBottom: 4,
    },
    deltaBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        marginBottom: 4,
    },
    deltaText: { fontSize: 10, fontWeight: '800' },
    runsPill: {
        backgroundColor: colors.surfaceContainer,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    runsPillText: {
        fontSize: 10.5,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    metricRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 12,
    },
    metricChip: {
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: colors.surfaceLow,
    },
    metricChipActive: { backgroundColor: colors.primary },
    metricText: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    metricTextActive: { color: colors.white },
    labelsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 2,
    },
    label: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
    labelActive: { fontSize: 10, fontWeight: '800', color: colors.primary },
    summaryRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 14,
    },
    summaryTile: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 9,
        borderRadius: 14,
        backgroundColor: colors.surfaceLow,
    },
    summaryValue: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    summaryLabel: {
        fontSize: 9.5,
        fontWeight: '700',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        marginTop: 1,
    },
    emptyBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginTop: 12,
        padding: 12,
        borderRadius: 14,
        backgroundColor: colors.surfaceLow,
    },
    emptyText: {
        flex: 1,
        fontSize: 12.5,
        lineHeight: 18,
        color: colors.textSecondary,
    },
});
