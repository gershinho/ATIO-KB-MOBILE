/**
 * Web twin of downloadInnovation.js.
 *
 * The native file writes a text file with expo-file-system and hands it to the
 * system share sheet through expo-sharing. Neither exists in a browser, and
 * replacing this file keeps both out of the web bundle.
 *
 * A browser does the same job with an object URL and a link click, which is
 * what "Save" means on the web: the file lands in the user's Downloads folder.
 * The Web Share API is deliberately not used — sharing files through it is
 * unevenly supported and silently unavailable on desktop, whereas a download
 * link behaves the same everywhere.
 *
 * The text itself comes from the same builder the native path uses, so both
 * platforms export byte-identical documents.
 */
import { sanitizeFilename, buildTextContent } from './innovationDocument';
import { createLogger } from './logger';

const log = createLogger('download.web');

/**
 * Export an innovation to a file the browser saves.
 *
 * Returns the same {success, error} shape as the native twin, which
 * useDownloadPipeline surfaces in an alert when success is false.
 *
 * @param {object} innovation - Full innovation object
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function downloadInnovationToFile(innovation) {
  if (!innovation || !innovation.id) {
    return { success: false, error: 'Invalid solution' };
  }

  // Server-rendered or test environments have no DOM to click a link in.
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return { success: false, error: 'Saving files is not available in this browser' };
  }

  let objectUrl = null;
  try {
    const filename = `ATIO_${innovation.id}_${sanitizeFilename(innovation.title)}.txt`;
    const blob = new Blob([buildTextContent(innovation)], {
      type: 'text/plain;charset=utf-8',
    });
    objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    // Firefox only honours a click on an element that is in the document.
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    return { success: true };
  } catch (e) {
    log.failed('Export failed:', e);
    return { success: false, error: e?.message || String(e) };
  } finally {
    // Revoking immediately can cancel the download in some browsers; a tick
    // later the navigation has started and the memory can go back.
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}
