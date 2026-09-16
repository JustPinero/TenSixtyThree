/**
 * Cloudflare edge Worker `tensixtythree-edge` — routes tensixtythree.com/*
 * and www.tensixtythree.com/* while Railway's cert pipeline is broken for
 * this zone (see references/deployment-landmines.md → Cloudflare).
 */
import { describe, expect, it, vi } from "vitest";
import {
  APEX_HOST,
  CANONICAL_HOST,
  ORIGIN,
  handleRequest,
} from "./edge-worker";

function originStub(response: Response) {
  const calls: Request[] = [];
  const fetchOrigin = vi.fn(async (req: Request) => {
    calls.push(req);
    return response;
  });
  return { fetchOrigin, calls };
}

describe("edge worker — apex", () => {
  it("301s apex → https://www + path + query", async () => {
    const { fetchOrigin, calls } = originStub(new Response("nope"));
    const res = await handleRequest(
      new Request(`https://${APEX_HOST}/signin?next=%2Fdashboard`),
      { fetchOrigin },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      `https://${CANONICAL_HOST}/signin?next=%2Fdashboard`,
    );
    expect(calls).toHaveLength(0);
  });

  it("301s any non-canonical hostname (app.) → www", async () => {
    const { fetchOrigin } = originStub(new Response("nope"));
    const res = await handleRequest(
      new Request("https://app.tensixtythree.com/boards"),
      { fetchOrigin },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      `https://${CANONICAL_HOST}/boards`,
    );
  });

  it("apex redirect is method-agnostic (POST → 301 too)", async () => {
    const { fetchOrigin } = originStub(new Response("nope"));
    const res = await handleRequest(
      new Request(`https://${APEX_HOST}/api/demo`, { method: "POST", body: "x" }),
      { fetchOrigin },
    );
    expect(res.status).toBe(301);
  });
});

describe("edge worker — www proxy", () => {
  it("rewrites the URL to the Railway origin, keeps method/path/query/headers/body", async () => {
    const { fetchOrigin, calls } = originStub(new Response("ok"));
    await handleRequest(
      new Request(`https://${CANONICAL_HOST}/api/overseer/chat?x=1`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "s=1" },
        body: JSON.stringify({ hi: 1 }),
      }),
      { fetchOrigin },
    );
    expect(calls).toHaveLength(1);
    const sent = calls[0];
    expect(sent.url).toBe(`${ORIGIN}/api/overseer/chat?x=1`);
    expect(sent.method).toBe("POST");
    expect(sent.headers.get("content-type")).toBe("application/json");
    expect(sent.headers.get("cookie")).toBe("s=1");
    expect(await sent.text()).toBe(JSON.stringify({ hi: 1 }));
  });

  it("adds X-Forwarded-Host/Proto and does not forward a stale Host header", async () => {
    const { fetchOrigin, calls } = originStub(new Response("ok"));
    await handleRequest(
      new Request(`https://${CANONICAL_HOST}/`, {
        headers: { host: CANONICAL_HOST },
      }),
      { fetchOrigin },
    );
    const sent = calls[0];
    expect(sent.headers.get("x-forwarded-host")).toBe(CANONICAL_HOST);
    expect(sent.headers.get("x-forwarded-proto")).toBe("https");
    expect(sent.headers.get("host")).not.toBe(CANONICAL_HOST);
  });

  it("does not follow origin redirects itself (redirect: manual)", async () => {
    const { fetchOrigin, calls } = originStub(new Response("ok"));
    await handleRequest(new Request(`https://${CANONICAL_HOST}/`), {
      fetchOrigin,
    });
    expect(calls[0].redirect).toBe("manual");
  });

  it("rewrites absolute Location headers pointing at the origin back to www", async () => {
    const { fetchOrigin } = originStub(
      new Response(null, {
        status: 307,
        headers: { location: `${ORIGIN}/signin?next=%2Fboards` },
      }),
    );
    const res = await handleRequest(
      new Request(`https://${CANONICAL_HOST}/boards`),
      { fetchOrigin },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `https://${CANONICAL_HOST}/signin?next=%2Fboards`,
    );
  });

  it("leaves relative and third-party Location headers alone", async () => {
    for (const loc of ["/signin", "https://github.com/login/oauth/authorize?x=1"]) {
      const { fetchOrigin } = originStub(
        new Response(null, { status: 302, headers: { location: loc } }),
      );
      const res = await handleRequest(
        new Request(`https://${CANONICAL_HOST}/api/auth/github`),
        { fetchOrigin },
      );
      expect(res.headers.get("location")).toBe(loc);
    }
  });

  it("streams the origin body and preserves status + content-type (SSE)", async () => {
    const chunks = ["data: a\n\n", "data: b\n\n"];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    });
    const { fetchOrigin } = originStub(
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const res = await handleRequest(
      new Request(`https://${CANONICAL_HOST}/api/overseer/chat`),
      { fetchOrigin },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe(chunks.join(""));
  });

  it("returns 502 with a plain body when the origin fetch throws", async () => {
    const fetchOrigin = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const res = await handleRequest(
      new Request(`https://${CANONICAL_HOST}/`),
      { fetchOrigin },
    );
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});
