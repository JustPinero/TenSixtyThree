/**
 * 77 — jump links for the long settings page. Each target id must exist
 * on the page (app/settings/settings-nav.test.tsx checks the source).
 */
export const SETTINGS_SECTIONS = [
  { id: "settings-assistant", label: "Assistant" },
  { id: "settings-themes", label: "Theme packs" },
  { id: "settings-account", label: "Account" },
  { id: "settings-notifications", label: "Notifications" },
  { id: "settings-advanced", label: "Advanced" },
  { id: "settings-about", label: "About" },
] as const;

export function SettingsNav() {
  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-0 z-10 -mx-1 mb-8 flex flex-wrap gap-1 bg-space-900/95 px-1 py-2 border-b border-space-600"
    >
      {SETTINGS_SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="inline-flex min-h-6 items-center px-2 py-1 text-xs font-mono uppercase tracking-wider text-text-dim hover:text-cyan border border-transparent hover:border-space-600 focus-ring"
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
