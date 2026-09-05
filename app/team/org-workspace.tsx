"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 54.3 — the multi-org workspace. Renders the org switcher, shared
 * projects, and typed feed when the viewer has a session (/api/orgs
 * 200s); otherwise falls back to the legacy single-team server view
 * passed as children (local single-operator mode).
 */

interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface SharedProject {
  id: number;
  name: string;
  slug: string;
  status: string;
  health: string;
  progressScore: number;
  currentPhase: string;
}

interface Post {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
  project: { name: string; slug: string } | null;
}

const POST_TYPES = [
  { key: "goal", label: "Goal", color: "text-cyan" },
  { key: "objective", label: "Objective", color: "text-info" },
  { key: "bug", label: "Bug finding", color: "text-danger" },
  { key: "test-request", label: "Test hardening", color: "text-amber" },
  { key: "note", label: "Note", color: "text-text-dim" },
];

export function OrgWorkspace({ children }: { children: React.ReactNode }) {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [projects, setProjects] = useState<SharedProject[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [draft, setDraft] = useState({ type: "goal", title: "", body: "" });

  const refreshOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/orgs");
      if (!res.ok) {
        setSignedOut(true);
        return;
      }
      const data = await res.json();
      setOrgs(data.orgs);
      setActiveId(data.activeOrganizationId);
    } catch {
      // No fetchable API (SSR test render, network down) → legacy view.
      setSignedOut(true);
    }
  }, []);

  const refreshOrgData = useCallback(async () => {
    const [projectsRes, postsRes] = await Promise.all([
      fetch("/api/orgs/projects"),
      fetch("/api/orgs/posts"),
    ]);
    if (projectsRes.ok) setProjects((await projectsRes.json()).projects);
    if (postsRes.ok) setPosts((await postsRes.json()).posts);
  }, []);

  useEffect(() => {
    refreshOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) refreshOrgData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Local single-operator mode (or signed out): the legacy server view.
  if (signedOut) return <>{children}</>;
  if (orgs === null) return null;

  const active = orgs.find((o) => o.id === activeId) ?? null;

  return (
    <main id="tour-org" className="p-8 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider">
          Organizations
        </h1>
        {orgs.length > 0 && (
          <>
            <label htmlFor="org-switcher" className="sr-only">
              Active organization
            </label>
            <select
              id="org-switcher"
              value={activeId ?? ""}
              onChange={async (e) => {
                await fetch("/api/orgs/active", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ organizationId: e.target.value }),
                });
                setActiveId(e.target.value);
              }}
              className="bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text"
            >
              {activeId === null && <option value="">Pick an org…</option>}
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.role})
                </option>
              ))}
            </select>
          </>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await fetch("/api/orgs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: newOrgName }),
            });
            if (res.ok) {
              const { org } = await res.json();
              setNewOrgName("");
              await fetch("/api/orgs/active", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId: org.id }),
              });
              refreshOrgs();
            }
          }}
          className="flex gap-2 ml-auto"
        >
          <label htmlFor="new-org" className="sr-only">
            New organization name
          </label>
          <input
            id="new-org"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="New org name"
            className="bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text-bright"
          />
          <button
            type="submit"
            disabled={newOrgName.trim().length < 2}
            className="border border-cyan px-2 py-1.5 text-xs font-mono uppercase text-cyan disabled:opacity-50"
          >
            Create
          </button>
        </form>
      </div>

      {active && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await fetch("/api/orgs/invite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: inviteEmail }),
            });
            setInviteNote(
              res.ok
                ? `Invited ${inviteEmail} — they sign in with that email and membership applies automatically.`
                : "Couldn't send that invite.",
            );
            if (res.ok) setInviteEmail("");
          }}
          className="flex flex-wrap items-center gap-2 mb-6"
        >
          <label htmlFor="invite-email" className="text-xs font-mono text-text-dim">
            Invite member
          </label>
          <input
            id="invite-email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@company.com"
            className="bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text-bright"
          />
          <button
            type="submit"
            disabled={!inviteEmail.includes("@")}
            className="border border-cyan px-2 py-1.5 text-xs font-mono uppercase text-cyan disabled:opacity-50"
          >
            Invite
          </button>
          {inviteNote && (
            <span className="text-xs font-mono text-text-dim">{inviteNote}</span>
          )}
        </form>
      )}

      {orgs.length === 0 && (
        <p className="text-sm font-mono text-text-dim mb-6">
          You&apos;re independent — no organization yet. Create one to share
          projects, progress, and findings with a team.
        </p>
      )}

      {active && (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-3">
              Shared projects
            </h2>
            {projects.length === 0 ? (
              <p className="text-sm font-mono text-text-dim">
                Nothing shared yet — share a project from its detail page or the
                API.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.map((p) => (
                  <a
                    key={p.id}
                    href={`/projects/${p.slug}`}
                    className="p-3 border border-space-600 bg-space-800 hover:border-cyan"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono font-bold text-text-bright">
                        {p.name}
                      </span>
                      <span className="text-xs font-mono text-text-dim">
                        {p.health}
                      </span>
                    </div>
                    <div className="h-1.5 bg-space-900 rounded overflow-hidden mb-1">
                      <div
                        className="h-full bg-cyan"
                        style={{ width: `${p.progressScore}%` }}
                      />
                    </div>
                    <p className="text-xs font-mono text-text-dim">
                      {p.progressScore}% · {p.currentPhase}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-3">
              Feed
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await fetch("/api/orgs/posts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(draft),
                });
                if (res.ok) {
                  setDraft({ type: draft.type, title: "", body: "" });
                  refreshOrgData();
                }
              }}
              className="mb-4 p-3 border border-space-600 bg-space-800 space-y-2"
            >
              <div className="flex gap-2">
                <label htmlFor="post-type" className="sr-only">
                  Post type
                </label>
                <select
                  id="post-type"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                  className="bg-space-900 border border-space-600 px-2 py-1.5 text-xs font-mono text-text"
                >
                  {POST_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="post-title" className="sr-only">
                  Title
                </label>
                <input
                  id="post-title"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  placeholder="Title"
                  className="flex-1 bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text-bright"
                />
                <button
                  type="submit"
                  disabled={!draft.title.trim()}
                  className="border border-cyan px-3 py-1.5 text-xs font-mono uppercase text-cyan disabled:opacity-50"
                >
                  Post
                </button>
              </div>
              <label htmlFor="post-body" className="sr-only">
                Details
              </label>
              <textarea
                id="post-body"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Details (optional)"
                rows={2}
                className="w-full bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text-bright"
              />
            </form>

            {posts.length === 0 ? (
              <p className="text-sm font-mono text-text-dim">
                No posts yet. Goals, objectives, bug findings, and
                test-hardening requests land here.
              </p>
            ) : (
              <ul className="space-y-2">
                {posts.map((post) => {
                  const meta = POST_TYPES.find((t) => t.key === post.type);
                  return (
                    <li
                      key={post.id}
                      className="p-3 border border-space-600 bg-space-800"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-mono uppercase tracking-wider border border-current px-1.5 py-0.5 ${meta?.color ?? "text-text-dim"}`}
                        >
                          {meta?.label ?? post.type}
                        </span>
                        <span className="text-sm font-mono font-bold text-text-bright">
                          {post.title}
                        </span>
                        {post.project && (
                          <a
                            href={`/projects/${post.project.slug}`}
                            className="text-xs font-mono text-info"
                          >
                            {post.project.name}
                          </a>
                        )}
                        <span className="ml-auto text-xs font-mono text-text-dim">
                          {post.author.name} ·{" "}
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {post.body && (
                        <p className="text-xs font-mono text-text whitespace-pre-wrap">
                          {post.body}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
