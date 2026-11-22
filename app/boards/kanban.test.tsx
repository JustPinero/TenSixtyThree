// @vitest-environment jsdom
/** Phase 72 — kanban: ticket detail edit/delete, keyboard "Move to…", drafts, failures. */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import BoardsPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BOARD = {
  columns: [
    { id: "c1", name: "Todo", position: 1 },
    { id: "c2", name: "Done", position: 2 },
  ],
  tickets: [
    {
      id: "t1",
      columnId: "c1",
      title: "Fix login",
      description: "OAuth loop",
      priority: "high",
      position: 1,
      linearIssueId: null,
      assigneeUserId: null,
      milestoneId: null,
    },
  ],
};

type Handler = (
  url: string,
  init?: RequestInit,
) => { ok: boolean; body?: unknown } | undefined;

function stub(onWrite: Handler = () => ({ ok: true, body: {} })) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      const r = onWrite(url, init) ?? { ok: true, body: {} };
      return { ok: r.ok, json: async () => r.body ?? {} };
    }
    if (url === "/api/boards") {
      return {
        ok: true,
        json: async () => ({
          boards: [{ id: "b1", name: "Sprint", organizationId: null }],
        }),
      };
    }
    if (url === "/api/boards/b1") return { ok: true, json: async () => BOARD };
    if (url === "/api/milestones") {
      return {
        ok: true,
        json: async () => ({ milestones: [{ id: "m1", title: "Beta" }] }),
      };
    }
    return {
      ok: true,
      json: async () => ({ orgs: [], activeOrganizationId: null }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const writes = (fetchMock: ReturnType<typeof stub>) =>
  fetchMock.mock.calls
    .filter(([, i]) => i?.method && i.method !== "GET")
    .map(([u, i]) => [
      u,
      i?.method,
      i?.body ? JSON.parse(String(i.body)) : null,
    ]);

describe("kanban (72)", () => {
  it("tickets have accessible names", async () => {
    stub();
    render(<BoardsPage />);
    expect(
      await screen.findByRole("button", { name: /edit ticket fix login/i }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/move fix login to/i)).toBeTruthy();
  });

  it("the detail dialog edits title, priority and milestone", async () => {
    const fetchMock = stub();
    render(<BoardsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /edit ticket fix login/i }),
    );
    const dialog = await screen.findByRole("dialog", { name: /ticket/i });
    fireEvent.change(within(dialog).getByLabelText(/^title$/i), {
      target: { value: "Fix login for good" },
    });
    fireEvent.change(within(dialog).getByLabelText(/priority/i), {
      target: { value: "urgent" },
    });
    fireEvent.change(await within(dialog).findByLabelText(/milestone/i), {
      target: { value: "m1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(writes(fetchMock)).toContainEqual([
        "/api/tickets",
        "PATCH",
        expect.objectContaining({
          id: "t1",
          title: "Fix login for good",
          priority: "urgent",
          milestoneId: "m1",
        }),
      ]),
    );
  });

  it("delete asks for a second click, then deletes", async () => {
    const fetchMock = stub();
    render(<BoardsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: /edit ticket fix login/i }),
    );
    const dialog = await screen.findByRole("dialog", { name: /ticket/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));
    expect(writes(fetchMock).filter(([, m]) => m === "DELETE")).toHaveLength(0);
    fireEvent.click(
      within(dialog).getByRole("button", { name: /confirm delete/i }),
    );
    await waitFor(() =>
      expect(writes(fetchMock)).toContainEqual([
        "/api/tickets",
        "DELETE",
        { id: "t1" },
      ]),
    );
  });

  it("'Move to…' moves a ticket without dragging", async () => {
    const fetchMock = stub();
    render(<BoardsPage />);
    fireEvent.change(await screen.findByLabelText(/move fix login to/i), {
      target: { value: "c2" },
    });
    await waitFor(() =>
      expect(writes(fetchMock)).toContainEqual([
        "/api/tickets",
        "PATCH",
        expect.objectContaining({ id: "t1", columnId: "c2" }),
      ]),
    );
  });

  it("a failed move refetches the board and says so", async () => {
    const fetchMock = stub(() => ({ ok: false, body: { error: "nope" } }));
    render(<BoardsPage />);
    fireEvent.change(await screen.findByLabelText(/move fix login to/i), {
      target: { value: "c2" },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /couldn.t move/i,
    );
    const boardFetches = fetchMock.mock.calls.filter(
      ([u, i]) => u === "/api/boards/b1" && !i?.method,
    );
    expect(boardFetches.length).toBeGreaterThanOrEqual(2);
  });

  it("a new-ticket draft is kept until the POST succeeds", async () => {
    stub((url, init) =>
      url === "/api/tickets" && init?.method === "POST"
        ? { ok: false }
        : undefined,
    );
    render(<BoardsPage />);
    const input = (await screen.findByLabelText(/add ticket to todo/i, {
      selector: "input",
    })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Write docs" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(input.value).toBe("Write docs");
  });
});
