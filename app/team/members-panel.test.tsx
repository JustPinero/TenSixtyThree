// @vitest-environment jsdom
/** Phase 68.4 — members panel. */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MembersPanel } from "./members-panel";

const BODY = (canManage: boolean) => ({
  members: [
    {
      id: "m1",
      userId: "alice",
      name: "Alice",
      email: "alice@x.dev",
      role: "owner",
    },
    {
      id: "m2",
      userId: "bob",
      name: "Bob",
      email: "bob@x.dev",
      role: "member",
    },
  ],
  invitations: [
    {
      id: "inv-1",
      email: "new@x.dev",
      role: "member",
      expiresAt: "2026-12-01",
    },
  ],
  canManage,
  myRole: canManage ? "owner" : "member",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stub(
  body: unknown,
  onWrite?: (url: string, init: RequestInit) => { ok: boolean; body?: unknown },
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET" && onWrite) {
      const r = onWrite(url, init);
      return { ok: r.ok, json: async () => r.body ?? {} };
    }
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MembersPanel", () => {
  it("lists members and pending invites", async () => {
    stub(BODY(false));
    render(<MembersPanel orgId="o1" />);
    expect(await screen.findByText("alice@x.dev")).toBeTruthy();
    expect(screen.getByText("new@x.dev")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /revoke/i })).toBeNull();
  });

  it("an owner can change a role, remove a member and revoke an invite", async () => {
    const fetchMock = stub(BODY(true), () => ({ ok: true }));
    render(<MembersPanel orgId="o1" />);
    fireEvent.change(await screen.findByLabelText(/role for bob@x.dev/i), {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: /remove bob@x.dev/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /revoke invitation for new@x.dev/i }),
    );
    await waitFor(() => {
      const writes = fetchMock.mock.calls.filter(
        ([, i]) => i?.method && i.method !== "GET",
      );
      expect(writes.map(([u, i]) => [u, i?.method, i?.body])).toEqual([
        [
          "/api/orgs/members",
          "PATCH",
          JSON.stringify({ memberId: "m2", role: "admin" }),
        ],
        ["/api/orgs/members", "DELETE", JSON.stringify({ memberId: "m2" })],
        [
          "/api/orgs/invite",
          "DELETE",
          JSON.stringify({ invitationId: "inv-1" }),
        ],
      ]);
    });
  });

  it("shows the server's refusal", async () => {
    stub(BODY(true), () => ({
      ok: false,
      body: { error: "An organization needs at least one owner" },
    }));
    render(<MembersPanel orgId="o1" />);
    fireEvent.change(await screen.findByLabelText(/role for alice@x.dev/i), {
      target: { value: "member" },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /at least one owner/i,
    );
  });
});
