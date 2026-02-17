/**
 * Export an innovation to a file and open the system share/save dialog
 * so the user can save it to Files (iOS) or Downloads (Android).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { READINESS_LEVELS, ADOPTION_LEVELS, SDGS } from '../data/constants';

function sanitizeFilename(title) {
  return (title || 'innovation')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function buildTextContent(innovation) {
  const readiness = READINESS_LEVELS.find((r) => r.level === innovation.readinessLevel) || READINESS_LEVELS[0];
  const adoption = ADOPTION_LEVELS.find((a) => a.level === innovation.adoptionLevel) || ADOPTION_LEVELS[0];
  const costLabel = innovation.cost === 'low' ? '$ Low / Free' : innovation.cost === 'high' ? '$$$ High' : '$$ Moderate';
  const complexLabel = innovation.complexity
    ? innovation.complexity.charAt(0).toUpperCase() + innovation.complexity.slice(1)
    : 'Moderate';

  const lines = [
    innovation.title || 'Untitled Innovation',
    '='.repeat(60),
    '',
    innovation.shortDescription || innovation.longDescription || '',
    '',
    '--- Overview ---',
    `Countries/Region: ${(innovation.countries && innovation.countries.join(', ')) || innovation.region || '—'}`,
    `Readiness: ${readiness.name}`,
    `Adoption: ${adoption.name}`,
    `Cost: ${costLabel}  |  Complexity: ${complexLabel}`,
    innovation.isGrassroots ? 'Grassroots innovation' : '',
    '',
  ];

  if (innovation.useCases && innovation.useCases.length > 0) {
    lines.push('--- Use cases ---', ...innovation.useCases.map((u) => `• ${u}`), '');
  }
  if (innovation.users && innovation.users.length > 0) {
    lines.push('--- Intended users ---', ...innovation.users.map((u) => `• ${u}`), '');
  }
  lines.push('--- Source ---', `${innovation.dataSource || '—'} | ${innovation.owner || innovation.partner || '—'}`, '');
  if (innovation.sdgs && innovation.sdgs.length > 0) {
    const sdgNames = innovation.sdgs
      .map((num) => {
        const s = SDGS.find((x) => x.number === num);
        return s ? `SDG ${num}: ${s.name}` : null;
      })
      .filter(Boolean);
    lines.push('--- SDG alignment ---', ...sdgNames, '');
  }
  if (innovation.longDescription) {
    lines.push('--- Full description ---', innovation.longDescription, '');
  }

  return lines.join('\n');
}

/**
 * Export innovation to a text file and open the share/save dialog.
 * @param {object} innovation - Full innovation object (from DB or list)
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function downloadInnovationToFile(innovation) {
  if (!innovation || !innovation.id) {
    return { success: false, error: 'Invalid innovation' };
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
      dialogTitle: 'Save innovation',
      UTI: 'public.plain-text',
    });

    return { success: true };
  } catch (e) {
    console.warn('downloadInnovationToFile error:', e);
    return { success: false, error: e?.message || String(e) };
  }
}
