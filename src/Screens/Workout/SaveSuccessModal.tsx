import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';

interface SaveSuccessModalProps {
  onClose: () => void;
  targetHour: string;
  targetMinute: string;
  targetPeriod: 'AM' | 'PM';
  cadenceSummary: string;
}

export const SaveSuccessModal: React.FC<SaveSuccessModalProps> = ({
  onClose,
  targetHour,
  targetMinute,
  targetPeriod,
  cadenceSummary,
}) => {
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
          <View style={styles.iconBox}>
            <CheckCircle2 size={26} color={colors.primary} />
          </View>
          <Text style={styles.title}>Workout Plan Saved!</Text>
          <Text style={styles.body}>
            Your <Text style={styles.bodyStrong}>Push Pull Legs</Text> schedule has been auto-locked
            for {targetHour}:{targetMinute} {targetPeriod} on {cadenceSummary}.
          </Text>
          <Pressable onPress={onClose} style={styles.doneBtn}>
            <Text style={styles.doneText}>Done</Text>
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
    backgroundColor: withOpacity(colors.black, 0.6),
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: withOpacity(colors.primary, 0.5),
    padding: 20,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pillBackground,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.white },
  body: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  bodyStrong: { color: colors.white, fontWeight: '700' },
  doneBtn: {
    width: '100%',
    height: 40,
    marginTop: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
});

export default SaveSuccessModal;
