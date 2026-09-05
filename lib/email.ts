/**
 * 54.2 — outbound email via Resend's HTTP API.
 *
 * No RESEND_API_KEY → console-log fallback so local/dev auth flows stay
 * fully exercisable. Never throws: auth flows must not die on a mail
 * provider hiccup — callers get {sent:false} and the server log carries
 * the payload.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  sent: boolean;
  logged?: boolean;
  error?: string;
}

const DEFAULT_FROM = "TenSixtyThree <auth@mail.tensixtythree.com>";

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[auth-email] (no RESEND_API_KEY, logging) → ${message.to}: ${message.subject} | ${message.text ?? message.html}`,
    );
    return { sent: false, logged: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`[auth-email] Resend ${res.status} for ${message.to}`);
      return { sent: false, error: `resend-${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error(`[auth-email] send failed for ${message.to}:`, err);
    return { sent: false, error: "network" };
  }
}
