/**
 * Pure formatting for the exported innovation document.
 *
 * This lived inside downloadInnovation.js alongside the FileSystem and Sharing
 * calls, so ~140 lines of text assembly could not be tested without mocking the
 * whole file layer. Nothing here touches the device.
 *
 * The section comments that used to sit above each block were removed: each one
 * restated the markdown heading on the very next line.
 */
import {
  READINESS_LEVELS, ADOPTION_LEVELS, SDGS, costLevel, complexityLevel,
} from '../data/constants';

/** Written into the document when a derived value is absent or unrecognised. */
const UNKNOWN_LABEL = 'Not specified';

export function sanitizeFilename(title) {
  return (title || 'solution')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function buildTextContent(innovation) {
  const readiness =
    READINESS_LEVELS.find((r) => r.level === innovation.readinessLevel) ||
    READINESS_LEVELS[0];
  const adoption =
    ADOPTION_LEVELS.find((a) => a.level === innovation.adoptionLevel) ||
    ADOPTION_LEVELS[0];

  // Both used to fall through to the middle of the scale for an unrecognised
  // value, so an export could state "$$ Moderate" about a cost nothing had
  // derived. An exported document is the copy that outlives the app, so it says
  // what it does not know.
  const costLabel = costLevel(innovation.cost)?.label ?? UNKNOWN_LABEL;
  const complexLabel = complexityLevel(innovation.complexity)?.label ?? UNKNOWN_LABEL;

  const typeLabel =
    innovation.types && innovation.types.length > 0 ? innovation.types[0] : '';

  const countriesText =
    (innovation.countries && innovation.countries.join(', ')) ||
    innovation.region ||
    '—';

  const lines = [];

  lines.push(`# ${innovation.title || 'Untitled Solution'}`, '');

  if (typeLabel || innovation.isGrassroots) {
    const bits = [];
    if (typeLabel) bits.push(`**Type**: ${typeLabel}`);
    if (innovation.isGrassroots) bits.push('**Grassroots solution**');
    lines.push(bits.join(' • '));
  }
  if (countriesText !== '—') {
    lines.push(`**Location**: ${countriesText}`);
  }
  lines.push('');

  lines.push('## Overview', '');
  lines.push(
    innovation.shortDescription ||
      innovation.longDescription ||
      'No overview available.'
  );
  lines.push('');

  lines.push('## Readiness & adoption', '');
  lines.push(
    `- **Readiness level**: ${innovation.readinessLevel ?? '—'} — ${readiness.name}`,
    `- **Adoption level**: ${innovation.adoptionLevel ?? '—'} — ${adoption.name}`,
    ''
  );

  lines.push('## Cost & complexity', '');
  lines.push(
    `- **Cost**: ${costLabel}`,
    `- **Complexity**: ${complexLabel}`,
    '- May have inaccuracies.',
    ''
  );

  if (innovation.useCases && innovation.useCases.length > 0) {
    lines.push('## Where this works best (use cases)', '');
    innovation.useCases.forEach((u) => {
      lines.push(`- ${u}`);
    });
    lines.push('');
  }

  if (innovation.users && innovation.users.length > 0) {
    lines.push('## Who can use this (user groups)', '');
    innovation.users.forEach((u) => {
      lines.push(`- ${u}`);
    });
    lines.push('');
  }

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

  lines.push('## Source & adoption', '');
  lines.push(
    `${innovation.dataSource || '—'} — ${
      innovation.owner || innovation.partner || 'Multiple partners'
    }`,
    ''
  );

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

  if (innovation.longDescription) {
    lines.push('## Full description', '');
    lines.push(innovation.longDescription, '');
  }

  return lines.join('\n');
}
