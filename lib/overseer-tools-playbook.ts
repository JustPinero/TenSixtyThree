import type { Tool } from "@/lib/overseer-tools";
import fs from "fs/promises";
import path from "path";
import { scopeOf } from "@/lib/tenant-scope";

interface PlaybookInput {
  bullets?: boolean;
}

interface PlaybookOutput {
  found: boolean;
  content: string;
}

export const playbookTool: Tool<PlaybookInput, PlaybookOutput> = {
  name: "get_playbook",
  description:
    "Get the developer's preferences and playbook rules for the Overseer (knowledge/overseer-playbook.md). Use this when you need to remember how the developer wants you to operate (rules they've ratified across sessions). The 'bullets' flag returns just the list lines; default returns the full document.",
  inputSchema: {
    type: "object",
    properties: {
      bullets: {
        type: "boolean",
        description: "Return only lines that start with '- ' (skips title + headers).",
      },
    },
  },
  handler: async (input, ctx) => {
    // Phase 66.1 — the operator's playbook is not other users' business.
    if (!scopeOf(ctx).isOperator) return { found: false, content: "" };
    const playbookPath = path.resolve(
      process.cwd(),
      "knowledge",
      "overseer-playbook.md"
    );
    try {
      const content = await fs.readFile(playbookPath, "utf-8");
      if (input.bullets) {
        const lines = content.split("\n").filter((l) => l.startsWith("- "));
        return { found: true, content: lines.join("\n") };
      }
      return { found: true, content };
    } catch {
      return { found: false, content: "" };
    }
  },
};
