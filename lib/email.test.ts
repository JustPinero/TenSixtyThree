import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail } from "./email";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("posts to Resend with bearer auth and the message payload", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("EMAIL_FROM", "TenSixtyThree <auth@mail.tensixtythree.com>");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "e1" }) });

    const result = await sendEmail({
      to: "a@b.dev",
      subject: "Your code",
      html: "<b>123456</b>",
    });

    expect(result.sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_123");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["a@b.dev"]);
    expect(body.subject).toBe("Your code");
    expect(body.from).toContain("mail.tensixtythree.com");
  });

  it("falls back to a console log when RESEND_API_KEY is unset", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await sendEmail({
      to: "a@b.dev",
      subject: "Your code",
      html: "<b>123456</b>",
    });
    expect(result.sent).toBe(false);
    expect(result.logged).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("never throws on network failure or API error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    await expect(
      sendEmail({ to: "a@b.dev", subject: "s", html: "h" }),
    ).resolves.toEqual(expect.objectContaining({ sent: false }));

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ message: "bad" }),
    });
    await expect(
      sendEmail({ to: "a@b.dev", subject: "s", html: "h" }),
    ).resolves.toEqual(expect.objectContaining({ sent: false }));
  });
});
