// @vitest-environment jsdom
/**
 * Phase 34 — first tests for the 1093-LOC OverseerChat component.
 * Closes the residual UI piece of audit finding [30.D2].
 *
 * Smoke level: the component mounts, the initial fetches fire, the
 * input round-trips text, and sending a message hits /api/overseer/chat.
 * Speech recognition + TTS are stubbed so jsdom doesn't choke; deep
 * SSE-streaming behavior is intentionally out of scope for this smoke.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent, waitFor, screen } from "@testing-library/react";

vi.mock("@/lib/sounds", () => ({
  playStartSound: vi.fn(),
  playEndSound: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/speak", () => ({
  speak: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@/lib/silence-detector", () => ({
  createSilenceDetector: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock("@/lib/dispatch-tag-parser", () => ({
  extractDispatchActions: vi.fn(() => []),
}));

vi.mock("@/lib/local-today", () => ({
  localToday: () => "2026-06-09",
}));

vi.mock("@/lib/session-memory", () => ({
  hasSessionMemory: () => false,
}));

vi.mock("@/lib/overseer-settings", () => ({
  getOverseerSettings: () => ({
    name: "Delamain",
    portraitIdle: "/delamain.jpg",
    portraitTalking: null,
    voiceEnabled: false,
    voiceURI: null,
    voiceRate: 1.0,
    voicePitch: 1.0,
    silenceThresholdMs: 1500,
    micMode: "toggle",
    usesTalkingFace: true,
  }),
  setOverseerSettings: vi.fn(),
}));

vi.mock("@/app/components/portrait", () => ({
  Portrait: ({ alt }: { alt?: string }) => (
    <div data-testid="portrait" aria-label={alt || ""} />
  ),
}));

import { OverseerChat } from "./overseer-chat";

type FetchHandler = (
  url: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  body?: ReadableStream<Uint8Array> | null;
}>;

function installFetchMock(handler: FetchHandler) {
  const mock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const res = await handler(String(url), init);
    return res as unknown as Response;
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(() => {
  // Silence the speech-recognition globals if the component pokes them.
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    value: undefined,
  });
  // jsdom doesn't implement Element.scrollTo / scrollHeight wiring.
  // The component's auto-scroll effect calls scrollRef.current?.scrollTo
  // — stub it so the effect is a no-op instead of throwing.
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("OverseerChat — smoke", () => {
  it("mounts without crashing and fires the initial session-state + history fetches", async () => {
    const fetchMock = installFetchMock(async (url) => {
      if (url.includes("/api/overseer/session-state")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ exists: false }),
        };
      }
      if (url.includes("/api/overseer/history")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    });

    let container: HTMLElement;
    await act(async () => {
      const result = render(<OverseerChat onDispatch={() => {}} />);
      container = result.container;
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(
      calledUrls.some((u) => u.includes("/api/overseer/session-state"))
    ).toBe(true);
    expect(calledUrls.some((u) => u.includes("/api/overseer/history"))).toBe(
      true
    );
    // The chat input is the entry point — must be present.
    expect(container!.querySelector("input,textarea")).not.toBeNull();
  });

  it("renders messages rehydrated from /api/overseer/history", async () => {
    installFetchMock(async (url) => {
      if (url.includes("/api/overseer/history")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { role: "user", content: "hello there" },
            { role: "assistant", content: "hi back" },
          ],
        };
      }
      if (url.includes("/api/overseer/session-state")) {
        return { ok: true, status: 200, json: async () => ({ exists: false }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    let container: HTMLElement;
    await act(async () => {
      const result = render(<OverseerChat onDispatch={() => {}} />);
      container = result.container;
    });

    await waitFor(() => {
      expect(container!.textContent).toContain("hello there");
      expect(container!.textContent).toContain("hi back");
    });
  });

  it("survives a failing history fetch (component still mounts, input still works)", async () => {
    installFetchMock(async (url) => {
      if (url.includes("/api/overseer/history")) {
        throw new Error("network down");
      }
      if (url.includes("/api/overseer/session-state")) {
        return { ok: true, status: 200, json: async () => ({ exists: false }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    let container: HTMLElement;
    await act(async () => {
      const result = render(<OverseerChat onDispatch={() => {}} />);
      container = result.container;
    });

    // The input still rendered — history failure didn't take the
    // component down with it.
    const input = container!.querySelector("input,textarea") as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    expect(input).not.toBeNull();
  });

  it("updates the input state when the user types", async () => {
    installFetchMock(async (url) => {
      if (url.includes("/api/overseer/history")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url.includes("/api/overseer/session-state")) {
        return { ok: true, status: 200, json: async () => ({ exists: false }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    let container: HTMLElement;
    await act(async () => {
      const result = render(<OverseerChat onDispatch={() => {}} />);
      container = result.container;
    });

    const input = container!.querySelector(
      "input,textarea"
    ) as HTMLInputElement | HTMLTextAreaElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      fireEvent.change(input!, { target: { value: "hello del" } });
    });
    expect(input!.value).toBe("hello del");
  });

  it("renders the configured overseer name (smoke: settings hook fires)", async () => {
    installFetchMock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ exists: false }),
    }));

    let container: HTMLElement;
    await act(async () => {
      const result = render(<OverseerChat onDispatch={() => {}} />);
      container = result.container;
    });

    await waitFor(() => {
      // The mocked settings return name "Delamain" — it should appear
      // somewhere in the rendered tree (chat header, label, etc.).
      expect(container!.textContent || "").toMatch(/Delamain/i);
    });
  });
});

describe("OverseerChat — 69.2 rendering and input", () => {
  function baseHandler(chat: () => ReturnType<FetchHandler>, history: unknown[] = []): FetchHandler {
    return async (url, init) => {
      if (url.includes("/api/overseer/chat") && init?.method === "POST") return chat();
      if (url.includes("/api/overseer/history")) {
        return { ok: true, status: 200, json: async () => history };
      }
      return { ok: true, status: 200, json: async () => ({ exists: false }) };
    };
  }

  async function mount() {
    let container: HTMLElement;
    await act(async () => {
      container = render(<OverseerChat onDispatch={() => {}} />).container;
    });
    return container!;
  }

  it("assistant replies render as markdown (bold, code, links), inside a polite log", async () => {
    installFetchMock(
      baseHandler(
        async () => ({ ok: true, status: 200, json: async () => ({}) }),
        [{ role: "assistant", content: "**Blocked**: run `pnpm test`, see [L-7]." }],
      ),
    );
    const container = await mount();
    await waitFor(() => expect(container.querySelector("strong")?.textContent).toBe("Blocked"));
    expect(container.querySelector("code")?.textContent).toBe("pnpm test");
    expect(container.querySelector('a[href="/knowledge/lesson/7"]')).not.toBeNull();
    const log = container.querySelector('[role="log"]');
    expect(log?.getAttribute("aria-live")).toBe("polite");
  });

  it("Shift+Enter keeps a newline; Enter sends the multi-line text", async () => {
    const fetchMock = installFetchMock(
      baseHandler(async () => ({ ok: false, status: 500, json: async () => ({ error: "x" }) })),
    );
    const container = await mount();
    const box = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "line one\nline two" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    const chatPosts = () =>
      fetchMock.mock.calls.filter(([u, i]) => String(u).includes("/api/overseer/chat") && i?.method === "POST");
    expect(chatPosts()).toHaveLength(0);
    expect(box.value).toBe("line one\nline two");
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() => expect(chatPosts()).toHaveLength(1));
    const body = JSON.parse(String(chatPosts()[0][1]?.body)) as {
      messages: { content: string }[];
    };
    expect(body.messages.at(-1)?.content).toBe("line one\nline two");
  });

  it("75 — clicking an example prompt sends it", async () => {
    const fetchMock = installFetchMock(
      baseHandler(async () => ({ ok: false, status: 500, json: async () => ({ error: "x" }) })),
    );
    await mount();
    const example = await screen.findByRole("button", {
      name: /what needs my attention today/i,
    });
    await act(async () => {
      fireEvent.click(example);
    });
    const chatPosts = () =>
      fetchMock.mock.calls.filter(([u, i]) => String(u).includes("/api/overseer/chat") && i?.method === "POST");
    await waitFor(() => expect(chatPosts()).toHaveLength(1));
    const body = JSON.parse(String(chatPosts()[0][1]?.body)) as {
      messages: { content: string }[];
    };
    expect(body.messages.at(-1)?.content).toBe("What needs my attention today?");
  });

  it("a failed send gives the draft back and offers Retry", async () => {
    installFetchMock(
      baseHandler(async () => ({ ok: false, status: 503, json: async () => ({ error: "Overloaded" }) })),
    );
    const container = await mount();
    const box = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "plan my week" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/overloaded/i));
    expect(box.value).toBe("plan my week");
    expect(container.querySelector('[role="alert"] button')?.textContent).toMatch(/retry/i);
  });

  it("does not yank the view down while the reader is scrolled up", async () => {
    installFetchMock(
      baseHandler(async () => ({ ok: false, status: 500, json: async () => ({ error: "x" }) })),
    );
    const container = await mount();
    const log = container.querySelector('[role="log"]') as HTMLElement;
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 200 });
    Object.defineProperty(log, "scrollTop", { configurable: true, value: 100, writable: true });
    fireEvent.scroll(log);
    const scrollTo = vi.mocked(Element.prototype.scrollTo);
    scrollTo.mockClear();
    const box = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hello" } });
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
