/** Phase 51.2 — Better Auth React client. 54.1 adds email-OTP + admin. */
import { createAuthClient } from "better-auth/react";
import {
  organizationClient,
  magicLinkClient,
  emailOTPClient,
  adminClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    magicLinkClient(),
    emailOTPClient(),
    adminClient(),
  ],
});
