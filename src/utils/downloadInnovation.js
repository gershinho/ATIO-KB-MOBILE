/**
 * Export an innovation to a file and open the system share/save dialog
 * so the user can save it to Files (iOS) or Downloads (Android).
 */
import * as FileSystem from 'expo-file-system/legacy';
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

    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!dir) {
      return { success: false, error: 'No storage directory available' };
    }

    const safeTitle = sanitizeFilename(innovation.title);
    const filename = `ATIO_${innovation.id}_${safeTitle}.txt`;
    const fileUri = `${dir}${filename}`;

    const content = buildTextContent(innovation);
    await FileSystem.writeAsStringAsync(fileUri, content);

    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/plain',
      dialogTitle: 'Save solution',
      UTI: 'public.plain-text',
    });

    return { success: true };
  } catch (e) {
    console.warn('downloadInnovationToFile error:', e);
    return { success: false, error: e?.message || String(e) };
  }
}
