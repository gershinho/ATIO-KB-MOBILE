// POST {query} → {query, englishQuery, terms, expandedTerms}. See _shared/ai/routes.js.
import { serveRoute } from '../_shared/http.js';
import { searchTermsRoute } from '../_shared/ai/routes.js';

serveRoute(searchTermsRoute);
