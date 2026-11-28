// @vitest-environment jsdom
/** 77 — settings jump links point at sections that exist. */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SettingsNav, SETTINGS_SECTIONS } from "./settings-nav";

describe("SettingsNav (77)", () => {
  it("renders a named nav with one link per section", () => {
    render(<SettingsNav />);
    const nav = screen.getByRole("navigation", { name: /settings sections/i });
    expect(nav.querySelectorAll("a")).toHaveLength(SETTINGS_SECTIONS.length);
  });

  it("every link target id exists in the settings page or its panels", () => {
    const src = ["page.tsx", "overseer-panel.tsx"]
      .map((f) => readFileSync(path.join(__dirname, f), "utf8"))
      .join("\n");
    for (const s of SETTINGS_SECTIONS) {
      expect(src, s.id).toContain(`id="${s.id}"`);
    }
  });
});
