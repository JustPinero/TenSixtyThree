// @vitest-environment jsdom
/** Phase 68.2 — first-run vs filtered-empty vs failed-to-load, and connect-a-repo. */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ProjectGrid } from "./project-grid";
import { DeploymentModeProvider } from "./deployment-mode";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function hosted(node: ReactNode) {
  return render(
    <DeploymentModeProvider mode="hosted" isOperator={false}>
      {node}
    </DeploymentModeProvider>,
  );
}

describe("ProjectGrid empty states (68.2)", () => {
  it("a brand-new hosted account sees the get-started panel", () => {
    hosted(<ProjectGrid projects={[]} loading={false} totalCount={0} />);
    expect(screen.getByTestId("first-run")).toBeTruthy();
    expect(screen.getByLabelText(/owner\/repo/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /team/i }).getAttribute("href"),
    ).toBe("/team");
    expect(screen.getByRole("link", { name: /open the chat/i })).toBeTruthy();
  });

  it("filters that match nothing say so (not the first-run panel)", () => {
    hosted(<ProjectGrid projects={[]} loading={false} totalCount={4} />);
    expect(screen.queryByTestId("first-run")).toBeNull();
    expect(screen.getByText(/match your filters/i)).toBeTruthy();
  });

  it("a failed load says so and offers a retry", () => {
    const onRetry = vi.fn();
    hosted(
      <ProjectGrid
        projects={[]}
        loading={false}
        totalCount={0}
        loadError
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/couldn.t load/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("local installs get the local first-run hint", () => {
    render(<ProjectGrid projects={[]} loading={false} totalCount={0} />);
    expect(screen.queryByTestId("first-run")).toBeNull();
    expect(screen.getByText(/scan/i)).toBeTruthy();
  });
});

describe("connect a repo (68.2)", () => {
  it("posts the repo and refreshes on success", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ project: {} }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onConnected = vi.fn();
    hosted(
      <ProjectGrid
        projects={[]}
        loading={false}
        totalCount={0}
        onConnected={onConnected}
      />,
    );
    fireEvent.change(screen.getByLabelText(/owner\/repo/i), {
      target: { value: "acme/site" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/connect",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ githubRepo: "acme/site" }),
      }),
    );
  });

  it("shows the server's reason when connecting fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: "You've already connected this repository.",
        }),
      })),
    );
    hosted(<ProjectGrid projects={[]} loading={false} totalCount={0} />);
    fireEvent.change(screen.getByLabelText(/owner\/repo/i), {
      target: { value: "acme/site" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /already connected/i,
    );
  });

  it("phase 74 — when the app isn't installed, links to the install page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: "Install the TenSixtyThree GitHub App on acme/site first, then connect it again.",
          reason: "app-not-installed",
          installUrl: "https://github.com/apps/tensixtythree-runner/installations/new",
        }),
      })),
    );
    hosted(<ProjectGrid projects={[]} loading={false} totalCount={0} />);
    fireEvent.change(screen.getByLabelText(/owner\/repo/i), {
      target: { value: "acme/site" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    const link = await screen.findByRole("link", { name: /install the github app/i });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/apps/tensixtythree-runner/installations/new",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("ignores an install link that isn't on github.com", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: "x",
          reason: "app-not-installed",
          installUrl: "https://evil.example/install",
        }),
      })),
    );
    hosted(<ProjectGrid projects={[]} loading={false} totalCount={0} />);
    fireEvent.change(screen.getByLabelText(/owner\/repo/i), {
      target: { value: "acme/site" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: /install the github app/i })).toBeNull();
  });
});
