/**
 * Phase 67.3 — one canonical form for Project.githubRepo: `owner/repo`.
 *
 * The launcher stored full URLs, ops stored bare slugs, and the runner's
 * clone URL builder assumed the bare form. Normalize at write time;
 * anything that isn't recognisably a GitHub repo becomes null.
 */
const NAME = /^[A-Za-z0-9_.-]+$/;

export function normalizeGithubRepo(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  const ssh = s.match(/^git@github\.com:(.+)$/i);
  if (ssh) s = ssh[1];
  else {
    s = s.replace(/^https?:\/\//i, "");
    const host = s.match(/^(?:www\.)?github\.com\/(.+)$/i);
    if (host) s = host[1];
    else if (/^[^/]+\.[a-z]{2,}\//i.test(s)) return null; // another host
  }

  const [owner, repoRaw] = s.split("/");
  if (!owner || !repoRaw) return null;
  const repo = repoRaw.replace(/\.git$/i, "");
  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  return `${owner}/${repo}`;
}
