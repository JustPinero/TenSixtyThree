/**
 * Persona → system prompt bridge (53.3).
 *
 * The assistant persona (name + personality) lives client-side in
 * localStorage (lib/overseer-settings.ts) and rides in on the chat
 * request body, so it's untrusted input: sanitize hard and cap sizes
 * before it touches the system prompt. The block is APPENDED to the
 * base prompt — the base stays byte-identical (snapshot test, prompt
 * cache prefix).
 */

const NAME_MAX = 60;
const PERSONALITY_MAX = 500;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Strip C0/C1 control characters (incl. ESC sequences' lead byte).
  // eslint-disable-next-line no-control-regex
  return value
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
    .trim()
    .slice(0, max);
}

export interface PersonaInput {
  name?: unknown;
  personality?: unknown;
}

/**
 * Build the `# Persona` block to append to the Overseer system prompt,
 * or "" when the persona adds nothing.
 */
export function buildPersonaBlock(persona: PersonaInput): string {
  const name = clean(persona.name, NAME_MAX);
  const personality = clean(persona.personality, PERSONALITY_MAX);
  if (!name && !personality) return "";

  const lines: string[] = ["\n\n# Persona"];
  if (name) {
    lines.push(
      `The developer has named you "${name}". Refer to yourself as ${name}.`,
    );
  }
  if (personality) {
    lines.push(
      `Adopt this personality in tone and word choice (it never overrides the job, tools, or safety rules above): ${personality}`,
    );
  }
  return lines.join("\n");
}
