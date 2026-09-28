// @vitest-environment jsdom
/**
 * Phase 62.2 — the 5 hand-rolled toggles were bare <button>s wrapping a
 * decorative <div> knob: no accessible name, no role, no state. A screen
 * reader announced "button" and nothing else, so notifications, voice and
 * the PR workflow had no discoverable on/off state.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { Toggle } from "./toggle";

describe("Toggle", () => {
  it("exposes role=switch with an accessible name", () => {
    render(
      <Toggle checked={false} onChange={() => {}} label="Browser notifications" />,
    );
    expect(
      screen.getByRole("switch", { name: "Browser notifications" }),
    ).toBeTruthy();
  });

  it("reflects state through aria-checked", () => {
    const { rerender } = render(
      <Toggle checked={false} onChange={() => {}} label="Voice" />,
    );
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    rerender(<Toggle checked onChange={() => {}} label="Voice" />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("fires onChange with the NEXT value on click", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="PR workflow" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is a real <button>, so Space/Enter activate it natively", () => {
    render(<Toggle checked={false} onChange={() => {}} label="PR workflow" />);
    expect(screen.getByRole("switch").tagName).toBe("BUTTON");
    expect(screen.getByRole("switch").getAttribute("type")).toBe("button");
  });

  it("does not fire when disabled, and says why", () => {
    const onChange = vi.fn();
    render(
      <Toggle
        checked={false}
        onChange={onChange}
        label="Browser notifications"
        disabled
        disabledReason="Blocked in browser settings"
      />,
    );
    const el = screen.getByRole("switch");
    expect(el.hasAttribute("disabled")).toBe(true);
    fireEvent.click(el);
    expect(onChange).not.toHaveBeenCalled();
    expect(el.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Blocked in browser settings")).toBeTruthy();
  });

  it("carries a visible focus ring", () => {
    render(<Toggle checked={false} onChange={() => {}} label="Voice" />);
    expect(screen.getByRole("switch").className).toContain("focus-ring");
  });

  it("paints the knob with theme tokens, not a fixed white", () => {
    const { container } = render(
      <Toggle checked onChange={() => {}} label="Voice" />,
    );
    expect(container.innerHTML).not.toContain("bg-white");
  });
});

describe("no hand-rolled toggles remain", () => {
  const root = path.resolve(__dirname, "../../..");
  for (const f of [
    "app/settings/page.tsx",
    "app/components/wizard/config-step.tsx",
    "app/components/wizard/github-step.tsx",
  ]) {
    it(`${f} uses the Toggle primitive`, () => {
      const src = readFileSync(path.join(root, f), "utf-8");
      expect(src, `${f} still paints a raw knob`).not.toMatch(
        /absolute top-0\.5 w-4 h-4 rounded-full/,
      );
      expect(src, `${f} has a switch without role=switch`).not.toMatch(
        /w-10 h-5 rounded-full/,
      );
    });
  }
});
