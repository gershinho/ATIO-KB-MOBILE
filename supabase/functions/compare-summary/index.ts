// POST {name1, name2, description1, description2} → {summary}. See _shared/ai/routes.js.
import { serveRoute } from '../_shared/http.js';
import { compareSummaryRoute } from '../_shared/ai/routes.js';

serveRoute(compareSummaryRoute);
