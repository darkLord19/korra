// Runs in the browser before the app's client code. Under the strict CSP (no 'unsafe-eval'), zod's startup probe for
// `new Function` is caught, but the browser still reports it as a CSP violation. `jitless` skips the probe: zod then
// parses without generated code, which is what the CSP requires anyway. This must run before any schema is defined,
// hence an instrumentation-client file rather than the boot code (the screens define schemas at import time).
import { z } from "zod";

z.config({ jitless: true });
