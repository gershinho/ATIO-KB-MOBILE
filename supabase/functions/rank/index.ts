// POST {query, candidates} → {ranked, ranker}. See _shared/ai/routes.js.
import { serveRoute, memoryRankCache } from '../_shared/http.js';
import { rankRoute } from '../_shared/ai/routes.js';

const cache = memoryRankCache();
serveRoute((ai, body) => rankRoute(ai, body, { cache }));
