/**
 * Phase 74 — the GitHub App's definition, for GitHub's manifest flow
 * (scripts/create-github-app.ts). Least privilege: repository contents and
 * pull requests (write) plus metadata (read). No webhooks, no events, no
 * org or account permissions.
 */
export interface AppManifest {
  name: string;
  url: string;
  description: string;
  redirect_url: string;
  setup_url: string;
  public: boolean;
  hook_attributes: { url: string; active: boolean };
  default_permissions: Record<string, "read" | "write">;
  default_events: string[];
}

export function buildAppManifest(redirectUrl: string): AppManifest {
  return {
    name: "TenSixtyThree Runner",
    url: "https://www.tensixtythree.com",
    description:
      "Runs TenSixtyThree cloud dispatches: clones the repo, pushes a result branch and opens a pull request. Only on repos you install it on.",
    redirect_url: redirectUrl,
    setup_url: "https://www.tensixtythree.com/",
    // Public so other TenSixtyThree users can install it on their own repos.
    public: true,
    hook_attributes: { url: "https://www.tensixtythree.com/api/health", active: false },
    default_permissions: {
      contents: "write",
      pull_requests: "write",
      metadata: "read",
    },
    default_events: [],
  };
}
