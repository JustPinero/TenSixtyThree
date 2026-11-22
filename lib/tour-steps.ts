/**
 * 54.6 — the persona-guided demo tour script.
 *
 * Each step anchors the persona's chat bubble to a real element
 * (selector) on a real page (route). `anchorFile` names the source file
 * carrying the id — the drift-guard test verifies it still exists, so a
 * refactor can't silently orphan a tour step. `text` is written to be
 * spoken in-character by whichever assistant the visitor picked.
 */

export interface TourStep {
  id: string;
  route: "/" | "/team" | "/boards" | "/roadmap" | "/settings";
  selector: string;
  anchorFile: string;
  /**
   * 71.2 — fallback when `selector` is off-canvas (e.g. inside the closed
   * mobile nav drawer below `lg`). Lives in the same anchorFile.
   */
  mobileSelector?: string;
  title: string;
  text: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "fleet",
    route: "/",
    selector: "#tour-fleet",
    anchorFile: "app/dashboard-client.tsx", // 60.2 — the island owns the markup
    title: "Your fleet",
    text: "This is the fleet dashboard — every project's health, progress, and activity in one sweep. I watch all of it so you don't have to.",
  },
  {
    id: "overseer",
    route: "/",
    selector: "#tour-overseer-link",
    anchorFile: "app/components/sidebar.tsx",
    mobileSelector: "#tour-nav-toggle",
    title: "The Overseer",
    text: "That's me. Open this chat and I'll plan sprints, read session logs, and propose dispatches. In the demo my replies are scripted — the real me runs on Claude with full tool use.",
  },
  {
    id: "team",
    route: "/team",
    selector: "#tour-org",
    anchorFile: "app/team/org-workspace.tsx",
    title: "Organizations",
    text: "Teams live here: share projects and progress, and post goals, objectives, bug findings, and test-hardening requests to one feed everyone sees.",
  },
  {
    id: "boards",
    route: "/boards",
    selector: "#tour-board",
    anchorFile: "app/boards/page.tsx",
    title: "Kanban boards",
    text: "Tickets, columns, drag-and-drop. Personal boards for your own work, org boards for shared tickets — and Linear import if your team already lives there.",
  },
  {
    id: "milestones",
    route: "/roadmap",
    selector: "#tour-milestones",
    anchorFile: "app/components/milestones-panel.tsx",
    title: "Roadmap & milestones",
    text: "Define where it's all going — milestones advance from planned to in-progress to shipped, right on top of the fleet's live progress bars.",
  },
  {
    id: "themes",
    route: "/settings",
    selector: "#tour-themes",
    anchorFile: "app/settings/page.tsx",
    title: "Theme packs",
    text: "Twelve looks, each with its own assistant — that's how you met me. Switching packs restyles everything and hands you a new guide with its own voice.",
  },
];
