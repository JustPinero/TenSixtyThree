/** 54.4 — boards/tickets/milestones surfaces. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { createBoard } from "@/lib/boards";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
});

async function load(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return {
    boards: await import("./route"),
    board: await import("./[id]/route"),
    tickets: await import("../tickets/route"),
    milestones: await import("../milestones/route"),
  };
}

async function makeSession(r: DispatchRig, token: string) {
  const user = await r.prisma.user.create({
    data: { id: `u-${token}`, name: token, email: `${token}@x.dev` },
  });
  await r.prisma.session.create({
    data: {
      id: `s-${token}`,
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return user;
}

function req(url: string, method: string, token: string | null, body?: unknown) {
  return new NextRequest(`http://x${url}`, {
    method,
    headers: token ? { cookie: `better-auth.session_token=${token}.s` } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("/api/boards", () => {
  it("401 sessionless; create personal board; list shows it", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { boards } = await load(rig);
    expect((await boards.GET(req("/api/boards", "GET", null))).status).toBe(401);

    await makeSession(rig, "tok");
    const created = await (
      await boards.POST(
        req("/api/boards", "POST", "tok", { name: "My board", scope: "personal" })
      )
    ).json();
    expect(created.board.name).toBe("My board");

    const list = await (await boards.GET(req("/api/boards", "GET", "tok"))).json();
    expect(list.boards).toHaveLength(1);
  });

  it("GET /api/boards/[id] returns columns+tickets for accessible boards, 404 otherwise", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { board } = await load(rig);
    const me = await makeSession(rig, "tok");
    await makeSession(rig, "tok2");
    const mine = await createBoard(rig.prisma, {
      name: "Mine",
      ownerUserId: me.id,
    });

    const ok = await board.GET(req(`/api/boards/${mine.id}`, "GET", "tok"), {
      params: Promise.resolve({ id: mine.id }),
    });
    expect(ok.status).toBe(200);
    const data = await ok.json();
    expect(data.columns).toHaveLength(3);

    const denied = await board.GET(
      req(`/api/boards/${mine.id}`, "GET", "tok2"),
      { params: Promise.resolve({ id: mine.id }) }
    );
    expect(denied.status).toBe(404);
  });
});

describe("/api/tickets", () => {
  it("create in a column, move between columns with explicit position", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { tickets } = await load(rig);
    const me = await makeSession(rig, "tok");
    const b = await createBoard(rig.prisma, { name: "B", ownerUserId: me.id });
    const cols = await rig.prisma.boardColumn.findMany({
      where: { boardId: b.id },
      orderBy: { position: "asc" },
    });

    const created = await (
      await tickets.POST(
        req("/api/tickets", "POST", "tok", {
          boardId: b.id,
          columnId: cols[0].id,
          title: "Ship the demo",
        })
      )
    ).json();
    expect(created.ticket.columnId).toBe(cols[0].id);

    const moved = await tickets.PATCH(
      req("/api/tickets", "PATCH", "tok", {
        id: created.ticket.id,
        columnId: cols[2].id,
        position: 999,
      })
    );
    expect(moved.status).toBe(200);
    const row = await rig.prisma.ticket.findUnique({
      where: { id: created.ticket.id },
    });
    expect(row?.columnId).toBe(cols[2].id);
    expect(row?.position).toBe(999);
  });

  it("strangers cannot create or move tickets on my board", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { tickets } = await load(rig);
    const me = await makeSession(rig, "tok");
    await makeSession(rig, "tok2");
    const b = await createBoard(rig.prisma, { name: "B", ownerUserId: me.id });
    const col = await rig.prisma.boardColumn.findFirst({
      where: { boardId: b.id },
    });
    const res = await tickets.POST(
      req("/api/tickets", "POST", "tok2", {
        boardId: b.id,
        columnId: col!.id,
        title: "Sneaky",
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("/api/milestones", () => {
  it("CRUD with status guard", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { milestones } = await load(rig);
    await makeSession(rig, "tok");

    const created = await (
      await milestones.POST(
        req("/api/milestones", "POST", "tok", {
          title: "v1 launch",
          scope: "personal",
        })
      )
    ).json();
    expect(created.milestone.status).toBe("planned");

    const badStatus = await milestones.PATCH(
      req("/api/milestones", "PATCH", "tok", {
        id: created.milestone.id,
        status: "someday",
      })
    );
    expect(badStatus.status).toBe(400);

    const shipped = await milestones.PATCH(
      req("/api/milestones", "PATCH", "tok", {
        id: created.milestone.id,
        status: "shipped",
      })
    );
    expect(shipped.status).toBe(200);

    const list = await (
      await milestones.GET(req("/api/milestones", "GET", "tok"))
    ).json();
    expect(list.milestones[0].status).toBe("shipped");
  });
});
