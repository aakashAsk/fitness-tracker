import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../Theme/colors';
import { typography } from '../../Theme/typography';
import { spacing } from '../../Theme/spacing';
import TimelineCard, { TimelineCardData } from './TimelineCard';

export type TimelineRowData =
  | { id: string; time: string; kind: 'note'; text: string }
  | { id: string; time: string; kind: 'cards'; cards: TimelineCardData[] };

export default function TimelineRow({ row }: { row: TimelineRowData }) {
  const hasContent = row.kind === 'cards';

  return (
    <View style={styles.row}>
      <View style={styles.timeColumn}>
        <Text style={styles.timeText}>{row.time}</Text>
      </View>

      <View style={styles.railColumn}>
        <View style={[styles.railDot, hasContent && styles.railDotFilled]} />
        <View style={styles.railLine} />
      </View>

      <View style={styles.content}>
        {row.kind === 'note' ? (
          <Text style={styles.noteText}>{row.text}</Text>
        ) : (
          <View style={styles.cardsStack}>
            {row.cards.map((card) => (
              <TimelineCard key={card.id} data={card} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    minHeight: 56,
  },
  timeColumn: {
    width: 66,
    paddingTop: 2,
  },
  timeText: {
    ...typography.labelRegular,
    color: colors.onSurfaceVariant,
  },
  railColumn: {
    width: 16,
    alignItems: 'center',
  },
  railDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceContainerHigh,
    marginTop: 4,
  },
  railDotFilled: {
    backgroundColor: colors.primaryContainer,
  },
  railLine: {
    flex: 1,
    width: 1,
    backgroundColor: colors.surfaceContainerHigh,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingBottom: spacing.sm,
    paddingRight: 2,
  },
  noteText: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    paddingTop: 2,
  },
  cardsStack: {
    gap: spacing.xs,
  },
});
