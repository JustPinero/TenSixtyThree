// @vitest-environment jsdom
/** Phase 72 — sign-in edge cases. */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

const sendOtp = vi.fn();
const signInOtp = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: (a: unknown) => sendOtp(a) },
    signIn: {
      social: vi.fn(),
      emailOtp: (a: unknown) => signInOtp(a),
      email: vi.fn(async () => ({ error: null })),
    },
  },
}));

import SignInPage from "./page";

beforeEach(() => {
  sendOtp.mockReset().mockResolvedValue({ error: null });
  signInOtp.mockReset().mockResolvedValue({ error: null });
  window.history.replaceState({}, "", "/signin");
});
afterEach(() => cleanup());

const email = () => screen.getByLabelText(/^email$/i) as HTMLInputElement;

describe("sign-in flows (72)", () => {
  it("Enter in the email field sends the code (form submit)", async () => {
    render(<SignInPage />);
    fireEvent.change(email(), { target: { value: "a@x.dev" } });
    fireEvent.submit(email().closest("form") as HTMLFormElement);
    await waitFor(() =>
      expect(sendOtp).toHaveBeenCalledWith({
        email: "a@x.dev",
        type: "sign-in",
      }),
    );
  });

  it("after the code is sent: confirmation, email locked, 'use a different email' unlocks", async () => {
    render(<SignInPage />);
    fireEvent.change(email(), { target: { value: "a@x.dev" } });
    fireEvent.submit(email().closest("form") as HTMLFormElement);
    expect((await screen.findByRole("status")).textContent).toMatch(
      /code sent to a@x\.dev/i,
    );
    expect(email().readOnly).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: /use a different email/i }),
    );
    expect(email().readOnly).toBe(false);
    expect(screen.queryByLabelText(/6-digit code/i)).toBeNull();
  });

  it("?error= from OAuth / the invite gate is explained", () => {
    window.history.replaceState({}, "", "/signin?error=signup_disabled");
    render(<SignInPage />);
    expect(screen.getByRole("alert").textContent).toMatch(/invitation/i);
  });

  it("a thrown network error never leaves the form stuck busy", async () => {
    sendOtp.mockRejectedValueOnce(new Error("offline"));
    render(<SignInPage />);
    fireEvent.change(email(), { target: { value: "a@x.dev" } });
    fireEvent.submit(email().closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const send = screen.getByRole("button", {
      name: /email me a code/i,
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it("double submit sends one code", async () => {
    let resolve: (v: unknown) => void = () => {};
    sendOtp.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    render(<SignInPage />);
    fireEvent.change(email(), { target: { value: "a@x.dev" } });
    const form = email().closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    resolve({ error: null });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(sendOtp).toHaveBeenCalledTimes(1);
  });
});
