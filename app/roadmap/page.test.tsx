// @vitest-environment jsdom
/** 77 — Roadmap shows a placeholder, not zeroed counts, before its data. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("../components/milestones-panel", () => ({ MilestonesPanel: () => null }));

import RoadmapPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Roadmap loading (77)", () => {
  it("shows a status placeholder and no '0 building' until projects arrive", async () => {
    let resolve: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => (resolve = r))),
    );
    render(<RoadmapPage />);
    expect(screen.getByRole("status", { name: /loading projects/i })).toBeTruthy();
    expect(screen.queryByText(/building/)).toBeNull();
    resolve({ ok: true, json: async () => [] });
    expect((await screen.findAllByText(/building/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("status", { name: /loading projects/i })).toBeNull();
  });
});
