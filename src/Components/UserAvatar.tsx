// The signed-in user's picture, wherever it appears — the dashboard's
// top-bar badge and greeting, the Profile tab's header.
//
// Reads the photo straight from the store rather than taking it as a
// prop, so a newly uploaded picture appears everywhere at once and no
// screen can drift out of step with another. Falls back to a person
// glyph when the user has not set one.
import React from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { User } from 'lucide-react-native';
import { colors } from '../Theme/colors';
import { useAppSelector } from '../Store/hooks';
import { selectUserPhotoUrl } from '../Store/userProfileSlice';

export interface UserAvatarProps {
  /** Diameter in px. */
  size: number;
  /** Background behind the fallback glyph. */
  background?: string;
  iconColor?: string;
  /** Icon size; defaults to just under half the avatar. */
  iconSize?: number;
  style?: ViewStyle;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  size,
  background = colors.primary,
  iconColor = colors.white,
  iconSize,
  style,
}) => {
  const photoURL = useAppSelector(selectUserPhotoUrl);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
        },
        style,
      ]}
    >
      {photoURL ? (
        <Image source={{ uri: photoURL }} style={styles.image} />
      ) : (
        <User size={iconSize ?? Math.round(size * 0.46)} color={iconColor} strokeWidth={2.2} />
      )}
    </View>
  );
};

export default UserAvatar;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    // Clips a rectangular photo into the circle.
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
});
