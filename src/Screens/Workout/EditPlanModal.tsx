import React, { useState } from 'react';
import { Modal, View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';

interface EditPlanModalProps {
  planTitle: string;
  onClose: () => void;
  onSave: () => void;
}

const FOCUS_OPTIONS = [
  'Hypertrophy Focus (Muscle Gain)',
  'Strength Focus (Powerlifting)',
  'Endurance & Conditioning',
  'Weight Loss & Deficit',
];

export const EditPlanModal: React.FC<EditPlanModalProps> = ({ planTitle, onClose, onSave }) => {
  const [title, setTitle] = useState(planTitle);
  const [focusCategory, setFocusCategory] = useState(FOCUS_OPTIONS[0]);
  const [titleFocused, setTitleFocused] = useState(false);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Plan Configuration</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View>
            <Text style={styles.label}>Plan Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
              style={[styles.input, titleFocused && styles.inputFocused]}
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View>
            <Text style={styles.label}>Focus Category</Text>
            <View style={styles.options}>
              {FOCUS_OPTIONS.map((opt) => {
                const isSelected = focusCategory === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setFocusCategory(opt)}
                    style={[styles.option, isSelected && styles.optionSelected]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: isSelected ? colors.white : colors.textSecondary },
                      ]}
                    >
                      {opt}
                    </Text>
                    {isSelected && <Check size={14} strokeWidth={3} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable onPress={onSave} style={styles.saveBtn}>
            <Text style={styles.saveText}>Save Changes</Text>
          </Pressable>
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
  options: { gap: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  optionSelected: { borderColor: colors.primary },
  optionText: { fontSize: 12, flexShrink: 1 },
  saveBtn: {
    width: '100%',
    height: 40,
    marginTop: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
});

export default EditPlanModal;
