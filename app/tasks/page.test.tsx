// @vitest-environment jsdom
/** 77 — Tasks shows a placeholder while its first fetch is in flight. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TasksPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Tasks loading (77)", () => {
  it("renders a status placeholder before the first response", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<TasksPage />);
    expect(screen.getByRole("status", { name: /loading tasks/i })).toBeTruthy();
  });
});
