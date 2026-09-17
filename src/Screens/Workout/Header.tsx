import React from 'react';
import { View, Text, Image } from 'react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing, radius } from '../../Theme/spacing';
import { themedStyles } from '../../Theme/ThemeContext';

export const Header: React.FC = () => {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: withOpacity(colors.background, 0.9) },
      ]}
    >
      <View style={styles.left}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>FT</Text>
        </View>
        <Text style={styles.brand}>FITTRACK</Text>
      </View>

      <View style={styles.right}>
        <Text style={styles.homeLabel}>Home</Text>
        <Image
          style={styles.avatar}
          source={{
            uri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
          }}
        />
      </View>
    </View>
  );
};

const styles = themedStyles(() => ({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(colors.white, 0.06),
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.pillBackground,
    borderWidth: 1,
    borderColor: withOpacity(colors.success, 0.6),
  },
  logoText: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
  },
  brand: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: -0.3,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  homeLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: withOpacity(colors.white, 0.1),
  },
}));

export default Header;
