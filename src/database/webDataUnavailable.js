/**
 * The one error the web build raises when something asks for the bundled
 * catalogue.
 *
 * It lives in its own platform-neutral module rather than inside
 * connection.web.js so that UI code can import it on either platform: on a
 * phone this file is simply never thrown from, and costs a few bytes.
 */

/** Thrown by the web twin of the data layer. Never thrown on native. */
export class WebDataUnavailableError extends Error {
  constructor(message) {
    super(message || 'The bundled catalogue is not available in the web build.');
    this.name = 'WebDataUnavailableError';
    // A flag rather than an instanceof check: the class can cross module
    // boundaries (and Metro's platform resolution) and still be recognised.
    this.isWebDataUnavailable = true;
  }
}

/** True for the error above, whatever module instance produced it. */
export function isWebDataUnavailable(error) {
  return Boolean(error && error.isWebDataUnavailable);
}

/** The single sentence shown wherever the catalogue would have been. */
export const WEB_DATA_UNAVAILABLE_MESSAGE =
  "Browsing isn't available in the web preview yet.";

/**
 * The same thing, said where a heat map would have been. Kept separate because
 * "browsing" reads oddly inside a map the user has just opened deliberately.
 */
export const WEB_HEATMAP_UNAVAILABLE_MESSAGE =
  "Heat maps aren't available in the web preview yet.";
