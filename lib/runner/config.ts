/**
 * Phase 65.5 — runner limits fail loudly. `Number("abc")` is NaN, and a
 * NaN budget used to drop the spend cap entirely (R19).
 */
export interface RunnerConfig {
  maxTurns: number;
  maxBudgetUsd: number;
  pollMs: number;
  /** 67.2 — wall-clock limit per job (ms). */
  maxWallMs: number;
}

function positiveNumber(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number (got "${raw}")`);
  }
  return value;
}

export function parseRunnerConfig(
  env: Record<string, string | undefined> = process.env,
): RunnerConfig {
  return {
    maxTurns: Math.floor(positiveNumber(env, "RUNNER_MAX_TURNS", 40)),
    maxBudgetUsd: positiveNumber(env, "RUNNER_MAX_BUDGET_USD", 5),
    pollMs: positiveNumber(env, "RUNNER_POLL_MS", 5000),
    maxWallMs: positiveNumber(env, "RUNNER_MAX_WALL_MINUTES", 45) * 60_000,
  };
}
