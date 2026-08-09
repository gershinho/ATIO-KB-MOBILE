import { act } from '@testing-library/react-native';

/**
 * Let mount effects finish before a test asserts.
 *
 * A single `await act(async () => {})` advances the microtask queue once, which
 * is not enough for an effect that awaits through more than one layer —
 * readLikedIds awaits readArray awaits AsyncStorage, so its setState lands on
 * the third tick. When it lands after the test body, React reports it as an
 * unwrapped act() update, and the suite starts depending on timing rather than
 * on behaviour.
 *
 * Draining a few ticks rather than one is deliberate: the exact depth is an
 * implementation detail of the hook under test, and a helper that has to be
 * updated whenever a hook gains an await is the problem, not the fix.
 */
export default async function flushEffects(ticks = 4) {
  for (let i = 0; i < ticks; i += 1) {
    await act(async () => {});
  }
}
