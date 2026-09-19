export type JsonSchema = {
  $schema?: string;
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
};

export type ChoiceQuestionDef = {
  type: "choice";
  id: string;
  instructions: string;
  criteria: Record<string, string | null>;
};

export type NoulQuestionDef = {
  type: "noul";
  id: string;
  instructions: string;
  criteria?: {
    true?: string;
    false?: string;
  };
};

export type ScoreQuestionDef = {
  type: "score";
  id: string;
  instructions: string;
  criteria: string[];
};

export type PackQuestion = ChoiceQuestionDef | NoulQuestionDef | ScoreQuestionDef;

export type PackDefinition = {
  id: string;
  version: string;
  title: string;
  summary: string;
  when_to_use: string;
  state_schema: JsonSchema;
  example_state: Record<string, unknown>;
  questions: PackQuestion[];
  /**
   * Optional. When set, `run_pack` builds questions from the validated state
   * (e.g. Choice options from `items[].id`). `describe_pack` still returns
   * the static `questions` template.
   */
  questionsForState?: (state: Record<string, unknown>) => PackQuestion[];
  /** Extra contract checks after JSON Schema (e.g. no screenshots). */
  enforceState?: (state: Record<string, unknown>) => void;
  /** Additive fields on run_pack (e.g. computer_use_step `guidance`). */
  decorateRunResult?: (input: {
    state: unknown;
    answers: Record<string, unknown>;
  }) => Record<string, unknown>;
  suggested_workflow: string[];
  notes: string[];
};

export type PackSummary = Pick<PackDefinition, "id" | "title" | "summary" | "when_to_use"> & {
  version: string;
};
