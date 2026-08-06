/**
 * Phase 51.2 — Better Auth server instance (hosted-foundation identity).
 *
 * Config verified against live docs 2026-08-06 (better-auth@1.6.x): Prisma
 * adapter from the main package, GitHub OAuth primary + Google secondary,
 * magic-link fallback, organization plugin (51.3 moves Teams onto it),
 * nextCookies last. No passwords — emailAndPassword stays disabled.
 *
 * Relative import of prisma (not "@/lib/db") so the `auth` CLI can load this
 * config outside Next's path-alias resolution.
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      accessType: "offline",
    },
  },
  plugins: [
    organization({
      // 7-day invites — matches the hand-rolled Phase 43 convention this
      // plugin replaces in 51.3.
      invitationExpiresIn: 7 * 24 * 60 * 60,
      sendInvitationEmail: async () => {
        // 51.3 wires Resend here; until then invites are shared by link/token.
      },
    }),
    magicLink({
      sendMagicLink: async () => {
        // 51.3 wires Resend here; provider no-ops until then.
      },
    }),
    nextCookies(),
  ],
});
