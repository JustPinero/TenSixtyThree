/**
 * Phase 58.4 — fail a hosted boot/validate when hosted-required env is
 * missing (scripts/validate-env.sh calls this when RAILWAY_ENVIRONMENT is
 * set). Prints names only, never values.
 */
import { validateHostedEnv } from "../lib/env-manifest";

const result = validateHostedEnv(process.env);
for (const w of result.warnings) console.warn(`WARNING: ${w}`);
if (result.missing.length > 0) {
  console.error(`Missing hosted-required env: ${result.missing.join(", ")}`);
  process.exit(1);
}
console.log("Hosted environment OK");
