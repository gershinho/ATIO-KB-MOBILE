/**
 * Confirmations and notices, as the platform provides them.
 *
 * react-native's Alert has no browser implementation: react-native-web ships
 * `class Alert { static alert() {} }` — an empty function. Every confirmation
 * built on it therefore did nothing at all on web, so the Downloads trash
 * button and both "Clear" buttons in Settings were dead, silently, with no
 * error to notice. Routing them through here gives the web build the browser's
 * own dialogs instead.
 *
 * The native half deliberately calls Alert.alert(title, message) with exactly
 * those two arguments for notices, which is the shape the existing tests assert.
 */
import { Alert } from 'react-native';

/**
 * Tell the user something went wrong. Never blocks.
 *
 * @param {string} title
 * @param {string} [message]
 */
export function notify(title, message) {
  Alert.alert(title, message);
}

/**
 * Ask the user to confirm an action, usually a destructive one.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.confirmLabel] - defaults to 'OK'
 * @param {string} [options.cancelLabel] - defaults to 'Cancel'
 * @param {boolean} [options.destructive] - styles the confirm button on iOS
 * @param {string} [options.confirmAccessibilityLabel]
 * @param {string} [options.cancelAccessibilityLabel]
 * @returns {Promise<boolean>} true only when the user confirmed. Dismissing the
 *   dialog counts as a cancel, so a caller can always trust a false.
 */
export function confirmAction({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
  confirmAccessibilityLabel,
  cancelAccessibilityLabel,
}) {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: cancelLabel,
          style: 'cancel',
          onPress: () => resolve(false),
          accessibilityLabel: cancelAccessibilityLabel,
        },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
          accessibilityLabel: confirmAccessibilityLabel,
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
