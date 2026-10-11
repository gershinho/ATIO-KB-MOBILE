import React from 'react';
import { StyleSheet, View } from 'react-native';
import Icon from './icons/Icon';
import AppText from './AppText';
import { COLORS, RADIUS } from '../theme/fao';

/**
 * The alpha disclaimer, shown in the About section of Settings.
 */
export default function AlphaDisclaimer() {
  return (
    <View style={styles.strip}>
      <Icon name="warning-outline" size={16} color={COLORS.accent} style={styles.icon} />
      <AppText style={styles.text}>
        <AppText style={styles.title}>Alpha version. </AppText>
        This version is not an official product of FAO yet. It is an alpha version used to
        experiment and gather input. This app has not been cleared by FAO. Neither the quality of
        the data nor the use of AI have been yet checked against FAO standards and rules.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.accentTint,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 10,
  },
  icon: { marginTop: 1 },
  text: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.textBody },
  title: { fontWeight: '700', color: COLORS.textHeading },
});
