// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getThemeSoundProfile } from "./sounds";
import { getThemePack } from "./theme-registry";

beforeEach(() => localStorage.clear());

describe("getThemeSoundProfile (53.5)", () => {
  it("resolves the stored theme's pack profile", () => {
    localStorage.setItem("cascade-theme", "console");
    expect(getThemeSoundProfile()).toEqual(getThemePack("console")!.sound);
  });

  it("defaults to cyberpunk when unset", () => {
    expect(getThemeSoundProfile()).toEqual(getThemePack("cyberpunk")!.sound);
  });

  it("defaults to cyberpunk on garbage", () => {
    localStorage.setItem("cascade-theme", "vaporwave");
    expect(getThemeSoundProfile()).toEqual(getThemePack("cyberpunk")!.sound);
  });
});
