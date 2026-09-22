/**
 * Web twin of dialogs.js.
 *
 * react-native-web's Alert is an empty function, so the native file's
 * confirmations would silently do nothing here. The browser's own window.confirm
 * and window.alert are modal and synchronous, which is exactly the behaviour the
 * callers expect — they await an answer before destroying anything.
 *
 * Deliberately plain rather than a styled in-app modal: this keeps the platform
 * boundary to one small file, and a native-looking custom dialog is UI work that
 * belongs with the design pass, not with the platform split.
 */

/** Combine the two lines into the single string these dialogs accept. */
function asText(title, message) {
  return message ? `${title}\n\n${message}` : title;
}

/** @see dialogs.js */
export function notify(title, message) {
  // No window under test or server rendering; a notice is not worth throwing over.
  if (typeof window === 'undefined' || typeof window.alert !== 'function') return;
  window.alert(asText(title, message));
}

/**
 * @see dialogs.js
 * @returns {Promise<boolean>} false when there is no window to ask, so a
 *   destructive action never proceeds unconfirmed.
 */
export function confirmAction({ title, message }) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return Promise.resolve(false);
  }
  return Promise.resolve(window.confirm(asText(title, message)));
}
