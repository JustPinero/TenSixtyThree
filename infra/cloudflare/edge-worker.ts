/**
 * tensixtythree-edge — Cloudflare Worker in front of the Railway app.
 *
 * Why this exists: Railway's certificate pipeline never issued for the
 * tensixtythree.com zone (5 weeks ISSUING / VALIDATING_OWNERSHIP, ticket
 * drafted). Cloudflare terminates TLS for our hostnames and this Worker
 * reverse-proxies to the app's *.up.railway.app origin, because Railway's
 * edge only routes hostnames it has validated (ours return
 * x-railway-fallback). Remove the Worker + routes once Railway issues the
 * cert; the proxied CNAME alone is then enough.
 *
 * Deliberately dependency-free and self-contained: scripts/cloudflare-setup.ts
 * transpiles THIS FILE with the TypeScript compiler and uploads it as an ES
 * module. Do not add imports.
 */

export const APEX_HOST = "tensixtythree.com";
export const CANONICAL_HOST = "www.tensixtythree.com";
export const ORIGIN = "https://tensixtythree-app-production.up.railway.app";

export interface EdgeDeps {
  /** Injected for tests; the deployed Worker uses the global fetch. */
  fetchOrigin: (request: Request) => Promise<Response>;
}

function redirectToCanonical(url: URL): Response {
  const target = new URL(url.toString());
  target.protocol = "https:";
  target.host = CANONICAL_HOST;
  return new Response(null, {
    status: 301,
    headers: { location: target.toString(), "cache-control": "max-age=300" },
  });
}

function rewriteLocation(value: string | null): string | null {
  if (!value || !value.startsWith(ORIGIN)) return value;
  return `https://${CANONICAL_HOST}${value.slice(ORIGIN.length)}`;
}

export async function handleRequest(
  request: Request,
  deps: EdgeDeps,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.host !== CANONICAL_HOST) return redirectToCanonical(url);

  const originUrl = new URL(url.pathname + url.search, ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host"); // derived from originUrl by the runtime
  headers.set("x-forwarded-host", CANONICAL_HOST);
  headers.set("x-forwarded-proto", "https");

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const originRequest = new Request(originUrl.toString(), {
    method,
    headers,
    body: hasBody ? request.body : null,
    redirect: "manual",
    // Required by the runtime when streaming a request body through.
    ...(hasBody ? { duplex: "half" } : {}),
  } as RequestInit);

  let upstream: Response;
  try {
    upstream = await deps.fetchOrigin(originRequest);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return new Response(`Bad gateway: ${reason}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const responseHeaders = new Headers(upstream.headers);
  const location = rewriteLocation(upstream.headers.get("location"));
  if (location) responseHeaders.set("location", location);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

const worker = {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request, { fetchOrigin: (req) => fetch(req) });
  },
};

export default worker;
