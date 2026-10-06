import { createAuthClient } from "better-auth/react";

/** Browser auth client (client-safe). Same-origin, so no baseURL. */
export const authClient = createAuthClient();
