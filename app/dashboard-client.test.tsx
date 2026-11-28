// @vitest-environment jsdom
/**
 * Phase 60.2 — the dashboard renders the server's project list on first
 * paint (no client round-trip) and the page module is a server component.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { Dashboard } from "./dashboard-client";
import { DeploymentModeProvider } from "./components/deployment-mode";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TILE = {
  slug: "alpha",
  name: "Alpha App",
  currentPhase: "phase-2",
  health: "healthy",
  openDebtCount: 0,
  lastActivityAt: "2026-11-20T10:00:00.000Z",
  status: "building",
  githubRepo: null,
  unreadAuditCount: 0,
  hasAdvisory: false,
  advisoryRead: false,
  progressScore: 40,
  pendingHumanTasks: 0,
};

describe("dashboard (60.2)", () => {
  it("app/page.tsx is a server component", () => {
    const src = readFileSync(path.join(__dirname, "page.tsx"), "utf8");
    expect(src).not.toMatch(/^\s*["']use client["']/m);
  });

  it("server-provided projects render on first paint without fetching /api/projects", async () => {
    // Unrelated widgets get a failure (they already handle !ok).
    const fetchMock = vi.fn(async (url: string) => ({
      ok: url === "/api/projects",
      json: async () => [],
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Dashboard initialProjects={[TILE]} />);
    expect(await screen.findByText("Alpha App")).toBeTruthy();
    const projectFetches = fetchMock.mock.calls.filter(
      ([u]) => String(u) === "/api/projects",
    );
    expect(projectFetches).toHaveLength(0);
  });

  it("without server data the island fetches as before", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: url === "/api/projects",
      json: async () => (url === "/api/projects" ? [TILE] : {}),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Dashboard initialProjects={null} />);
    expect(await screen.findByText("Alpha App")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([u]) => String(u) === "/api/projects"),
    ).toBe(true);
  });

  it("75 — a demo visitor sees no operator widgets (quarantine, queue strip, cost)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const body =
        url === "/api/observability/quarantine"
          ? { count: 3, path: "/x" }
          : url === "/api/dispatch/status"
            ? { queue: { running: 0, pending: 0, capacity: 4 }, dispatches: { queued: 0, started: 0, overdue: 0 } }
            : url === "/api/usage/summary"
              ? { calls: 0, estimatedCostUsd: 0, hitRate: 0, hasUnknownModels: false }
              : null;
      // Everything else fails, as in the tests above (widgets handle !ok).
      return { ok: body !== null, json: async () => body ?? {} };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DeploymentModeProvider mode="hosted" isOperator={false} isDemo>
        <Dashboard initialProjects={[TILE]} />
      </DeploymentModeProvider>,
    );
    expect(await screen.findByText("Alpha App")).toBeTruthy();
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls).not.toContain("/api/observability/quarantine");
    expect(urls).not.toContain("/api/dispatch/status");
    expect(urls).not.toContain("/api/usage/summary");
    expect(screen.queryByText(/quarantined/)).toBeNull();
  });
});
