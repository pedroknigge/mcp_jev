/**
 * Example caller-owned gates. Copy these into the harness and tune on your traces.
 * Unit-test them without a TypeSafe key — Jev only returns the signals.
 */

export type CommandRiskSignals = {
  is_destructive: number;
  touches_credentials: number;
  scope_matches: number;
  severity: number;
};

export type SkillRouterSignals = {
  needs_skill: number;
  skill: string | null;
  change_risk: number;
};

export function commandRiskGate(signals: CommandRiskSignals): "allow" | "refuse" {
  if (signals.is_destructive >= 0.7) return "refuse";
  if (signals.touches_credentials >= 0.6) return "refuse";
  if (signals.scope_matches < 0.5) return "refuse";
  if (signals.severity >= 2.5) return "refuse";
  return "allow";
}

export function skillRouterGate(signals: SkillRouterSignals): "load" | "skip" | "ask" {
  if (!signals.skill || signals.skill === "none") return "skip";
  if (signals.needs_skill < 0.65) return "skip";
  if (signals.change_risk >= 2.5) return "ask";
  return "load";
}
