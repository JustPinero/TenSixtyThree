// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingSkeleton, PageSkeleton } from "./loading-skeleton";

describe("LoadingSkeleton", () => {
  it("renders with pulse animation", () => {
    const { container } = render(<LoadingSkeleton />);
    const pulse = container.querySelector(".animate-pulse");
    expect(pulse).not.toBeNull();
  });

  it("renders skeleton blocks", () => {
    const { container } = render(<LoadingSkeleton />);
    const blocks = container.querySelectorAll(".bg-space-700");
    expect(blocks.length).toBeGreaterThan(0);
  });
});

describe("PageSkeleton (77)", () => {
  it.each(["board", "table", "list"] as const)("%s variant is an announced status", (variant) => {
    render(<PageSkeleton label={`Loading ${variant}`} variant={variant} />);
    const status = screen.getByRole("status", { name: `Loading ${variant}` });
    expect(status.querySelectorAll(".bg-space-700").length).toBeGreaterThan(0);
  });
});
