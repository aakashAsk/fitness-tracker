import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../../Theme/colors';

// Presentational line/area chart. Takes plain numbers and draws them —
// it knows nothing about workouts, so both the volume card and any
// per-exercise chart can share one implementation.

const CHART_WIDTH = 320;
const CHART_HEIGHT = 90;
const PADDING_X = 10;
const PADDING_Y = 12;

interface Point {
    x: number;
    y: number;
}

/**
 * Catmull-Rom → cubic Bézier. Gives a smooth curve that still passes
 * exactly through every data point, unlike hand-placed control points.
 */
function toSmoothPath(points: Point[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i += 1) {
        const p0 = points[i - 1] ?? points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] ?? p2;

        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    return d;
}

export interface TrendGraphProps {
    values: number[];
    /** Gradient/line colour. Defaults to the app's primary. */
    color?: string;
    height?: number;
}

export const TrendGraph: React.FC<TrendGraphProps> = ({
    values,
    color = colors.primary,
    height = 110,
}) => {
    const geometry = useMemo(() => {
        if (values.length === 0) return null;

        const min = Math.min(...values);
        const max = Math.max(...values);
        // A flat series would divide by zero — give it a nominal spread
        // so the line sits mid-card rather than collapsing onto an edge.
        const span = max - min || Math.max(max * 0.1, 1);

        const usableWidth = CHART_WIDTH - PADDING_X * 2;
        const usableHeight = CHART_HEIGHT - PADDING_Y * 2;

        const points: Point[] = values.map((value, index) => ({
            // A single session sits centred rather than hard left.
            x:
                values.length === 1
                    ? CHART_WIDTH / 2
                    : PADDING_X + (usableWidth * index) / (values.length - 1),
            y: PADDING_Y + usableHeight * (1 - (value - min) / span),
        }));

        const line = toSmoothPath(points);
        const area = `${line} L ${points[points.length - 1].x} ${CHART_HEIGHT} L ${points[0].x} ${CHART_HEIGHT} Z`;

        return { points, line, area };
    }, [values]);

    if (!geometry) return null;

    // Dots get crowded past a dozen or so points; the line carries the
    // shape on its own at that density.
    const showDots = geometry.points.length <= 12;

    return (
        <View style={styles.wrap}>
            <Svg
                width="100%"
                height={height}
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            >
                <Defs>
                    <LinearGradient id="trendArea" x1="0" y1="0" x2="0" y2={CHART_HEIGHT}>
                        <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
                        <Stop offset="100%" stopColor={color} stopOpacity={0} />
                    </LinearGradient>
                </Defs>

                {[PADDING_Y, CHART_HEIGHT / 2, CHART_HEIGHT - PADDING_Y].map((y, index) => (
                    <Line
                        key={y}
                        x1={0}
                        y1={y}
                        x2={CHART_WIDTH}
                        y2={y}
                        stroke={colors.surfaceContainer}
                        strokeWidth={1}
                        strokeDasharray={index === 2 ? undefined : '3 3'}
                    />
                ))}

                <Path d={geometry.area} fill="url(#trendArea)" />
                <Path
                    d={geometry.line}
                    stroke={color}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />

                {geometry.points.map((point, index) => {
                    const isLast = index === geometry.points.length - 1;
                    if (!showDots && !isLast) return null;
                    return (
                        <Circle
                            key={`${point.x}-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r={isLast ? 5 : 3.5}
                            fill={isLast ? color : colors.white}
                            stroke={isLast ? colors.white : color}
                            strokeWidth={2.5}
                        />
                    );
                })}
            </Svg>
        </View>
    );
};

export default TrendGraph;

const styles = StyleSheet.create({
    wrap: {
        marginTop: 10,
    },
});
