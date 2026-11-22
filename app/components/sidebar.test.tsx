// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { Sidebar } from "./sidebar";

// Mock next/navigation. Mutable so a test can simulate a route change.
const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
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
      "Project overview — health, progress, activity",
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
      'select[aria-label="Switch theme pack"]',
    );
    expect(select).not.toBeNull();
    expect(select!.querySelectorAll("option").length).toBeGreaterThanOrEqual(
      12,
    );
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
});

describe("mobile drawer behaviour (Phase 71.4)", () => {
  // A real EventTarget supplies add/removeEventListener, so the fake is a
  // genuine MediaQueryList shape without casts.
  function fakeMql(matches: boolean, media: string): MediaQueryList {
    return Object.assign(new EventTarget(), {
      matches,
      media,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
    });
  }
  function viewport(desktop: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => fakeMql(desktop, query));
  }
  // Phone width: (min-width: 1024px) does not match.
  const phoneViewport = () => viewport(false);
  afterEach(() => {
    vi.unstubAllGlobals();
    nav.pathname = "/";
  });

  function open(container: HTMLElement) {
    act(() => {
      (
        container.querySelector(
          'button[aria-label="Open navigation"]',
        ) as HTMLButtonElement
      ).click();
    });
  }
  const drawer = (c: HTMLElement) =>
    c.querySelector("#sidebar-nav") as HTMLElement;

  it("is inert while closed below lg, so its links are not tab stops", () => {
    phoneViewport();
    const { container } = render(<Sidebar />);
    expect(drawer(container).hasAttribute("inert")).toBe(true);
    open(container);
    expect(drawer(container).hasAttribute("inert")).toBe(false);
  });

  it("moves focus into the drawer when it opens", () => {
    phoneViewport();
    const { container } = render(<Sidebar />);
    open(container);
    expect(drawer(container).contains(document.activeElement)).toBe(true);
  });

  it("closes when the route changes (tapping a link navigates)", () => {
    phoneViewport();
    const { container, rerender } = render(<Sidebar />);
    open(container);
    expect(drawer(container).hasAttribute("inert")).toBe(false);
    nav.pathname = "/knowledge";
    rerender(<Sidebar />);
    expect(container.querySelector(".fixed.inset-0")).toBeNull();
    expect(drawer(container).hasAttribute("inert")).toBe(true);
  });

  it("is never inert at desktop width (the sidebar is always visible there)", () => {
    viewport(true);
    const { container } = render(<Sidebar />);
    expect(drawer(container).hasAttribute("inert")).toBe(false);
  });
});

describe("68.1 — nav per deployment mode", () => {
  it("snapshot: local shows everything, hosted drops disk/CLI pages", async () => {
    const { visibleNavItems } = await import("./sidebar");
    expect(visibleNavItems("local").map((i) => i.href)).toMatchInlineSnapshot(`
      [
        "/",
        "/delamain",
        "/tasks",
        "/roadmap",
        "/boards",
        "/team",
        "/playbook",
        "/knowledge",
        "/create",
        "/reports",
        "/templates",
        "/observability/cache",
        "/observability/tools",
        "/settings",
      ]
    `);
    expect(visibleNavItems("hosted").map((i) => i.href)).toMatchInlineSnapshot(`
      [
        "/",
        "/delamain",
        "/tasks",
        "/roadmap",
        "/boards",
        "/team",
        "/knowledge",
        "/reports",
        "/observability/cache",
        "/observability/tools",
        "/settings",
      ]
    `);
  });

  it("a plain hosted user does not see admin-only pages", async () => {
    const { visibleNavItems } = await import("./sidebar");
    const hrefs = visibleNavItems("hosted", false).map((i) => i.href);
    expect(hrefs).not.toContain("/knowledge");
    expect(hrefs.some((h) => h.startsWith("/observability"))).toBe(false);
    expect(hrefs).toContain("/boards");
    expect(hrefs).toContain("/settings");
  });
});

