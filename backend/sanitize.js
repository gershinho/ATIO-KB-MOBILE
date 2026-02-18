/**
 * Sanitization helper for ATIO KB innovations.
 *
 * STRICT RULE: When feeding ATIO KB data to the AI (embeddings, LLM prompt,
 * or attached file), use ONLY long-text fields and REMOVE all metadata that
 * identifies the innovation (owner, URL, data source, partner, title).
 *
 * Allowed fields:  short_description, long_description
 * Stripped fields:  owner_text, partner_text, data_source, title, id, any URL
 */

/**
 * Build a sanitized text blob from an innovation row.
 * Only includes short_description and long_description.
 * Returns plain text suitable for sending to an LLM or embedding model.
 */
function sanitizeForAI(row) {
  const parts = [];
  if (row.short_description) {
    parts.push(row.short_description.trim());
  }
  if (row.long_description) {
    parts.push(row.long_description.trim());
  }
  return parts.join('\n\n') || '';
}

/**
 * Build an array of sanitized documents with anonymous labels.
 * Each document gets an anonymous id like "Doc 1", "Doc 2", etc.
 * Returns { docs: [{ anonId, text, realId }], mapping: Map<anonId, realId> }
 */
function buildSanitizedDocs(rows) {
  const docs = [];
  const mapping = new Map();

  rows.forEach((row, index) => {
    const anonId = `Doc ${index + 1}`;
    const text = sanitizeForAI(row);
    if (text) {
      docs.push({ anonId, text, realId: row.id });
      mapping.set(anonId, row.id);
    }
  });

  return { docs, mapping };
}

module.exports = { sanitizeForAI, buildSanitizedDocs };
