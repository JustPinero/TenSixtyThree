// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { applyThemePack, shouldApplyPersona } from "./theme-pack-apply";
import { getThemePack } from "./theme-registry";
import { getOverseerSettings, setOverseerSettings } from "./overseer-settings";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("shouldApplyPersona", () => {
  it("true on factory defaults (untouched install)", () => {
    expect(shouldApplyPersona(getOverseerSettings())).toBe(true);
  });

  it("true when the current persona is exactly some pack's persona", () => {
    const sage = getThemePack("sage")!;
    setOverseerSettings({
      name: sage.persona.name,
      portraitIdle: sage.persona.portraitIdle,
      portraitTalking: sage.persona.portraitTalking,
    });
    expect(shouldApplyPersona(getOverseerSettings())).toBe(true);
  });

  it("false once the name is hand-customized", () => {
    setOverseerSettings({ name: "Jarvis" });
    expect(shouldApplyPersona(getOverseerSettings())).toBe(false);
  });

  it("false once a portrait is hand-customized", () => {
    setOverseerSettings({ portraitIdle: "/my-face.png" });
    expect(shouldApplyPersona(getOverseerSettings())).toBe(false);
  });
});

describe("applyThemePack", () => {
  it("persists the theme key and stamps data-theme on <html>", () => {
    applyThemePack("console");
    expect(localStorage.getItem("cascade-theme")).toBe("console");
    expect(document.documentElement.getAttribute("data-theme")).toBe("console");
  });

  it("applies the pack persona when the current persona is pristine", () => {
    applyThemePack("sage");
    const settings = getOverseerSettings();
    const sage = getThemePack("sage")!;
    expect(settings.name).toBe(sage.persona.name);
    expect(settings.portraitIdle).toBe(sage.persona.portraitIdle);
    expect(settings.portraitTalking).toBe(sage.persona.portraitTalking);
  });

  it("switching packs again keeps swapping personas (pack persona is still pristine)", () => {
    applyThemePack("sage");
    applyThemePack("specter");
    expect(getOverseerSettings().name).toBe(
      getThemePack("specter")!.persona.name,
    );
  });

  it("leaves a hand-customized persona alone but still switches theme", () => {
    setOverseerSettings({ name: "Jarvis", portraitIdle: "/my-face.png" });
    applyThemePack("pilot");
    expect(localStorage.getItem("cascade-theme")).toBe("pilot");
    const settings = getOverseerSettings();
    expect(settings.name).toBe("Jarvis");
    expect(settings.portraitIdle).toBe("/my-face.png");
  });

  it("does not touch non-persona overseer fields (voice, mic)", () => {
    setOverseerSettings({ voiceEnabled: true, micMode: "push-to-talk" });
    applyThemePack("sunny");
    const settings = getOverseerSettings();
    expect(settings.voiceEnabled).toBe(true);
    expect(settings.micMode).toBe("push-to-talk");
  });

  it("ignores an unknown key entirely", () => {
    applyThemePack("vaporwave");
    expect(localStorage.getItem("cascade-theme")).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});
