import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Colors } from '../theme';

type Props = {
  size?: 'small' | 'large';
  color?: string;
  fullScreen?: boolean;
};

export function LoadingSpinner({
  size = 'large',
  color = Colors.primary,
  fullScreen = false,
}: Props) {
  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }

  return <ActivityIndicator size={size} color={color} style={styles.inline} />;
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inline: {
    padding: 16,
  },
});
