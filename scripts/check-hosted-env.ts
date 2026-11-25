/**
 * Phase 58.4 — fail a hosted boot/validate when hosted-required env is
 * missing (scripts/validate-env.sh calls this when RAILWAY_ENVIRONMENT is
 * set). Prints names only, never values.
 *
 * [1.0.D16] RUNNER_MODE=1 is the cloud runner service: it never reads the
 * web app's auth/OAuth vars, so it is checked against its own list.
 */
import { validateHostedEnv, validateRunnerEnv } from "../lib/env-manifest";

if (process.env.RUNNER_MODE === "1") {
  const runner = validateRunnerEnv(process.env);
  if (!runner.ok) {
    console.error(`Missing runner-required env: ${runner.missing.join(", ")}`);
    process.exit(1);
  }
  console.log("Runner environment OK");
} else {
  const result = validateHostedEnv(process.env);
  for (const w of result.warnings) console.warn(`WARNING: ${w}`);
  if (result.missing.length > 0) {
    console.error(`Missing hosted-required env: ${result.missing.join(", ")}`);
    process.exit(1);
  }
  console.log("Hosted environment OK");
}
