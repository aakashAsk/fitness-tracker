import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Play, X, Timer } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { ExerciseItem } from './Types';

interface StartWorkoutModalProps {
  exercises: ExerciseItem[];
  onClose: () => void;
  onBeginTracking: () => void;
}

export const StartWorkoutModal: React.FC<StartWorkoutModalProps> = ({ exercises, onClose, onBeginTracking }) => {
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onClose}
      // Without these the modal is its own window that stops at the
      // system bars, so the dim overlay leaves the status bar and the
      // navigation bar uncovered instead of dimming the whole screen.
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconBox}>
                <Play size={16} fill={colors.primary} color={colors.primary} />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>Push Day: Hypertrophy Focus</Text>
                <Text style={styles.headerMeta}>5 Movements · Estimated 520 kcal</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {exercises.map((item, idx) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemLeft}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{idx + 1}</Text>
                  </View>
                  <View>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {item.sets} sets · {item.reps}
                    </Text>
                  </View>
                </View>
                <Text style={styles.readyPill}>Ready</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <Timer size={14} color={colors.textSecondary} />
              <Text style={styles.footerText}>Timer ready (55 min)</Text>
            </View>
            <Pressable onPress={onBeginTracking} style={styles.beginBtn}>
              <Play size={14} fill={colors.onPrimary} color={colors.onPrimary} />
              <Text style={styles.beginText}>Begin Tracking</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: withOpacity(colors.black, 0.75),
  },
  card: {
    width: '100%',
    maxWidth: 448,
    gap: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.white, 0.08),
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.pillBackground,
    borderWidth: 1,
    borderColor: withOpacity(colors.success, 0.4),
  },
  headerTextWrap: { flexShrink: 1 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  headerMeta: { fontSize: 11, color: colors.textSecondary },
  list: { maxHeight: 240 },
  listContent: { gap: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
    padding: 12,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.white },
  itemName: { fontSize: 12, fontWeight: '700', color: colors.white },
  itemMeta: { fontSize: 11, color: colors.textSecondary },
  readyPill: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.pillBackground,
    borderWidth: 1,
    borderColor: withOpacity(colors.success, 0.3),
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: withOpacity(colors.white, 0.08),
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerText: { fontSize: 12, color: colors.textSecondary },
  beginBtn: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  beginText: { color: colors.onPrimary, fontWeight: '700', fontSize: 12 },
});

export default StartWorkoutModal;
