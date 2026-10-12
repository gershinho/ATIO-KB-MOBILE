import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import BouncingLoader from './BouncingLoader';
import Icon from './icons/Icon';
import AppText from './AppText';
import { COLORS } from '../theme/fao';

/**
 * What the search shows while the AI call is in flight.
 *
 * The steps are staged, not reported: the search is one request with no
 * progress events, so these advance on a timer and the last one holds until
 * the results arrive. They describe what the pipeline really does, in order,
 * so the wait reads as work rather than as a stall.
 */
const STEPS = [
  'Understanding your question',
  'Finding related farming terms',
  'Searching the ATIO catalogue',
  'Matching innovations to your challenge',
  'Ranking by readiness and adoption',
];

const STEP_MS = 1300;

/**
 * Remounted with every search, so it always starts from the first step.
 * `reduceMotion` drops the fade and the pulse; the steps still advance.
 */
export default function ThinkingSteps({ reduceMotion = false }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (current >= STEPS.length - 1) return undefined;
    const t = setTimeout(() => setCurrent((c) => c + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [current]);

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <BouncingLoader width={80} height={66} reduceMotion={reduceMotion} />
      <View style={styles.list}>
        {STEPS.slice(0, current + 1).map((label, i) => (
          <Step key={label} label={label} done={i < current} reduceMotion={reduceMotion} />
        ))}
      </View>
    </View>
  );
}

function Step({ label, done, reduceMotion }) {
  const fade = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fade, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || done) {
      pulse.setValue(1);
      return undefined;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, done, reduceMotion]);

  return (
    <Animated.View style={[styles.row, { opacity: fade }]}>
      {done ? (
        <View style={styles.check}>
          <Icon name="checkmark" size={10} color={COLORS.textInverse} />
        </View>
      ) : (
        <View style={styles.dotWrap}>
          <Animated.View style={[styles.dot, { opacity: pulse }]} />
        </View>
      )}
      <AppText style={[styles.label, done ? styles.labelDone : styles.labelActive]}>
        {done ? label : `${label}…`}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 32 },
  // Sized to its longest line and centred, so the rows stay left-aligned.
  list: { marginTop: 20, gap: 10, minWidth: 260 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  label: { fontSize: 13 },
  labelDone: { color: COLORS.textMuted },
  labelActive: { color: COLORS.textHeading, fontWeight: '600' },
});
