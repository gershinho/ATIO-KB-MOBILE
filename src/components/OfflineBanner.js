import React from 'react';
import { StyleSheet, View } from 'react-native';
import Icon from './icons/Icon';
import AppText from './AppText';
import { COLORS } from '../theme/fao';

/**
 * The strip above the tab bar while the browser is offline.
 *
 * It names what still works rather than just saying "offline", because the
 * app does keep working — over what this device saved — and a bare warning
 * reads as "nothing will load". The list matches what the data layer actually
 * serves offline: bookmarks, downloads, anything opened recently, and Explore's
 * saved figures.
 */
export default function OfflineBanner() {
  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name="cloud-offline-outline" size={16} color={COLORS.textInverse} />
      <AppText style={styles.text}>
        <AppText style={styles.title}>You are offline. </AppText>
        You can only see solutions saved on this device: your bookmarks, downloads and ones you opened recently.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: { flex: 1, fontSize: 12, lineHeight: 17, color: COLORS.textInverse },
  title: { fontWeight: '700', color: COLORS.textInverse },
});
