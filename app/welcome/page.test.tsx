// @vitest-environment jsdom
/** Phase 68.1 — the public landing page explains the product and leads to the demo. */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import WelcomePage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/welcome", () => {
  it("explains the product, offers the demo and sign-in, and has no app nav", () => {
    render(<WelcomePage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /TenSixtyThree/,
    );
    expect(screen.getByRole("button", { name: /try the demo/i })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /sign in/i }).getAttribute("href"),
    ).toBe("/signin");
    expect(
      screen.queryByRole("navigation", { name: /main navigation/i }),
    ).toBeNull();
  });

  it("the demo button mints a demo session", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WelcomePage />);
    fireEvent.click(screen.getByRole("button", { name: /try the demo/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/demo", { method: "POST" }),
    );
  });
});
