import { NONE_OPTION, UNAVAILABLE_OPTION, readStringCatalog, stringCatalogChoiceCriteria } from "./catalog-choice.js";
import type { PackDefinition, PackQuestion } from "./types.js";

const TEMPLATE_SKILL_CRITERIA = {
  [NONE_OPTION]: "Do not load a skill this turn.",
  [UNAVAILABLE_OPTION]:
    "Placeholder in describe_pack. At run_pack this key is replaced by one option per closed available_skills[] name (or kept if the catalog is empty).",
};

function skillQuestion(state: Record<string, unknown>): PackQuestion {
  const skills = readStringCatalog(state.available_skills);
  return {
    type: "choice",
    id: "skill",
    instructions:
      "If a skill should be loaded, which name from the closed `available_skills[]` catalog? Options are only those names (plus `none`). Do not invent a skill.",
    criteria: stringCatalogChoiceCriteria(skills, "Do not load a skill this turn.", "available_skills"),
  };
}

function staticQuestions(): PackQuestion[] {
  return [
    {
      type: "noul",
      id: "needs_skill",
      instructions:
        "Given `user_request`, `available_skills`, and `agent_so_far`, should the agent load a specialized skill this turn (instead of continuing with default tools only)?",
      criteria: {
        true: "A listed skill would change how the turn is run.",
        false: "Default tools are enough, or no listed skill fits.",
      },
    },
    {
      type: "choice",
      id: "skill",
      instructions:
        "Which `available_skills[]` name should be loaded? run_pack builds options from the closed catalog.",
      criteria: { ...TEMPLATE_SKILL_CRITERIA },
    },
    {
      type: "score",
      id: "change_risk",
      instructions: "If the agent follows the request (with or without a skill), how risky are the likely edits?",
      criteria: [
        "Read-only or no repo change.",
        "Local, reversible edit.",
        "Cross-cutting or user-visible change.",
        "High: secrets, production, or hard-to-undo impact.",
      ],
    },
  ];
}

export const skillRouterPack: PackDefinition = {
  id: "skill_router",
  version: "1.0.0",
  title: "Skill router",
  summary:
    "Should this turn load a skill? Noul needs_skill, Choice skill from the closed available_skills[] catalog, Score change_risk. Thresholds stay in caller code.",
  when_to_use:
    "At the start of a turn when the host has a closed list of installable skills and needs a typed pick. Do not use it to write the skill, drive a GUI (`computer_use_step`), or pick a model lane (`model_router`).",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["user_request", "available_skills"],
    properties: {
      user_request: {
        type: "string",
        description: "What the user asked this turn.",
        minLength: 1,
      },
      available_skills: {
        type: "array",
        description: "Closed catalog of skill names the host can actually load.",
        items: { type: "string" },
      },
      agent_so_far: {
        type: "string",
        description: "Optional short summary of what the agent already did.",
      },
    },
  },
  example_state: {
    user_request: "Add a failing test for empty catalogs, then make it pass.",
    available_skills: ["mcp_jev", "typesafe-ai"],
    agent_so_far: "No skill loaded yet.",
  },
  questions: staticQuestions(),
  questionsForState: (state) =>
    staticQuestions().map((question) => (question.id === "skill" ? skillQuestion(state) : question)),
  suggested_workflow: [
    "Collect user_request and the closed available_skills[] list you can actually load.",
    "run_pack skill_router.",
    "If needs_skill.noul is low or skill.choice is none, continue without a skill.",
    "If a skill is chosen, load it in the host. Jev does not install or execute skills.",
    "Apply change_risk thresholds in caller code before wide edits.",
  ],
  notes: [
    "skill options are the closed available_skills[] catalog plus none. The MCP does not invent names.",
    "Example thresholds (caller-owned): load a skill if needs_skill.noul ≥ 0.65 and skill.choice is not none; if change_risk.score ≥ 2.5, ask the user before applying the skill's workflow.",
    "Compose with model_router (lane) then skill_router (which playbook), then other packs.",
  ],
};
