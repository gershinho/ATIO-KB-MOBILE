/**
 * Export an innovation to a file and open the system share/save dialog
 * so the user can save it to Files (iOS) or Downloads (Android).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { sanitizeFilename, buildTextContent } from './innovationDocument';

/**
 * Export innovation to a text file and open the share/save dialog.
 * @param {object} innovation - Full innovation object (from DB or list)
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function downloadInnovationToFile(innovation) {
  if (!innovation || !innovation.id) {
    return { success: false, error: 'Invalid solution' };
  }

  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, error: 'Sharing is not available on this device' };
    }

    // Documents survives; cache can be reclaimed by the system. The file is
    // handed straight to the share sheet, so either works — this only prefers
    // the durable one.
    const directory = Paths.document ?? Paths.cache;
    if (!directory) {
      return { success: false, error: 'No storage directory available' };
    }

    const filename = `ATIO_${innovation.id}_${sanitizeFilename(innovation.title)}.txt`;
    const file = new File(directory, filename);
    // Overwrite rather than fail: exporting the same solution twice is normal.
    file.create({ overwrite: true, intermediates: true });
    file.write(buildTextContent(innovation));

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/plain',
      dialogTitle: 'Save solution',
      UTI: 'public.plain-text',
    });

    return { success: true };
  } catch (e) {
    console.warn('[download] Export failed:', e);
    return { success: false, error: e?.message || String(e) };
  }
}
