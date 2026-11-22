// @vitest-environment jsdom
/** Phase 72 — double Enter sends one request (command panel + Overseer chat guard). */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CommandPanel } from "./command-panel";

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommandPanel", () => {
  it("two Enters in a row send one request", async () => {
    const fetchMock = vi.fn(() => new Promise(() => {})); // never resolves: still streaming
    vi.stubGlobal("fetch", fetchMock);
    render(<CommandPanel projectSlug="p" projectName="P" />);
    const expand = screen.queryByRole("button", {
      name: /ask|command|chat|expand/i,
    });
    if (expand) fireEvent.click(expand);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "status?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
