// @vitest-environment jsdom
/** Phase 68.4 — the org switcher honors failures. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OrgWorkspace } from "./org-workspace";
import { DeploymentModeProvider } from "../components/deployment-mode";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrgWorkspace switcher", () => {
  it("a failed switch shows an error and keeps the current org selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/orgs/active" && init?.method === "PUT") {
          return { ok: false, json: async () => ({ error: "Not a member" }) };
        }
        if (url === "/api/orgs") {
          return {
            ok: true,
            json: async () => ({
              orgs: [
                { id: "o1", name: "One", slug: "one", role: "owner" },
                { id: "o2", name: "Two", slug: "two", role: "member" },
              ],
              activeOrganizationId: "o1",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            projects: [],
            posts: [],
            members: [],
            invitations: [],
          }),
        };
      }),
    );
    render(
      <OrgWorkspace>
        <div />
      </OrgWorkspace>,
    );
    const select = (await screen.findByLabelText(
      /active organization/i,
    )) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "o2" } });
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /couldn.t switch/i,
    );
    expect(select.value).toBe("o1");
  });
});

describe("OrgWorkspace in the demo (75)", () => {
  it("offers neither invite nor create, and says why", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url === "/api/orgs"
            ? {
                orgs: [{ id: "o1", name: "Demo Fleet", slug: "demo-fleet-ab12", role: "owner" }],
                activeOrganizationId: "o1",
              }
            : { projects: [], posts: [], members: [], invitations: [] },
      })),
    );
    render(
      <DeploymentModeProvider mode="hosted" isOperator={false} isDemo>
        <OrgWorkspace>
          <div />
        </OrgWorkspace>
      </DeploymentModeProvider>,
    );
    expect(await screen.findByText(/inviting teammates are turned off/i)).toBeTruthy();
    expect(screen.queryByLabelText(/invite member/i)).toBeNull();
    expect(screen.queryByLabelText(/new organization name/i)).toBeNull();
  });
});
