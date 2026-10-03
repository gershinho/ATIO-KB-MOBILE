/**
 * HTML from the portal, flattened into the plain text the app renders.
 *
 * The bundled database stores descriptions as plain prose. The JSON:API serves
 * the same prose as `processed` HTML — `<h4><strong>Description</strong></h4>`
 * and `<p>` wrappers — and every screen that shows a description renders it
 * into a React Native <Text>, which has no notion of markup and would print the
 * tags. So this is not a nicety: without it the web build shows angle brackets
 * where the phone shows a sentence.
 *
 * Deliberately not an HTML parser. The input is one CMS's body field, not
 * arbitrary documents, and a parser would be a dependency and a bundle cost for
 * a job that four replacements do.
 */

/** The handful that actually appear in this data, plus the five standard ones. */
const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
};

/**
 * Decode the entities, including numeric ones.
 *
 * Runs after tags are stripped, never before: decoding `&lt;p&gt;` first would
 * manufacture a tag out of text that was deliberately escaped, and the stripper
 * would then eat the words around it.
 */
function decodeEntities(value) {
  return value
    .replace(/&[a-zA-Z]+;|&#\d+;/g, (entity) => {
      if (ENTITIES[entity]) return ENTITIES[entity];
      const numeric = entity.match(/^&#(\d+);$/);
      if (numeric) return String.fromCharCode(parseInt(numeric[1], 10));
      // An entity we do not know is left exactly as it came, which is at worst
      // odd-looking. Dropping it would silently delete a character.
      return entity;
    });
}

/**
 * Flatten an HTML fragment to text, keeping paragraph breaks.
 *
 * @param {string|null|undefined} html
 * @returns {string} plain text, trimmed; '' for empty input
 */
export function htmlToText(html) {
  if (!html) return '';

  const withBreaks = String(html)
    // Scripts and styles carry content that is not prose. Taken out whole,
    // rather than having their tags stripped and their bodies left behind.
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Block ends become blank lines so paragraphs do not run together into one
    // wall of text; <br> becomes a single newline.
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(withBreaks)
    // Collapse the runs of spaces that stripped tags leave behind, without
    // touching newlines, then cap the blank lines at one.
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
