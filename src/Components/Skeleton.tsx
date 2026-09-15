import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { colors } from '../Theme/colors';

// Shared loading placeholders.
//
// Anything that waits on Firestore or the exercise API shows one of
// these rather than its empty state. That distinction is the whole
// point: an empty list is a *claim* — "you have no plans", "nothing
// logged today" — and making that claim before the data arrives is
// wrong as often as it is right. A skeleton says "not yet", which is
// the only honest thing to say while a request is in flight.
//
// Everything here shares one pulse timing, so several skeletons on the
// same screen breathe in step instead of drifting apart.

const PULSE_DURATION = 750;
const PULSE_FROM = 0.45;

/** The shared loading pulse. */
export function usePulseStyle() {
    const pulse = useSharedValue(PULSE_FROM);

    React.useEffect(() => {
        pulse.value = withRepeat(withTiming(1, { duration: PULSE_DURATION }), -1, true);
    }, [pulse]);

    return useAnimatedStyle(() => ({ opacity: pulse.value }));
}

export interface SkeletonBlockProps {
    width?: ViewStyle['width'];
    height?: number;
    radius?: number;
    style?: ViewStyle | ViewStyle[];
}

/**
 * One grey block. Not animated itself — wrap a group in
 * <SkeletonGroup> so the whole placeholder pulses as a unit rather than
 * each block running its own timer.
 */
export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
    width = '100%',
    height = 12,
    radius = 6,
    style,
}) => (
    <View
        style={[
            styles.block,
            { width, height, borderRadius: radius },
            style as ViewStyle,
        ]}
    />
);

export interface SkeletonGroupProps {
    children: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
}

/** Pulses everything inside it together. */
export const SkeletonGroup: React.FC<SkeletonGroupProps> = ({ children, style }) => {
    const pulseStyle = usePulseStyle();
    return <Animated.View style={[style as ViewStyle, pulseStyle]}>{children}</Animated.View>;
};

/** A card-shaped placeholder: icon, two lines of text, optional footer.
 * Covers the common "list of cards" case on every tab. */
export const SkeletonCard: React.FC<{ withFooter?: boolean; style?: ViewStyle }> = ({
    withFooter = false,
    style,
}) => (
    <SkeletonGroup style={[styles.card, style as ViewStyle]}>
        <View style={styles.cardTop}>
            <SkeletonBlock width={44} height={44} radius={14} />
            <View style={styles.cardText}>
                <SkeletonBlock width="65%" height={11} />
                <SkeletonBlock width="40%" height={9} radius={5} />
            </View>
        </View>
        {withFooter ? <SkeletonBlock height={38} radius={14} /> : null}
    </SkeletonGroup>
);

const styles = StyleSheet.create({
    block: {
        backgroundColor: colors.surfaceContainer,
    },
    card: {
        padding: 14,
        borderRadius: 18,
        backgroundColor: colors.surfaceLow,
        gap: 12,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardText: { flex: 1, gap: 7 },
});

export default SkeletonBlock;
