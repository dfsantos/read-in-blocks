import { z } from "zod";

// Zod, configured for the app (US-025). The page's CSP has no 'unsafe-eval' (US-028): without this,
// Zod probes `new Function` to compile schemas, the browser refuses it and reports a CSP violation
// on every page with a form. Schemas are interpreted instead, on the client and on the server.
z.config({ jitless: true });

export { z };
