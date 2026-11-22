// @vitest-environment jsdom
/** Phase 72 — settings toggles read through useSyncExternalStore. */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useStoredFlag } from "./use-stored-flag";

function Flag({ id }: { id: string }) {
  const [on, set] = useStoredFlag("test-flag", true, (raw) => raw !== "false");
  return (
    <button type="button" data-testid={id} onClick={() => set(!on)}>
      {on ? "on" : "off"}
    </button>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("useStoredFlag", () => {
  it("server render uses the default (no localStorage, no mismatch)", () => {
    localStorage.setItem("test-flag", "false");
    expect(renderToString(<Flag id="a" />)).toContain("on");
  });

  it("reads the stored value on the client and keeps two toggles in sync", () => {
    localStorage.setItem("test-flag", "false");
    render(
      <>
        <Flag id="a" />
        <Flag id="b" />
      </>,
    );
    expect(screen.getByTestId("a").textContent).toBe("off");
    act(() => {
      fireEvent.click(screen.getByTestId("a"));
    });
    expect(screen.getByTestId("a").textContent).toBe("on");
    expect(screen.getByTestId("b").textContent).toBe("on");
    expect(localStorage.getItem("test-flag")).toBe("true");
  });
});
