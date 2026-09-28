// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders ## as a real heading element, not literal text", () => {
    render(<Markdown source="## Good morning" />);
    const h = screen.getByRole("heading", { level: 2 });
    expect(h.textContent).toBe("Good morning");
    expect(document.body.textContent).not.toContain("##");
  });

  it("renders **bold** as <strong>, not asterisks", () => {
    const { container } = render(<Markdown source="**Quick stats:** 3 active" />);
    expect(container.querySelector("strong")?.textContent).toBe("Quick stats:");
    expect(container.textContent).not.toContain("**");
  });

  it("renders lists as real list elements", () => {
    const { container } = render(<Markdown source={"- alpha\n- beta"} />);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("renders ordered lists as <ol>", () => {
    const { container } = render(<Markdown source={"1. one\n2. two"} />);
    expect(container.querySelector("ol")).not.toBeNull();
  });

  it("does not inject markup from content", () => {
    const { container } = render(
      <Markdown source={"path: <img src=x onerror=alert(1)>"} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("renders nothing for empty input", () => {
    const { container } = render(<Markdown source="" />);
    expect(container.querySelectorAll("p, h2, h3, ul, ol")).toHaveLength(0);
  });
});

describe("morning briefing wiring (Phase 63.3)", () => {
  it("the briefing panel renders markdown instead of pre-wrapped source", async () => {
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const src = readFileSync(
      path.resolve(__dirname, "../morning-briefing.tsx"),
      "utf-8",
    );
    expect(src).toContain("<Markdown");
    expect(src, "raw markdown was being shown to users").not.toMatch(
      /whitespace-pre-wrap[\s\S]{0,80}briefing\.briefing/,
    );
  });
});
