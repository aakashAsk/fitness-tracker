import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

interface SaveControlsProps {
  onSave: () => void;
  onSaveDraft: () => void;
}

export const SaveControls: React.FC<SaveControlsProps> = ({ onSave, onSaveDraft }) => {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onSave}
        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
      >
        <Text style={styles.primaryBtnText}>Save Workout Plan</Text>
        <ArrowRight size={18} strokeWidth={2.8} color={colors.onPrimary} />
      </Pressable>

      <Pressable
        onPress={onSaveDraft}
        style={({ pressed }) => [styles.draftBtn, pressed && styles.pressed]}
      >
        <Text style={styles.draftBtnText}>Save as Draft</Text>
      </Pressable>
    </View>
  );
};

const styles = themedStyles(() => ({
  container: { gap: 8, paddingTop: 4 },
  primaryBtn: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: colors.onPrimary, fontSize: 14, fontWeight: '800' },
  draftBtn: {
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.85 },
}));

export default SaveControls;
