// @vitest-environment jsdom
/** Phase 68.4 — org-scoped milestone creation from the UI. */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MilestonesPanel } from "./milestones-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stub(withOrg: boolean) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/orgs") {
      return {
        ok: true,
        json: async () =>
          withOrg
            ? { orgs: [{ id: "o1", name: "Acme" }], activeOrganizationId: "o1" }
            : { orgs: [], activeOrganizationId: null },
      };
    }
    if (url === "/api/milestones" && !init?.method) {
      return { ok: true, json: async () => ({ milestones: [] }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("milestone scope", () => {
  it("with an active org, a milestone can be created for the org", async () => {
    const fetchMock = stub(true);
    render(<MilestonesPanel />);
    fireEvent.change(await screen.findByLabelText(/belongs to/i), {
      target: { value: "org" },
    });
    fireEvent.change(screen.getByLabelText(/new milestone/i), {
      target: { value: "Beta" },
    });
    fireEvent.submit(
      screen
        .getByLabelText(/new milestone/i)
        .closest("form") as HTMLFormElement,
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/milestones",
        expect.objectContaining({
          body: JSON.stringify({ title: "Beta", scope: "org" }),
        }),
      ),
    );
  });

  it("without an org there is no picker and milestones are personal", async () => {
    stub(false);
    render(<MilestonesPanel />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByLabelText(/belongs to/i)).toBeNull();
  });
});
