// POST {text, innovationId} → {bullets: string[3] | null}. See _shared/ai/routes.js.
import { serveRoute } from '../_shared/http.js';
import { summarizeBulletsRoute } from '../_shared/ai/routes.js';

serveRoute(summarizeBulletsRoute);
