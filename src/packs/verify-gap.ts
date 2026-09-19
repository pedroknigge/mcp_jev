import type { PackDefinition } from "./types.js";

export const verifyGapPack: PackDefinition = {
  id: "verify_gap",
  version: "1.0.0",
  title: "Verify gap",
  summary:
    "Atomic judgment: does a claimed behavior/change have adequate verification? Nouls has_adequate_verification / claim_is_testable / evidence_matches_claim, Score verification_gap (0 none → 3 ship-blocker), Choice next_proof.",
  when_to_use:
    "When someone asserts a change works and you need a typed gap check before shipping. Prefer this over treating `review_diff.test_gap` or `code_audit.missing_verification` as a ship gate. Do not use Jev to write the test or compute `code_gate`.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["claim"],
    properties: {
      claim: {
        type: "string",
        description: "What someone asserts works.",
        minLength: 1,
      },
      evidence: {
        type: "array",
        description: "Optional test names, CI jobs, or manual checks already known.",
        items: { type: "string" },
      },
      diff_summary: {
        type: "string",
        description: "Optional short summary of the diff. Do not paste a huge raw patch.",
      },
      change_summary: {
        type: "string",
        description: "Optional short summary of the change when you do not have a diff.",
      },
      signals: {
        type: "object",
        description: "Optional caller-computed heuristics. Extra evidence, not the decision.",
        additionalProperties: false,
        properties: {
          has_tests_nearby: {
            type: "boolean",
            description: "Caller already thinks tests live next to the change.",
          },
          touches_money: {
            type: "boolean",
            description: "Caller already thinks billing, prices, payouts, or ledgers are in play.",
          },
          touches_auth: {
            type: "boolean",
            description: "Caller already thinks authn/authz is in play.",
          },
          is_generated: {
            type: "boolean",
            description: "Caller already thinks the change is generated or vendor output.",
          },
        },
      },
    },
  },
  example_state: {
    claim: "Reserved catalog ids fail closed before TypeSafe is called.",
    evidence: [
      "review_diff rejects reserved file catalog entries before TypeSafe",
      "npm test",
    ],
    change_summary: "Adds reserved-id checks on files[] and a unit test. No auth or money change.",
    signals: {
      has_tests_nearby: true,
      touches_money: false,
      touches_auth: false,
      is_generated: false,
    },
  },
  questions: [
    {
      type: "noul",
      id: "has_adequate_verification",
      instructions:
        "Given `claim`, `evidence`, `diff_summary` / `change_summary`, and `signals`, is verification adequate for the asserted behavior?",
      criteria: {
        true: "Matching tests, CI, or checks cover the claim well enough to ship.",
        false: "The claim is not backed by adequate verification.",
      },
    },
    {
      type: "noul",
      id: "claim_is_testable",
      instructions:
        "Is `claim` specific enough to test (observable behavior, error, or output), given `diff_summary` / `change_summary`?",
      criteria: {
        true: "The claim can be proved or disproved with a test or check.",
        false: "The claim is vague, aesthetic, or not an observable behavior.",
      },
    },
    {
      type: "noul",
      id: "evidence_matches_claim",
      instructions:
        "Does `evidence` actually exercise `claim` (same behavior, not a nearby or unrelated check)? Use `signals.has_tests_nearby` as extra evidence, not the decision.",
      criteria: {
        true: "Named tests, CI jobs, or checks address the same claim.",
        false: "Evidence is missing, nearby-only, or about a different behavior.",
      },
    },
    {
      type: "score",
      id: "verification_gap",
      instructions:
        "How large is the verification gap for `claim` given `evidence`, `diff_summary` / `change_summary`, and `signals`? 0 is none; 3 is a ship-blocker.",
      criteria: [
        "None: the claim is covered by matching tests or checks.",
        "Small: a minor path or locale is untested.",
        "Material: core behavior lacks matching proof.",
        "Ship-blocker: money, auth, or behavior change with no adequate verification.",
      ],
    },
    {
      type: "choice",
      id: "next_proof",
      instructions:
        "What is the smallest next proof that would close the gap for `claim`? Pick one closed option. Do not invent a seventh.",
      criteria: {
        unit_test: "A focused unit test of the claimed behavior is the next proof.",
        integration: "A cross-module or API/integration check is the next proof.",
        manual_check: "A short human or harness check is the next proof (hard to automate now).",
        type_proof: "A type, schema, or compile-time proof is enough.",
        none_needed: "Existing evidence is enough; no further proof this turn.",
        unclear: "Not enough state to pick a proof kind.",
      },
    },
  ],
  suggested_workflow: [
    "Put the asserted behavior in `claim`. Add known test names / CI jobs in `evidence`. Add a short `diff_summary` or `change_summary` if you have one.",
    "Optionally set `signals` from path heuristics (tests nearby, money, auth, generated) before the call.",
    "list_packs / describe_pack once if unfamiliar, then run_pack verify_gap.",
    "Read the three Nouls first, then verification_gap.score, then next_proof.choice.",
    "Compute code_gate in the caller (`verifyGapCodeGate` in src/policy-examples.ts). Jev does not write the test or return code_gate.",
  ],
  notes: [
    "code_gate is computed by the caller, not Jev. Example: block if verification_gap.score ≥ 2.5, or claim_is_testable.noul ≥ 0.65 with has_adequate_verification.noul < 0.35; add_proof if verification_gap.score ≥ 1.5 or evidence_matches_claim.noul < 0.45; else ship. Tune on your traces.",
    "Distinct from review_diff.test_gap (diff-wide) and code_audit.missing_verification (per-file). This pack judges one claim against named evidence.",
    "signals are extra evidence, not the decision. Generated or docs-only claims can still be none_needed.",
    "Noul answers have no separate confidence field — the probability is the belief.",
  ],
};
