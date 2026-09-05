/**
 * Phase 51.2 — Better Auth server instance (hosted-foundation identity).
 * Phase 54.1 — locked down: invite-only creation (databaseHooks backstop
 * + disableSignUp on every method), email-OTP sign-in, passwords enabled
 * for SIGN-IN only (accounts gain one via setPassword after first login),
 * admin plugin, OTP rate limits.
 *
 * Relative import of prisma (not "@/lib/db") so the `auth` CLI can load this
 * config outside Next's path-alias resolution.
 */
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization, magicLink, emailOTP, admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";
import { decideUserCreation } from "./invite-gate";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * 54.2 wires Resend; until then codes/invites surface in server logs so
 * the flow is fully exercisable.
 */
function logEmail(kind: string, to: string, payload: string) {
  console.log(`[auth-email] ${kind} → ${to}: ${payload}`);
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: [process.env.BETTER_AUTH_URL || "http://localhost:3000"],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    // Sign-IN with a password is allowed; sign-UP through this method is
    // not — accounts are created via invited email-code login, then gain
    // a password through setPassword (see /api/auth-extra/set-password).
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      disableImplicitSignUp: true,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      accessType: "offline",
      disableImplicitSignUp: true,
    },
  },
  databaseHooks: {
    user: {
      create: {
        // THE invite-only choke point — fires on every creation path
        // (OAuth, email OTP, magic link, password). Decision core is
        // pure and tested (lib/invite-gate.ts).
        before: async (user) => {
          const email = user.email.toLowerCase();
          const [orgInvites, userInvites] = await Promise.all([
            prisma.invitation.findMany({
              where: { email: { equals: email, mode: "insensitive" } },
              select: { email: true, status: true, expiresAt: true },
            }),
            prisma.userInvite.findMany({
              where: { email: { equals: email, mode: "insensitive" } },
              select: { email: true, expiresAt: true, acceptedAt: true },
            }),
          ]);
          const decision = decideUserCreation({
            email,
            now: new Date(),
            adminEmails: adminEmails(),
            orgInvites,
            userInvites,
          });
          if (!decision.allowed) {
            throw new APIError("FORBIDDEN", {
              message: "Sign-ups are invite-only. Ask for an invitation.",
            });
          }
          // Consume an independent invite; admins get the admin role.
          if (decision.via === "user-invite") {
            await prisma.userInvite.updateMany({
              where: {
                email: { equals: email, mode: "insensitive" },
                acceptedAt: null,
              },
              data: { acceptedAt: new Date() },
            });
          }
          if (decision.via === "admin") {
            return { data: { ...user, role: "admin" } };
          }
          return { data: user };
        },
      },
    },
  },
  rateLimit: {
    // Better Auth enables rate limiting in production by default;
    // tighten the code endpoints (brute-force surface).
    customRules: {
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/sign-in/email-otp": { window: 60, max: 5 },
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  plugins: [
    organization({
      // 7-day invites — matches the hand-rolled Phase 43 convention this
      // plugin replaces in 51.3.
      invitationExpiresIn: 7 * 24 * 60 * 60,
      cancelPendingInvitationsOnReInvite: true,
      sendInvitationEmail: async (data) => {
        logEmail("org-invite", data.email, `invitation id ${data.id}`);
      },
    }),
    emailOTP({
      // Justin's flow: invited users sign in with an emailed code; the
      // invite gate above decides whether a new account may be created.
      disableSignUp: false, // creation is governed by the databaseHook
      otpLength: 6,
      expiresIn: 600,
      async sendVerificationOTP({ email, otp, type }) {
        logEmail(`otp:${type}`, email, otp);
      },
    }),
    magicLink({
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        logEmail("magic-link", email, url);
      },
    }),
    admin(),
    nextCookies(),
  ],
});
