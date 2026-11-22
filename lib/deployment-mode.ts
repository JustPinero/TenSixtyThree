/**
 * Phase 68.1 — one answer to "is this the operator's local install or
 * the hosted product?". Local = AUTH_REQUIRED unset (the same switch
 * lib/access uses). The server layout reads it once and hands it to the
 * client tree (app/components/deployment-mode.tsx).
 */
export type DeploymentMode = "local" | "hosted";

export function deploymentMode(
  env: Record<string, string | undefined> = process.env,
): DeploymentMode {
  return env.AUTH_REQUIRED === "true" ? "hosted" : "local";
}

/**
 * Pages that act on the server's own disk / CLIs. On the hosted app they
 * belong to nobody's project, so they leave the navigation (their APIs
 * already refuse with requireLocalMode).
 */
export const LOCAL_ONLY_PATHS: readonly string[] = [
  "/playbook",
  "/templates",
  "/create",
];

export function isLocalOnlyPath(href: string): boolean {
  return LOCAL_ONLY_PATHS.some((p) => href === p || href.startsWith(`${p}/`));
}

/** Admin-only surfaces (their APIs use requireAdmin) — hidden from plain users. */
export const OPERATOR_ONLY_PATHS: readonly string[] = ["/knowledge", "/observability"];

export function isOperatorOnlyPath(href: string): boolean {
  return OPERATOR_ONLY_PATHS.some((p) => href === p || href.startsWith(`${p}/`));
}

