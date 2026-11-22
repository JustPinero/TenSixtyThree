// @vitest-environment jsdom
/** Phase 72 — Templates page has a real empty state. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TemplatesPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/templates", () => {
  it("explains what templates are when there are none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(<TemplatesPage />);
    expect(await screen.findByText(/no templates yet/i)).toBeTruthy();
  });
});
