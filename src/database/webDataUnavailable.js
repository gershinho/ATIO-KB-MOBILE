/**
 * The one error the web build raises when something asks for the bundled
 * catalogue.
 *
 * It lives in its own platform-neutral module rather than inside
 * connection.web.js so that UI code can import it on either platform: on a
 * phone this file is simply never thrown from, and costs a few bytes.
 *
 * It no longer reaches a screen. It used to carry the copy shown where Explore
 * and the heat maps would have been, because the web build had no catalogue to
 * compute them from; both now read the FAO JSON:API, so that copy is gone and
 * this is what remains: a guard that says plainly what happened if anything
 * ever asks the web build for SQLite.
 */

/** Thrown by connection.web.js. Never thrown on native. */
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
