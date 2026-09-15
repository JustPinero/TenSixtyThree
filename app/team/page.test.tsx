// @vitest-environment jsdom
/** /team page — local-mode notice (OrgWorkspace fallback). */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("/team page", () => {
  it("renders the sign-in notice when no session is available", async () => {
    const { default: TeamPage } = await import("./page");
    render(<TeamPage />);
    // OrgWorkspace's /api/orgs probe fails in jsdom → falls back to children.
    expect(await screen.findByText(/hosted features/i)).toBeInTheDocument();
  });
});
