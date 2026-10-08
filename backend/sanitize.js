/**
 * Sanitization helper for ATIO KB innovations.
 *
 * The one copy now lives in supabase/functions/_shared/ai/sanitize.js, so the
 * Express backend and the Supabase Edge Functions send the model exactly the
 * same anonymised text. Re-exported here for the backend's existing callers.
 */
module.exports = require('../supabase/functions/_shared/ai/sanitize.js');
