// @vitest-environment jsdom
/**
 * Phase 48.3 — /team page smoke (UI: test-after allowed; exists before done).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
});

describe("/team page", () => {
  it("renders the empty state with a create form when no team exists", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.doMock("@/lib/db", () => ({ prisma: rig!.prisma }));
    const { default: TeamPage } = await import("./page");
    render(await TeamPage());
    expect(screen.getByText(/no team yet/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/team name/i)).toBeInTheDocument();
  });

  it("renders members + activity once a team exists", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.doMock("@/lib/db", () => ({ prisma: rig!.prisma }));
    const owner = await rig.prisma.user.create({
      data: { email: "op@local", name: "Op" },
    });
    const { createTeam } = await import("@/lib/teams");
    const team = await createTeam(rig.prisma, { name: "Fleet", owner });
    await rig.prisma.humanTask.create({
      data: { title: "ship it", status: "pending", organizationId: team.id },
    });
    const { default: TeamPage } = await import("./page");
    render(await TeamPage());
    expect(screen.getByText("Fleet")).toBeInTheDocument();
    expect(screen.getByText(/ship it/)).toBeInTheDocument();
  });
});
