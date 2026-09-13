import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
    AlarmClock,
    Calendar,
    Check,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Coffee,
    Dumbbell,
    Droplet,
    EllipsisVertical,
    Pill,
    Play,
    Plus,
    Rows3,
    Salad,
    Timer,
    Zap,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';

// Presentational redesign of the Schedule tab — a day-timeline UI
// (month bar, date strip, category filters, vertical event timeline
// with a "now" marker) rather than the previous implementation. Sample
// data only; not wired to Firestore/Redux yet — see Schedule.tsx (no
// longer used by App.tsx) for the real calendar-events version this
// replaced.

interface DateTile {
    day: string;
    date: number;
    dotColor: string | null;
}

const DATE_STRIP: DateTile[] = [
    { day: 'Mon', date: 16, dotColor: colors.secondary },
    { day: 'Tue', date: 17, dotColor: colors.primary },
    { day: 'Wed', date: 18, dotColor: null },
    { day: 'Thu', date: 19, dotColor: withOpacity(colors.primary, 0.4) },
    { day: 'Fri', date: 20, dotColor: colors.secondary },
    { day: 'Sat', date: 21, dotColor: null },
];

interface FilterChip {
    key: string;
    label: string;
    count?: number;
    dotColor?: string;
}

const FILTERS: FilterChip[] = [
    { key: 'all', label: 'All', count: 7 },
    { key: 'workouts', label: 'Workouts', dotColor: colors.primary },
    { key: 'meals', label: 'Meals', dotColor: colors.secondary },
    { key: 'supplements', label: 'Supplements', dotColor: colors.textSecondary },
    { key: 'hydration', label: 'Hydration', dotColor: colors.water },
];

type EventKind = 'hydration' | 'meal' | 'supplement' | 'workout';

interface TimelineEvent {
    id: string;
    time: string;
    period: string;
    kind: EventKind;
    title: string;
    subtitle: string;
    highlightText?: string;
    badge?: string;
    done?: boolean;
    action?: 'check' | 'log' | 'more' | 'alarm' | 'none';
}

const TIMELINE: TimelineEvent[] = [
    {
        id: 'e1',
        time: '07:00',
        period: 'AM',
        kind: 'hydration',
        title: 'Hydration & Electrolytes',
        subtitle: 'Celery salt + lemon',
        highlightText: '500 ml',
        done: true,
        action: 'check',
    },
    {
        id: 'e2',
        time: '08:00',
        period: 'AM',
        kind: 'meal',
        title: 'High Protein Oats',
        subtitle: '34g Protein • Blueberries',
        highlightText: '480 kcal',
        badge: 'Meal',
        done: true,
        action: 'check',
    },
    {
        id: 'e3',
        time: '08:30',
        period: 'AM',
        kind: 'supplement',
        title: 'Omega 3 & Vit D3',
        subtitle: '2 softgels with healthy fat',
        done: true,
        action: 'none',
    },
    {
        id: 'e4',
        time: '12:30',
        period: 'PM',
        kind: 'meal',
        title: 'Grilled Chicken Salad',
        subtitle: 'Quinoa & Greens',
        highlightText: '620 kcal',
        action: 'log',
    },
];

const AFTER_NOW: TimelineEvent[] = [
    {
        id: 'e6',
        time: '07:30',
        period: 'PM',
        kind: 'meal',
        title: 'Atlantic Salmon Bowl',
        subtitle: '42g Protein • Scheduled',
        highlightText: '550 kcal',
        action: 'more',
    },
    {
        id: 'e7',
        time: '10:00',
        period: 'PM',
        kind: 'supplement',
        title: 'Nighttime Recovery',
        subtitle: '400mg Magnesium Glycinate • Chamomile',
        action: 'alarm',
    },
];

const KIND_ICON: Record<EventKind, typeof Droplet> = {
    hydration: Droplet,
    meal: Coffee,
    supplement: Pill,
    workout: Dumbbell,
};

const KIND_COLOR: Record<EventKind, string> = {
    hydration: colors.water,
    meal: colors.secondary,
    supplement: colors.textSecondary,
    workout: colors.primary,
};

const GAUGE_SIZE = 40;
const GAUGE_STROKE = 3;
const GAUGE_PERCENT = 60;

export const ScheduleSession: React.FC = () => {
    const [activeDateIndex, setActiveDateIndex] = useState(2);
    const [activeFilter, setActiveFilter] = useState('all');

    const gaugeRadius = (GAUGE_SIZE - GAUGE_STROKE) / 2;
    const gaugeCircumference = 2 * Math.PI * gaugeRadius;
    const gaugeDashOffset = gaugeCircumference * (1 - GAUGE_PERCENT / 100);

    const renderEventCard = (event: TimelineEvent, featured = false) => {
        const Icon = KIND_ICON[event.kind];
        const kindColor = KIND_COLOR[event.kind];

        return (
            <View style={styles.eventCard}>
                <View style={styles.eventCardLeft}>
                    <View style={[styles.eventIcon, { backgroundColor: withOpacity(kindColor, 0.14) }]}>
                        <Icon size={18} color={kindColor} strokeWidth={2.2} />
                    </View>
                    <View style={styles.eventTextBlock}>
                        <View style={styles.eventTitleRow}>
                            <Text style={styles.eventTitle} numberOfLines={1}>
                                {event.title}
                            </Text>
                            {event.badge ? (
                                <View style={styles.eventBadge}>
                                    <Text style={styles.eventBadgeText}>{event.badge}</Text>
                                </View>
                            ) : null}
                        </View>
                        <Text style={styles.eventSubtitle} numberOfLines={1}>
                            {event.highlightText ? (
                                <Text style={[styles.eventHighlight, { color: kindColor }]}>
                                    {event.highlightText}
                                </Text>
                            ) : null}
                            {event.highlightText ? ' • ' : ''}
                            {event.subtitle}
                        </Text>
                    </View>
                </View>

                {event.action === 'check' ? (
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={[
                            styles.roundActionButton,
                            { backgroundColor: withOpacity(kindColor, event.done ? 1 : 0.12) },
                        ]}
                    >
                        <Check size={15} color={event.done ? colors.white : kindColor} strokeWidth={2.6} />
                    </TouchableOpacity>
                ) : null}
                {event.action === 'none' ? (
                    <View style={styles.roundActionButtonStatic}>
                        <CheckCircle size={16} color={colors.primary} strokeWidth={2.2} />
                    </View>
                ) : null}
                {event.action === 'log' ? (
                    <TouchableOpacity activeOpacity={0.85} style={styles.logPill}>
                        <Text style={styles.logPillText}>Log</Text>
                    </TouchableOpacity>
                ) : null}
                {event.action === 'more' ? (
                    <TouchableOpacity activeOpacity={0.7} style={styles.roundActionButtonMuted}>
                        <EllipsisVertical size={16} color={colors.textSecondary} strokeWidth={2.2} />
                    </TouchableOpacity>
                ) : null}
                {event.action === 'alarm' ? (
                    <TouchableOpacity activeOpacity={0.7} style={styles.roundActionButtonMuted}>
                        <AlarmClock size={16} color={colors.textSecondary} strokeWidth={2.2} />
                    </TouchableOpacity>
                ) : null}
            </View>
        );
    };

    const renderTimelineRow = (event: TimelineEvent, isLast: boolean) => (
        <View key={event.id} style={[styles.timelineRow, isLast && styles.timelineRowLast]}>
            <View style={styles.timeColumn}>
                <Text style={styles.timeText}>{event.time}</Text>
                <Text style={styles.periodText}>{event.period}</Text>
            </View>
            <View style={styles.nodeColumn}>
                <View style={styles.nodePip}>
                    <View style={[styles.nodeDot, { backgroundColor: KIND_COLOR[event.kind] }]} />
                </View>
                {!isLast ? <View style={styles.nodeLine} /> : null}
            </View>
            <View style={styles.eventCardWrapper}>{renderEventCard(event)}</View>
        </View>
    );

    return (
        <View style={styles.root}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Month / view selector bar */}
                <View style={styles.monthBarRow}>
                    <View style={styles.monthBarLeft}>
                        <TouchableOpacity activeOpacity={0.7} style={styles.monthPill}>
                            <Text style={styles.monthPillText}>October 2024</Text>
                            <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.4} />
                        </TouchableOpacity>
                        <View style={styles.weekPill}>
                            <Text style={styles.weekPillText}>Week 42</Text>
                        </View>
                    </View>

                    <View style={styles.viewToggle}>
                        <TouchableOpacity activeOpacity={0.8} style={[styles.viewToggleButton, styles.viewToggleButtonActive]}>
                            <Rows3 size={16} color={colors.primary} strokeWidth={2.4} />
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.8} style={styles.viewToggleButton}>
                            <Calendar size={16} color={colors.textSecondary} strokeWidth={2.2} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Date strip */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dateStrip}
                >
                    {DATE_STRIP.map((tile, index) => {
                        const active = index === activeDateIndex;
                        return (
                            <TouchableOpacity
                                key={tile.date}
                                activeOpacity={0.85}
                                onPress={() => setActiveDateIndex(index)}
                                style={[styles.dateTile, active && styles.dateTileActive]}
                            >
                                <Text style={[styles.dateTileDay, active && styles.dateTileDayActive]}>
                                    {tile.day}
                                </Text>
                                <Text style={[styles.dateTileNum, active && styles.dateTileNumActive]}>
                                    {tile.date}
                                </Text>
                                {active ? (
                                    <View style={styles.dateTileDotRow}>
                                        <View style={[styles.dateTileDot, { backgroundColor: colors.white }]} />
                                        <View style={[styles.dateTileDot, { backgroundColor: colors.secondaryGlow }]} />
                                    </View>
                                ) : (
                                    <View
                                        style={[
                                            styles.dateTileDot,
                                            { backgroundColor: tile.dotColor ?? 'transparent' },
                                        ]}
                                    />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Filter chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterRow}
                >
                    {FILTERS.map((filter) => {
                        const active = filter.key === activeFilter;
                        return (
                            <TouchableOpacity
                                key={filter.key}
                                activeOpacity={0.85}
                                onPress={() => setActiveFilter(filter.key)}
                                style={[styles.filterChip, active && styles.filterChipActive]}
                            >
                                {filter.dotColor ? (
                                    <View style={[styles.filterDot, { backgroundColor: filter.dotColor }]} />
                                ) : null}
                                <Text
                                    style={[styles.filterChipText, active && styles.filterChipTextActive]}
                                >
                                    {filter.label}
                                </Text>
                                {typeof filter.count === 'number' ? (
                                    <View style={styles.filterCountBadge}>
                                        <Text style={styles.filterCountText}>{filter.count}</Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Day highlights card */}
                <View style={styles.highlightsCard}>
                    <View style={styles.highlightsLeft}>
                        <View style={styles.gaugeWrapper}>
                            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
                                <Circle
                                    cx={GAUGE_SIZE / 2}
                                    cy={GAUGE_SIZE / 2}
                                    r={gaugeRadius}
                                    stroke={colors.surfaceContainer}
                                    strokeWidth={GAUGE_STROKE}
                                    fill="none"
                                />
                                <Circle
                                    cx={GAUGE_SIZE / 2}
                                    cy={GAUGE_SIZE / 2}
                                    r={gaugeRadius}
                                    stroke={colors.primary}
                                    strokeWidth={GAUGE_STROKE}
                                    strokeDasharray={gaugeCircumference}
                                    strokeDashoffset={gaugeDashOffset}
                                    strokeLinecap="round"
                                    fill="none"
                                    rotation={-90}
                                    originX={GAUGE_SIZE / 2}
                                    originY={GAUGE_SIZE / 2}
                                />
                            </Svg>
                            <Text style={styles.gaugeText}>{GAUGE_PERCENT}%</Text>
                        </View>
                        <View style={styles.highlightsTextBlock}>
                            <Text style={styles.highlightsTitle}>Wednesday Plan Flow</Text>
                            <Text style={styles.highlightsSubtitle}>
                                3 of 5 routine goals completed
                            </Text>
                        </View>
                    </View>
                    <View style={styles.highlightsIconStack}>
                        <View style={[styles.highlightsIconChip, { backgroundColor: withOpacity(colors.water, 0.16) }]}>
                            <Droplet size={12} color={colors.water} strokeWidth={2.4} />
                        </View>
                        <View style={[styles.highlightsIconChip, styles.highlightsIconChipOverlap, { backgroundColor: withOpacity(colors.secondary, 0.16) }]}>
                            <Salad size={12} color={colors.secondary} strokeWidth={2.4} />
                        </View>
                        <View style={[styles.highlightsIconChip, styles.highlightsIconChipOverlap, { backgroundColor: colors.primary }]}>
                            <Dumbbell size={12} color={colors.white} strokeWidth={2.4} />
                        </View>
                    </View>
                </View>

                {/* Vertical timeline */}
                <View style={styles.timeline}>
                    {TIMELINE.map((event, index) => renderTimelineRow(event, false))}

                    {/* Current time indicator */}
                    <View style={styles.nowRow}>
                        <View style={styles.timeColumn} />
                        <View style={styles.nodeColumn}>
                            <View style={styles.nowDot} />
                        </View>
                        <View style={styles.nowLineWrapper}>
                            <View style={styles.nowLine} />
                            <View style={styles.nowPill}>
                                <Text style={styles.nowPillText}>Now • 04:45 PM</Text>
                            </View>
                        </View>
                    </View>

                    {/* Featured workout hero card */}
                    <View style={styles.timelineRow}>
                        <View style={styles.timeColumn}>
                            <Text style={[styles.timeText, styles.timeTextPrimary]}>05:30</Text>
                            <Text style={[styles.periodText, styles.periodTextPrimary]}>PM</Text>
                        </View>
                        <View style={styles.nodeColumn}>
                            <View style={styles.nodePipHighlight}>
                                <View style={styles.nodeDotWhite} />
                            </View>
                            <View style={styles.nodeLine} />
                        </View>
                        <View style={styles.eventCardWrapper}>
                            <View style={styles.workoutHeroCard}>
                                <View style={styles.heroGlow} />
                                <View style={styles.heroTopRow}>
                                    <View style={styles.heroTopLeft}>
                                        <View style={styles.heroBadge}>
                                            <Text style={styles.heroBadgeText}>Hypertrophy</Text>
                                        </View>
                                        <View style={styles.heroDurationRow}>
                                            <Timer size={13} color={withOpacity(colors.white, 0.85)} strokeWidth={2.4} />
                                            <Text style={styles.heroDurationText}>55 mins</Text>
                                        </View>
                                    </View>
                                    <View style={styles.heroIconCircle}>
                                        <Dumbbell size={17} color={colors.white} strokeWidth={2.2} />
                                    </View>
                                </View>

                                <Text style={styles.heroTitle}>Chest & Triceps Push Day</Text>
                                <Text style={styles.heroSubtitle}>
                                    Bench Press, Incline DB, Cable Flys, Dips
                                </Text>

                                <View style={styles.heroStatsRow}>
                                    <View style={styles.heroStatsLeft}>
                                        <View>
                                            <Text style={styles.heroStatLabel}>Intensity</Text>
                                            <Text style={styles.heroStatValue}>RPE 8.5</Text>
                                        </View>
                                        <View style={styles.heroStatDivider} />
                                        <View>
                                            <Text style={styles.heroStatLabel}>Target Burn</Text>
                                            <Text style={styles.heroStatValue}>420 kcal</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity activeOpacity={0.85} style={styles.heroStartButton}>
                                        <Text style={styles.heroStartButtonText}>Start Now</Text>
                                        <Play size={13} color={colors.primary} strokeWidth={2.6} fill={colors.primary} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>

                    {AFTER_NOW.map((event, index) =>
                        renderTimelineRow(event, index === AFTER_NOW.length - 1),
                    )}
                </View>

                {/* Motivation snippet */}
                <TouchableOpacity activeOpacity={0.85} style={styles.motivationCard}>
                    <View style={styles.motivationIcon}>
                        <Zap size={20} color={colors.secondary} strokeWidth={2.2} />
                    </View>
                    <View style={styles.motivationTextBlock}>
                        <Text style={styles.motivationTitle}>Consistent Streak: 12 Days</Text>
                        <Text style={styles.motivationSubtitle} numberOfLines={1}>
                            Push day workout is the final anchor today!
                        </Text>
                    </View>
                    <ChevronRight size={18} color={colors.primary} strokeWidth={2.4} />
                </TouchableOpacity>

                <View style={styles.fabSpacer} />
            </ScrollView>

            <TouchableOpacity activeOpacity={0.85} style={styles.fab}>
                <Plus size={18} color={colors.white} strokeWidth={2.6} />
                <Text style={styles.fabText}>Add Event</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 32,
        gap: 16,
    },
    monthBarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    monthBarLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    monthPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.surfaceContainer,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
    },
    monthPillText: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    weekPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    weekPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.primary,
    },
    viewToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: colors.surfaceLow,
        borderRadius: 18,
        padding: 3,
    },
    viewToggleButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewToggleButtonActive: {
        backgroundColor: colors.surface,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 1,
    },
    dateStrip: {
        gap: 8,
        paddingVertical: 2,
    },
    dateTile: {
        width: 50,
        paddingVertical: 10,
        borderRadius: 16,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 1,
    },
    dateTileActive: {
        backgroundColor: colors.primary,
        paddingVertical: 12,
        shadowColor: colors.primary,
        shadowOpacity: 0.32,
        shadowRadius: 12,
        elevation: 4,
    },
    dateTileDay: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    dateTileDayActive: {
        color: withOpacity(colors.white, 0.9),
    },
    dateTileNum: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    dateTileNumActive: {
        color: colors.white,
        fontSize: 17,
    },
    dateTileDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
    },
    dateTileDotRow: {
        flexDirection: 'row',
        gap: 3,
    },
    filterRow: {
        gap: 8,
        paddingVertical: 2,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    filterChipActive: {
        backgroundColor: colors.textPrimary,
    },
    filterDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    filterChipText: {
        fontSize: 12.5,
        fontWeight: '600',
        color: colors.textSecondary,
    },
    filterChipTextActive: {
        color: colors.surface,
        fontWeight: '700',
    },
    filterCountBadge: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: withOpacity(colors.white, 0.2),
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterCountText: {
        fontSize: 9.5,
        fontWeight: '800',
        color: colors.surface,
    },
    highlightsCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceLow,
        borderRadius: 18,
        padding: 14,
    },
    highlightsLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexShrink: 1,
    },
    gaugeWrapper: {
        width: GAUGE_SIZE,
        height: GAUGE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gaugeText: {
        position: 'absolute',
        fontSize: 10,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    highlightsTextBlock: {
        flexShrink: 1,
    },
    highlightsTitle: {
        fontSize: 13.5,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    highlightsSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    highlightsIconStack: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    highlightsIconChip: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.surfaceLow,
    },
    highlightsIconChipOverlap: {
        marginLeft: -6,
    },
    timeline: {
        marginTop: 4,
    },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    timelineRowLast: {
        marginBottom: 0,
    },
    timeColumn: {
        width: 44,
        alignItems: 'flex-end',
        paddingTop: 4,
        paddingRight: 8,
    },
    timeText: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    timeTextPrimary: {
        color: colors.primary,
    },
    periodText: {
        fontSize: 9,
        fontWeight: '700',
        color: colors.textSecondary,
        marginTop: 1,
    },
    periodTextPrimary: {
        color: colors.primary,
    },
    nodeColumn: {
        width: 20,
        alignItems: 'center',
    },
    nodePip: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
    },
    nodePipHighlight: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        shadowColor: colors.primary,
        shadowOpacity: 0.4,
        shadowRadius: 6,
    },
    nodeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    nodeDotWhite: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.white,
    },
    nodeLine: {
        width: 2,
        flex: 1,
        minHeight: 20,
        backgroundColor: colors.surfaceContainer,
        marginTop: 2,
    },
    eventCardWrapper: {
        flex: 1,
        minWidth: 0,
    },
    eventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surface,
        borderRadius: 18,
        padding: 12,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 14,
        elevation: 2,
    },
    eventCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
    },
    eventIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eventTextBlock: {
        flexShrink: 1,
        minWidth: 0,
    },
    eventTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 1,
    },
    eventTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.textPrimary,
        flexShrink: 1,
    },
    eventBadge: {
        backgroundColor: withOpacity(colors.secondary, 0.16),
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    eventBadgeText: {
        fontSize: 9.5,
        fontWeight: '800',
        color: colors.secondary,
    },
    eventSubtitle: {
        fontSize: 11.5,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    eventHighlight: {
        fontWeight: '800',
    },
    roundActionButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    roundActionButtonStatic: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainer,
    },
    roundActionButtonMuted: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainer,
    },
    logPill: {
        backgroundColor: withOpacity(colors.secondary, 0.14),
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 14,
    },
    logPillText: {
        fontSize: 11.5,
        fontWeight: '800',
        color: colors.secondary,
    },
    nowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    nowDot: {
        width: 9,
        height: 9,
        borderRadius: 4.5,
        backgroundColor: colors.primary,
    },
    nowLineWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    nowLine: {
        flex: 1,
        height: 2,
        backgroundColor: withOpacity(colors.primary, 0.3),
    },
    nowPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    nowPillText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.primary,
        letterSpacing: 0.2,
    },
    workoutHeroCard: {
        borderRadius: 20,
        padding: 16,
        backgroundColor: colors.primary,
        overflow: 'hidden',
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.32,
        shadowRadius: 20,
        elevation: 6,
    },
    heroGlow: {
        position: 'absolute',
        right: -24,
        bottom: -24,
        width: 112,
        height: 112,
        borderRadius: 56,
        backgroundColor: withOpacity(colors.white, 0.12),
    },
    heroTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    heroTopLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
    },
    heroBadge: {
        backgroundColor: withOpacity(colors.white, 0.2),
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 10,
    },
    heroBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.white,
        letterSpacing: 0.3,
    },
    heroDurationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    heroDurationText: {
        fontSize: 11.5,
        fontWeight: '600',
        color: withOpacity(colors.white, 0.85),
    },
    heroIconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: withOpacity(colors.white, 0.2),
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.white,
        marginTop: 10,
        letterSpacing: -0.2,
    },
    heroSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: withOpacity(colors.white, 0.85),
        marginTop: 3,
    },
    heroStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: withOpacity(colors.white, 0.18),
    },
    heroStatsLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    heroStatLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: withOpacity(colors.white, 0.75),
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    heroStatValue: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.white,
        marginTop: 2,
    },
    heroStatDivider: {
        width: 1,
        height: 22,
        backgroundColor: withOpacity(colors.white, 0.2),
    },
    heroStartButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 18,
    },
    heroStartButtonText: {
        fontSize: 12.5,
        fontWeight: '800',
        color: colors.primary,
    },
    motivationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surfaceLow,
        borderRadius: 18,
        padding: 14,
    },
    motivationIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: withOpacity(colors.secondary, 0.14),
        alignItems: 'center',
        justifyContent: 'center',
    },
    motivationTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    motivationTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.textPrimary,
    },
    motivationSubtitle: {
        fontSize: 11.5,
        fontWeight: '500',
        color: colors.textSecondary,
        marginTop: 2,
    },
    fabSpacer: {
        height: 56,
    },
    fab: {
        position: 'absolute',
        right: 0,
        bottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.secondary,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 26,
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 6,
    },
    fabText: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.white,
    },
});

export default ScheduleSession;
