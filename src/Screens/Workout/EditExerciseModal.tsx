import React, { useState } from 'react';
import { Modal, View, Text, Pressable, TextInput } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { ExerciseItem } from './Types';
import { themedStyles } from '../../Theme/ThemeContext';

interface EditExerciseModalProps {
  exercise: ExerciseItem;
  onChange: (exercise: ExerciseItem) => void;
  onClose: () => void;
  onSave: (exercise: ExerciseItem) => void;
}

export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({ exercise, onChange, onClose, onSave }) => {
  const [focused, setFocused] = useState<string | null>(null);

  const fieldStyle = (key: string) => [
    styles.input,
    focused === key && styles.inputFocused,
  ];

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
            <Text style={styles.headerTitle}>Edit Movement</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Exercise Name</Text>
              <TextInput
                value={exercise.name}
                onChangeText={(text) => onChange({ ...exercise, name: text })}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
                style={fieldStyle('name')}
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.grid}>
              <View style={styles.gridCol}>
                <Text style={styles.label}>Sets</Text>
                <TextInput
                  value={String(exercise.sets)}
                  keyboardType="number-pad"
                  onChangeText={(text) =>
                    onChange({ ...exercise, sets: parseInt(text, 10) || 1 })
                  }
                  onFocus={() => setFocused('sets')}
                  onBlur={() => setFocused(null)}
                  style={fieldStyle('sets')}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.gridCol}>
                <Text style={styles.label}>Reps Range</Text>
                <TextInput
                  value={exercise.reps}
                  onChangeText={(text) => onChange({ ...exercise, reps: text })}
                  onFocus={() => setFocused('reps')}
                  onBlur={() => setFocused(null)}
                  style={fieldStyle('reps')}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View>
              <Text style={styles.label}>Rest Interval</Text>
              <TextInput
                value={exercise.rest}
                onChangeText={(text) => onChange({ ...exercise, rest: text })}
                onFocus={() => setFocused('rest')}
                onBlur={() => setFocused(null)}
                style={fieldStyle('rest')}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <Pressable onPress={() => onSave(exercise)} style={styles.saveBtn}>
            <Text style={styles.saveText}>Update Exercise</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = themedStyles(() => ({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: withOpacity(colors.black, 0.75),
  },
  card: {
    width: '100%',
    maxWidth: 360,
    gap: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.white, 0.08),
  },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  form: { gap: 12 },
  label: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginBottom: 4 },
  input: {
    width: '100%',
    height: 40,
    paddingHorizontal: 12,
    fontSize: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    color: colors.white,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  inputFocused: { borderColor: colors.primary },
  grid: { flexDirection: 'row', gap: 8 },
  gridCol: { flex: 1 },
  saveBtn: {
    width: '100%',
    height: 40,
    marginTop: 4,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
}));

export default EditExerciseModal;
