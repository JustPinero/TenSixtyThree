// @vitest-environment jsdom
/** Phase 68.4 — the org switcher honors failures. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OrgWorkspace } from "./org-workspace";

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
