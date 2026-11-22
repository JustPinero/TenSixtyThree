// @vitest-environment jsdom
/** Phase 68.3 — account menu, sign-out, demo exit, set-password prompt rules. */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";

const signOut = vi.fn(async () => ({}));
const changePassword = vi.fn<(args: unknown) => Promise<{ error: null }>>(async () => ({ error: null }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: () => signOut(),
    changePassword: (args: unknown) => changePassword(args),
  },
}));
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

import { AccountMenu } from "./account-menu";
import { SetPasswordPrompt } from "./set-password-prompt";

const REAL = {
  user: { name: "Alice", email: "alice@x.dev", role: "user", isDemo: false },
  hasPassword: false,
  hasAnthropicKey: false,
};
const DEMO = {
  ...REAL,
  user: { ...REAL.user, name: "Demo Explorer", isDemo: true },
};

function stubAccount(
  body: unknown,
  extra?: (url: string, init?: RequestInit) => unknown,
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const special = extra?.(url, init);
    if (special) return special;
    return { ok: true, json: async () => body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: { href: "/" },
    writable: true,
  });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  signOut.mockClear();
});

describe("AccountMenu", () => {
  it("shows who you are, and sign out ends the session", async () => {
    stubAccount(REAL);
    render(<AccountMenu />);
    fireEvent.click(await screen.findByRole("button", { name: /alice/i }));
    expect(screen.getByText("alice@x.dev")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /set a password/i })
        .getAttribute("href"),
    ).toBe("/settings#password");
    expect(
      screen.getByRole("link", { name: /add your api key/i }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(window.location.href).toBe("/welcome"));
  });

  it("a demo visitor gets Exit demo, which ends the session server-side", async () => {
    const fetchMock = stubAccount(DEMO);
    render(<AccountMenu />);
    fireEvent.click(
      await screen.findByRole("button", { name: /demo visitor/i }),
    );
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /exit demo/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/demo", { method: "DELETE" }),
    );
  });

  it("renders nothing for the local operator (no account)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
    );
    const { container } = render(<AccountMenu />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.innerHTML).toBe("");
  });
});

describe("SetPasswordPrompt (68.3)", () => {
  it("never shows for a demo session", async () => {
    stubAccount(DEMO);
    const { container } = render(<SetPasswordPrompt />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("dismissal persists across reloads", async () => {
    stubAccount(REAL);
    const first = render(<SetPasswordPrompt />);
    fireEvent.click(
      await screen.findByRole("button", { name: /dismiss password prompt/i }),
    );
    first.unmount();
    const { container } = render(<SetPasswordPrompt />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });
});

describe("PasswordPanel (68.3)", () => {
  it("changing an existing password goes through Better Auth with the current one", async () => {
    stubAccount({ ...REAL, hasPassword: true });
    const { PasswordPanel } = await import("./password-panel");
    render(<PasswordPanel />);
    fireEvent.change(await screen.findByLabelText(/current password/i), { target: { value: "old-secret" } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "new-secret-123" } });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: "old-secret",
        newPassword: "new-secret-123",
        revokeOtherSessions: true,
      }),
    );
  });

  it("is hidden for demo sessions", async () => {
    stubAccount(DEMO);
    const { PasswordPanel } = await import("./password-panel");
    const { container } = render(<PasswordPanel />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });
});
