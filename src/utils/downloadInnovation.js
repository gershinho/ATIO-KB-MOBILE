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
  const readiness =
    READINESS_LEVELS.find((r) => r.level === innovation.readinessLevel) ||
    READINESS_LEVELS[0];
  const adoption =
    ADOPTION_LEVELS.find((a) => a.level === innovation.adoptionLevel) ||
    ADOPTION_LEVELS[0];

  const costLabel =
    innovation.cost === 'low'
      ? '$ Low / Free'
      : innovation.cost === 'high'
      ? '$$$ High'
      : '$$ Moderate';

  const complexLabel = innovation.complexity
    ? innovation.complexity.charAt(0).toUpperCase() + innovation.complexity.slice(1)
    : 'Moderate';

  const typeLabel =
    innovation.types && innovation.types.length > 0 ? innovation.types[0] : '';

  const countriesText =
    (innovation.countries && innovation.countries.join(', ')) ||
    innovation.region ||
    '—';

  const lines = [];

  // Title
  lines.push(`# ${innovation.title || 'Untitled Innovation'}`, '');

  // Quick meta (type, grassroots, location)
  if (typeLabel || innovation.isGrassroots) {
    const bits = [];
    if (typeLabel) bits.push(`**Type**: ${typeLabel}`);
    if (innovation.isGrassroots) bits.push('**Grassroots innovation**');
    lines.push(bits.join(' • '));
  }
  if (countriesText !== '—') {
    lines.push(`**Location**: ${countriesText}`);
  }
  lines.push('');

  // Overview
  lines.push('## Overview', '');
  lines.push(
    innovation.shortDescription ||
      innovation.longDescription ||
      'No overview available.'
  );
  lines.push('');

  // Readiness & adoption
  lines.push('## Readiness & adoption', '');
  lines.push(
    `- **Readiness level**: ${innovation.readinessLevel ?? '—'} — ${readiness.name}`,
    `- **Adoption level**: ${innovation.adoptionLevel ?? '—'} — ${adoption.name}`,
    ''
  );

  // Cost & complexity
  lines.push('## Cost & complexity', '');
  lines.push(
    `- **Cost**: ${costLabel}`,
    `- **Complexity**: ${complexLabel}`,
    ''
  );

  // Use cases
  if (innovation.useCases && innovation.useCases.length > 0) {
    lines.push('## Where this works best (use cases)', '');
    innovation.useCases.forEach((u) => {
      lines.push(`- ${u}`);
    });
    lines.push('');
  }

  // Intended users
  if (innovation.users && innovation.users.length > 0) {
    lines.push('## Who can use this (user groups)', '');
    innovation.users.forEach((u) => {
      lines.push(`- ${u}`);
    });
    lines.push('');
  }

  // Key benefits
  lines.push('## Key benefits', '');
  lines.push(
    `- **Readiness**: ${readiness.name} — ${readiness.description}`,
    `- **Adoption**: ${adoption.name} — ${adoption.description}`
  );
  if (innovation.cost === 'low') {
    lines.push(
      '- **Low cost**: accessible to resource-constrained farmers and organisations'
    );
  }
  lines.push('');

  // Source & adoption
  lines.push('## Source & adoption', '');
  lines.push(
    `${innovation.dataSource || '—'} — ${
      innovation.owner || innovation.partner || 'Multiple partners'
    }`,
    ''
  );

  // SDG alignment
  if (innovation.sdgs && innovation.sdgs.length > 0) {
    lines.push('## SDG alignment', '');
    innovation.sdgs.forEach((num) => {
      const s = SDGS.find((x) => x.number === num);
      if (s) {
        lines.push(`- **SDG ${num}**: ${s.name}`);
      }
    });
    lines.push('');
  }

  // Full description
  if (innovation.longDescription) {
    lines.push('## Full description', '');
    lines.push(innovation.longDescription, '');
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
