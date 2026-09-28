// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { Sidebar } from "./sidebar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    title,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    title?: string;
  }) => (
    <a href={href} className={className} title={title}>
      {children}
    </a>
  ),
}));

describe("Sidebar", () => {
  it("renders the TenSixtyThree brand", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<Sidebar />);
      container = result.container;
    });
    expect(container!.textContent).toContain("TenSixtyThree");
  });

  it("renders all navigation items", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<Sidebar />);
      container = result.container;
    });
    expect(container!.textContent).toContain("Dashboard");
    expect(container!.textContent).toContain("Knowledge Base");
    expect(container!.textContent).toContain("Create Project");
    expect(container!.textContent).toContain("Reports");
    expect(container!.textContent).toContain("Templates");
  });

  it("renders navigation links with correct hrefs", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<Sidebar />);
      container = result.container;
    });
    const links = container!.querySelectorAll("a");
    const hrefs = Array.from(links).map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/knowledge");
    expect(hrefs).toContain("/create");
    expect(hrefs).toContain("/reports");
    expect(hrefs).toContain("/templates");
  });

  it("nav items have tooltips as title attributes", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<Sidebar />);
      container = result.container;
    });
    const linksWithTitle = Array.from(container!.querySelectorAll("a[title]"));
    expect(linksWithTitle.length).toBeGreaterThanOrEqual(10);
  });

  it("Dashboard nav item tooltip is correct", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<Sidebar />);
      container = result.container;
    });
    const dashboardLink = container!.querySelector('a[href="/"]')!;
    expect(dashboardLink.getAttribute("title")).toBe(
      "Project overview — health, progress, activity"
    );
  });

  it("all nav tooltip strings are under 60 characters", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<Sidebar />);
      container = result.container;
    });
    const links = Array.from(container!.querySelectorAll("a[title]"));
    links.forEach((link) => {
      const t = link.getAttribute("title")!;
      expect(t.length, `"${t}" exceeds 60 chars`).toBeLessThanOrEqual(60);
    });
  });

  it("shows version in footer", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<Sidebar />);
      container = result.container;
    });
    expect(container!.textContent).toContain("Delamain v1");
  });
});

describe("Sidebar theme quick-switcher (53.5)", () => {
  it("renders a labeled theme-pack select", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<Sidebar />);
      container = result.container;
    });
    const select = container!.querySelector(
      'select[aria-label="Switch theme pack"]'
    );
    expect(select).not.toBeNull();
    expect(select!.querySelectorAll("option").length).toBeGreaterThanOrEqual(12);
  });
});

describe("mobile drawer keyboard access (Phase 62.4)", () => {
  function openDrawer(container: HTMLElement) {
    const opener = container.querySelector(
      'button[aria-label="Open navigation"]',
    ) as HTMLButtonElement;
    act(() => {
      opener.click();
    });
    return opener;
  }

  it("the scrim is hidden from assistive tech (it is a click target only)", () => {
    const { container } = render(<Sidebar />);
    openDrawer(container);
    const scrim = container.querySelector(".fixed.inset-0");
    expect(scrim, "no scrim rendered").not.toBeNull();
    expect(scrim!.getAttribute("aria-hidden")).toBe("true");
  });

  it("Escape closes the drawer, so keyboard users are not trapped", () => {
    const { container } = render(<Sidebar />);
    openDrawer(container);
    expect(container.querySelector(".fixed.inset-0")).not.toBeNull();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(container.querySelector(".fixed.inset-0")).toBeNull();
  });

  it("exposes the drawer state on the opener", () => {
    const { container } = render(<Sidebar />);
    const opener = openDrawer(container);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
  });
})
