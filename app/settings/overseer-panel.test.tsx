// @vitest-environment jsdom
/** 77 — pick a portrait from the packs instead of typing a path. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { THEME_PACKS } from "@/lib/theme-registry";

const store: { settings: Record<string, unknown> } = { settings: {} };
vi.mock("@/lib/overseer-settings", () => ({
  getOverseerSettings: () => ({
    name: "Overseer",
    portraitIdle: "/delamain.jpg",
    portraitTalking: null,
    usesTalkingFace: false,
  }),
  setOverseerSettings: (s: Record<string, unknown>) => {
    store.settings = s;
  },
}));
vi.mock("@/app/components/portrait", () => ({
  Portrait: ({ alt }: { alt?: string }) => <span>{alt}</span>,
}));

import { OverseerPanel } from "./overseer-panel";

beforeEach(() => {
  store.settings = {};
});
afterEach(cleanup);

describe("OverseerPanel portrait picker (77)", () => {
  it("offers each pack's portrait and saves the one picked", () => {
    render(<OverseerPanel />);
    const pack = THEME_PACKS[1];
    const choice = screen.getByRole("button", {
      name: `Use the ${pack.persona.name} portrait`,
    });
    fireEvent.click(choice);
    expect(choice.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /save identity/i }));
    expect(store.settings.portraitIdle).toBe(pack.persona.portraitIdle);
    expect(store.settings.portraitTalking).toBe(pack.persona.portraitTalking);
  });

  it("keeps the custom path field, behind 'Use a custom image'", () => {
    render(<OverseerPanel />);
    expect(screen.getByText(/use a custom image/i)).toBeTruthy();
    expect(screen.getByLabelText(/idle portrait \(path or url\)/i)).toBeTruthy();
  });
});
