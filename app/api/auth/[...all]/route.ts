import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/** Phase 51.2 — Better Auth API mount (sign-in, callbacks, session). */
export const { GET, POST } = toNextJsHandler(auth);
