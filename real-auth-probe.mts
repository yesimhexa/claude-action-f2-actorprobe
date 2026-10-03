// Runs ON the real GitHub Actions runner, inside a checkout of
// anthropics/claude-code-action at the audited HEAD. Imports the real,
// unmodified checkWritePermissions/checkHumanActor — zero reimplementation.
// Feeds them the REAL captured actor values and a REAL Octokit client
// hitting the REAL GitHub REST API via this job's own token.
import { checkWritePermissions } from "./src/github/validation/permissions";
import { checkHumanActor } from "./src/github/validation/actor";
import { createMockAutomationContext } from "./test/mockContext";
import { readFileSync } from "fs";
import { Octokit } from "@octokit/rest";

const dump = JSON.parse(readFileSync("wr-dump.json", "utf-8"));
const raw = JSON.parse(readFileSync("wr-raw.json", "utf-8"));

const contextActor: string = dump.context_actor || dump.github_actor_env;
const allowedBots = process.env.TEST_ALLOWED_BOTS || "";

const context = createMockAutomationContext({
  eventName: "workflow_run",
  eventAction: dump.action,
  actor: contextActor,
  payload: { action: dump.action, workflow_run: raw } as any,
  inputs: { allowedBots },
});

async function main() {
  console.log("\n================ REAL INPUT VALUES ================");
  console.log("context.actor                 =", contextActor);
  console.log("workflow_run.actor.login       =", raw.actor?.login ?? null);
  console.log("workflow_run.triggering_actor  =", raw.triggering_actor?.login ?? null);
  console.log("allowed_bots (test override)   =", JSON.stringify(allowedBots));
  console.log(
    "DIVERGENCE (payload actor != context.actor) =",
    raw.actor?.login !== contextActor,
  );

  const octokit = new Octokit({ auth: process.env.GH_TOKEN });

  console.log("\n================ checkWritePermissions() — REAL API ================");
  let wp: boolean | undefined;
  let wpThrew: string | undefined;
  try {
    wp = await checkWritePermissions(octokit as any, context);
  } catch (e) {
    wpThrew = e instanceof Error ? e.message : String(e);
  }
  console.log("RESULT:", wpThrew ? `THREW: ${wpThrew}` : wp);

  console.log("\n================ checkHumanActor() — REAL API ================");
  if (!wp) {
    console.log("NOT REACHED — checkWritePermissions already denied (matches real run.ts ordering).");
  } else {
    try {
      await checkHumanActor(octokit as any, context);
      console.log("RESULT: passed (no throw)");
    } catch (e: any) {
      console.log("RESULT: THREW:", e.message);
    }
  }

  console.log("\n================ SUMMARY ================");
  console.log(
    JSON.stringify(
      {
        contextActor,
        payloadActor: raw.actor?.login ?? null,
        divergence: raw.actor?.login !== contextActor,
        checkWritePermissions: wpThrew ? `threw: ${wpThrew}` : wp,
        wouldClaudeProceedPastAuthGates: !!wp && !wpThrew,
      },
      null,
      2,
    ),
  );
}

main();
