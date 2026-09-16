/**
 * Idempotent Cloudflare zone bring-up for tensixtythree.com.
 * Pure planning logic is tested here; the API client is a thin wrapper in
 * scripts/cloudflare-setup.ts.
 */
import { describe, expect, it } from "vitest";
import {
  type DnsRecord,
  desiredRecords,
  normalizeTxt,
  planRecordChanges,
  recordKey,
  transpileWorker,
} from "./setup";

describe("desiredRecords", () => {
  const recs = desiredRecords();
  const byKey = new Map(recs.map((r) => [recordKey(r), r]));

  it("proxies www + apex to the Railway app (orange cloud)", () => {
    const www = byKey.get("CNAME www.tensixtythree.com");
    const apex = byKey.get("CNAME tensixtythree.com");
    expect(www?.content).toBe("tensixtythree-app-production.up.railway.app");
    expect(www?.proxied).toBe(true);
    expect(apex?.content).toBe("tensixtythree-app-production.up.railway.app");
    expect(apex?.proxied).toBe(true);
  });

  it("keeps Resend mail records DNS-only (grey cloud)", () => {
    const mx = byKey.get("MX send.mail.tensixtythree.com");
    expect(mx?.content).toBe("feedback-smtp.us-east-1.amazonses.com");
    expect(mx?.priority).toBe(10);
    expect(mx?.proxied).toBe(false);
    const spf = byKey.get("TXT send.mail.tensixtythree.com");
    expect(spf?.content).toBe("v=spf1 include:amazonses.com ~all");
    const dkim = byKey.get("TXT resend._domainkey.mail.tensixtythree.com");
    expect(dkim?.content.startsWith("p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXMB39")).toBe(true);
    const dmarc = byKey.get("TXT _dmarc.tensixtythree.com");
    expect(dmarc?.content).toContain("v=DMARC1; p=quarantine");
  });

  it("carries the GoDaddy pay + domainconnect CNAMEs and the app diagnostic, DNS-only", () => {
    expect(byKey.get("CNAME pay.tensixtythree.com")).toMatchObject({
      content: "paylinks.commerce.godaddy.com",
      proxied: false,
    });
    expect(byKey.get("CNAME _domainconnect.tensixtythree.com")).toMatchObject({
      content: "_domainconnect.gd.domaincontrol.com",
      proxied: false,
    });
    expect(byKey.get("CNAME app.tensixtythree.com")).toMatchObject({
      content: "571meb3y.up.railway.app",
      proxied: false,
    });
  });

  it("does not carry the old GoDaddy apex A records (Cloudflare owns apex now)", () => {
    const types = new Set<string>(recs.map((r) => r.type));
    expect(types.has("A")).toBe(false);
    expect(types.has("NS")).toBe(false);
  });

  it("has no duplicate keys (the GoDaddy export listed pay twice)", () => {
    expect(byKey.size).toBe(recs.length);
  });
});

describe("normalizeTxt", () => {
  it("strips the surrounding quotes Cloudflare returns on TXT content", () => {
    expect(normalizeTxt('"v=spf1 include:amazonses.com ~all"')).toBe(
      "v=spf1 include:amazonses.com ~all",
    );
    expect(normalizeTxt("v=spf1 ~all")).toBe("v=spf1 ~all");
  });
});

describe("planRecordChanges", () => {
  const desired: DnsRecord[] = [
    { type: "CNAME", name: "www.tensixtythree.com", content: "x.up.railway.app", proxied: true, ttl: 1 },
    { type: "TXT", name: "_dmarc.tensixtythree.com", content: "v=DMARC1; p=quarantine", proxied: false, ttl: 1 },
  ];

  it("creates everything on an empty zone", () => {
    const plan = planRecordChanges([], desired);
    expect(plan.create).toHaveLength(2);
    expect(plan.update).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(0);
  });

  it("is a no-op when the zone already matches (TXT quoting ignored)", () => {
    const existing = [
      { id: "1", type: "CNAME", name: "www.tensixtythree.com", content: "x.up.railway.app", proxied: true, ttl: 1 },
      { id: "2", type: "TXT", name: "_dmarc.tensixtythree.com", content: '"v=DMARC1; p=quarantine"', proxied: false, ttl: 1 },
    ];
    const plan = planRecordChanges(existing, desired);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(2);
  });

  it("updates in place when content or proxied differs", () => {
    const existing = [
      { id: "1", type: "CNAME", name: "www.tensixtythree.com", content: "old.up.railway.app", proxied: false, ttl: 1 },
    ];
    const plan = planRecordChanges(existing, desired);
    expect(plan.update).toEqual([{ id: "1", record: desired[0] }]);
    expect(plan.create).toEqual([desired[1]]);
  });

  it("never deletes records it does not know about", () => {
    const existing = [
      { id: "9", type: "TXT", name: "tensixtythree.com", content: "google-site-verification=abc", proxied: false, ttl: 1 },
    ];
    const plan = planRecordChanges(existing, desired);
    expect(plan).not.toHaveProperty("delete");
    expect(plan.create).toHaveLength(2);
  });
});

describe("transpileWorker", () => {
  it("emits an ES module with a default export and no TypeScript syntax", () => {
    const js = transpileWorker();
    expect(js).toContain("export default");
    expect(js).not.toMatch(/:\s*(Request|Response|string)\b\s*[,)=]/);
    expect(js).not.toContain("import ");
  });
});
