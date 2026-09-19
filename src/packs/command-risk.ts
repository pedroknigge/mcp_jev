import type { PackDefinition } from "./types.js";

export const commandRiskPack: PackDefinition = {
  id: "command_risk",
  version: "1.0.0",
  title: "Command risk",
  summary:
    "Typed risk signals for a proposed shell command: Nouls is_destructive / touches_credentials / scope_matches, Score severity. The MCP returns signals only — harness allowlist and sandbox still required.",
  when_to_use:
    "Before running a shell command the agent constructed, when you want calibrated risk signals. Do not use Jev as the allowlist. Do not use this pack to execute anything.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["command"],
    properties: {
      command: {
        type: "string",
        description: "The exact command string the harness is about to run.",
        minLength: 1,
      },
      cwd: {
        type: "string",
        description: "Optional working directory (path only, no secrets).",
      },
      reason: {
        type: "string",
        description: "Optional why the agent wants to run it.",
      },
      allowed_roots: {
        type: "array",
        description: "Optional closed list of directories the harness considers in-scope.",
        items: { type: "string" },
      },
    },
  },
  example_state: {
    command: "npm test",
    cwd: "/Users/YOU/mcp_jev",
    reason: "Run the mocked unit suite.",
    allowed_roots: ["/Users/YOU/mcp_jev"],
  },
  questions: [
    {
      type: "noul",
      id: "is_destructive",
      instructions:
        "Would running `command` in `cwd` delete, overwrite, or otherwise destroy data (rm, drop, format, force-push, truncate)?",
      criteria: {
        true: "The command is destructive or hard to undo.",
        false: "The command is read-only or a reversible local action.",
      },
    },
    {
      type: "noul",
      id: "touches_credentials",
      instructions:
        "Would running `command` read, print, or exfiltrate credentials, keys, or tokens?",
      criteria: {
        true: "Secrets or credential files are in play.",
        false: "No credential access is indicated.",
      },
    },
    {
      type: "noul",
      id: "scope_matches",
      instructions:
        "Does `command` stay inside `allowed_roots` / `cwd` as described? Paths outside the closed roots fail this.",
      criteria: {
        true: "The command stays in the stated scope.",
        false: "The command leaves the stated scope, or scope is unknown.",
      },
    },
    {
      type: "score",
      id: "severity",
      instructions: "Overall risk of running this command as stated.",
      criteria: [
        "Safe read-only.",
        "Local reversible write or test.",
        "Wide blast radius; needs a careful review.",
        "Dangerous: destroy, secrets, or production.",
      ],
    },
  ],
  suggested_workflow: [
    "Put the exact command string in `command`. Add cwd, reason, and allowed_roots if you have them.",
    "run_pack command_risk.",
    "Compose the gate in caller code. Example: refuse if is_destructive.noul ≥ 0.70, or touches_credentials.noul ≥ 0.60, or scope_matches.noul < 0.50, or severity.score ≥ 2.5.",
    "Even when all Nouls are low, still apply your allowlist and sandbox. Jev is not the policy engine.",
  ],
  notes: [
    "Signals only. A harness allowlist / sandbox is still required. Never treat a low severity as permission to skip your own checks.",
    "Example thresholds are caller-owned and should be unit-tested without a live TypeSafe key (assert your gate function, not Jev).",
    "Do not send env files or key values in state. Paths and command argv only.",
  ],
};
