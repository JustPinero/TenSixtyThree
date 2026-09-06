/**
 * 52.8 — the cloud analogue of `claudeInvocationFor` (lib/claude-dispatcher).
 *
 * Local dispatch maps a project's autonomyMode onto a permission posture:
 * full → skip permissions, semi → acceptEdits, manual → interactive
 * prompts. "Interactive" has no meaning in a headless cloud run, so a
 * manual-autonomy project is REFUSED rather than silently promoted to
 * unattended — the toggle means "I approve each action", and nobody is
 * there to approve.
 */

export type CloudPermission =
  | { allowed: true; permissionMode: "bypassPermissions" | "acceptEdits" }
  | { allowed: false; reason: string };

export function cloudPermissionFor(
  autonomyMode: string | null | undefined,
): CloudPermission {
  if (autonomyMode === "manual") {
    return {
      allowed: false,
      reason:
        "This project's autonomy is set to manual — cloud runs are unattended, so nobody can approve its actions. Set autonomy to semi or full, or dispatch it locally.",
    };
  }
  if (autonomyMode === "full") {
    return { allowed: true, permissionMode: "bypassPermissions" };
  }
  // semi + anything unrecognized: the safest posture that still works.
  return { allowed: true, permissionMode: "acceptEdits" };
}
