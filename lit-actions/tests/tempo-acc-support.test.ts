#!/usr/bin/env bun
/**
 * Probe: Is Tempo chain ACC directly supported by the current Lit SDK?
 *
 * Why this exists:
 * - We want a no-Lit-Action path that gates decrypt by Tempo on-chain access.
 * - Today, Lit ACC validation does not accept `tempoModerato` as an ACC chain.
 * - This probe keeps that assumption explicit and gives us a canary when support lands.
 *
 * Behavior:
 * - Default: expects Tempo ACC validation to fail.
 * - If EXPECT_TEMPO_ACC_SUPPORT=1: expects Tempo ACC validation to succeed.
 */

import { validateAccessControlConditions } from "@lit-protocol/access-control-conditions";
import { Env } from "./shared/env";

function buildTempoAccProbe() {
  // Structure mirrors the common evmBasic pattern used by Lit ACCs.
  return [
    [
      {
        conditionType: "evmBasic" as const,
        contractAddress: "" as const,
        standardContractType: "" as const,
        chain: "tempoModerato",
        method: "" as const,
        parameters: [":userAddress"],
        returnValueTest: {
          comparator: "=",
          value: "0x0000000000000000000000000000000000000000",
        },
      },
    ],
  ];
}

async function main() {
  const expectSupport = process.env.EXPECT_TEMPO_ACC_SUPPORT === "1";

  console.log("Tempo ACC Support Probe");
  console.log("=".repeat(52));
  console.log(`   Lit Env: ${Env.name}`);
  console.log(`   Expect supported: ${expectSupport ? "yes" : "no (default)"}`);

  const acc = buildTempoAccProbe();

  try {
    await validateAccessControlConditions({ unifiedAccessControlConditions: acc as any });

    if (!expectSupport) {
      throw new Error(
        "Tempo ACC unexpectedly succeeded. Update direct Tempo decrypt path and this probe."
      );
    }

    console.log("   ✓ Tempo ACC accepted by validator");
    console.log("PASS");
    return;
  } catch (err: any) {
    const msg = err?.message || err?.shortMessage || String(err);
    const displayMsg = err?.shortMessage || msg;
    const causeMsg = err?.cause?.message || "";
    const fullMsg = `${msg}\n${causeMsg}`.trim();

    if (expectSupport) {
      throw new Error(`Tempo ACC expected to be supported, but failed: ${fullMsg}`);
    }

    if (
      !fullMsg.includes("tempoModerato") &&
      !fullMsg.includes("validateAccessControlConditions")
    ) {
      throw new Error(
        `Unexpected error (expected tempo chain validation failure): ${fullMsg}`
      );
    }

    console.log("   ✓ Tempo ACC currently rejected (expected)");
    console.log(`   ↳ ${displayMsg.split("\n")[0]}`);
    console.log("PASS");
    return;
  }
}

main().catch((err: any) => {
  console.error("FAIL");
  console.error(err?.message || err);
  process.exit(1);
});
