// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { ActivityFeed } from "./activity-feed";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const mockEvents = [
  {
    id: 1,
    eventType: "commit",
    summary: "Added login feature",
    createdAt: new Date().toISOString(),
    project: { name: "Alpha", slug: "alpha" },
  },
  {
    id: 2,
    eventType: "phase-complete",
    summary: "Completed phase 1",
    createdAt: new Date().toISOString(),
    project: { name: "Beta", slug: "beta" },
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ActivityFeed", () => {
  it("renders events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve(mockEvents),
    } as Response);

    let container: HTMLElement;
    await act(async () => {
      const result = render(<ActivityFeed pollInterval={999999} />);
      container = result.container;
    });

    // Wait for fetch to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container!.textContent).toContain("Added login feature");
    expect(container!.textContent).toContain("Alpha");
  });

  it("renders empty state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
    } as Response);

    let container: HTMLElement;
    await act(async () => {
      const result = render(<ActivityFeed pollInterval={999999} />);
      container = result.container;
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container!.textContent).toContain("No activity recorded");
  });

  it("renders activity log header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
    } as Response);

    let container: HTMLElement;
    await act(async () => {
      const result = render(<ActivityFeed pollInterval={999999} />);
      container = result.container;
    });

    expect(container!.textContent).toContain("Activity Log");
  });
});

describe("66.2 — cloud progress is quiet", () => {
  it("cloud-progress events never trigger the alert sound", async () => {
    const { NOTIFY_EVENT_TYPES } = await import("./activity-feed");
    expect(NOTIFY_EVENT_TYPES.has("cloud-progress")).toBe(false);
    expect(NOTIFY_EVENT_TYPES.has("session-complete")).toBe(true);
  });
});

describe("72 — activity timestamps", () => {
  it("today shows the time; older events show the date too", async () => {
    const { formatTimestamp } = await import("./activity-feed");
    const now = new Date(2026, 10, 22, 15, 0);
    expect(formatTimestamp(new Date(2026, 10, 22, 14, 5).toISOString(), now)).toBe("14:05");
    expect(formatTimestamp(new Date(2026, 10, 20, 9, 30).toISOString(), now)).toBe("Nov 20 09:30");
    expect(formatTimestamp(new Date(2025, 11, 31, 23, 0).toISOString(), now)).toBe("Dec 31, 2025 23:00");
  });
});
