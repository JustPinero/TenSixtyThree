// @vitest-environment jsdom
/** Phase 51.2 AC5 — sign-in page renders all three auth options. */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { social: vi.fn(), magicLink: vi.fn() },
  },
}));

import SignInPage from "./page";

describe("/signin", () => {
  it("offers GitHub, Google, and magic-link sign-in (no password fields)", () => {
    render(<SignInPage />);
    expect(screen.getByText(/continue with github/i)).toBeInTheDocument();
    expect(screen.getByText(/continue with google/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@company\.com/i)).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
