/** Phase 51.2 — Better Auth React client (org + magic-link plugins). */
import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  magicLinkClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [organizationClient(), magicLinkClient()],
});
