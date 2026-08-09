import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import AtiobotPose3 from '../../assets/ATIOBOT poses 3 .svg';

/**
 * The mascot, bobbing, shown while an AI call is in flight.
 *
 * `reduceMotion` is honored by never starting the loop rather than by running
 * it at zero amplitude, so the animation driver stays idle entirely.
 */
export default function BouncingLoader({ width = 80, height = 66, style, reduceMotion = false }) {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 450, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [bounce, reduceMotion]);
  const translateY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  return (
    <Animated.View style={[style, { transform: [{ translateY }] }]}>
      <AtiobotPose3 width={width} height={height} />
    </Animated.View>
  );
}
