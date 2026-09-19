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

export type CodeAuditSignals = {
  wrong_layer: number;
  blast_radius: number;
  missing_verification: number;
  secret_or_credential_risk: number;
  inefficiency: number;
  dead_or_premature_abstraction: number;
  problem_severity: number;
};

export type I18nCopySignals = {
  has_user_facing_hardcoded_copy: number;
  should_migrate_to_i18n: number;
  already_partially_internationalized: number;
  i18n_debt: number;
};

/** Caller-owned gate for a multi-locale ship. Jev only returns the signals. */
export function gateI18nCopy(signals: I18nCopySignals): "ok" | "glance" | "block" {
  if (signals.i18n_debt >= 2.5) return "block";
  if (signals.has_user_facing_hardcoded_copy >= 0.75 && signals.should_migrate_to_i18n >= 0.7) {
    return "block";
  }
  if (
    signals.has_user_facing_hardcoded_copy >= 0.55 ||
    signals.should_migrate_to_i18n >= 0.55 ||
    signals.i18n_debt >= 1.5
  ) {
    return "glance";
  }
  return "ok";
}

export function gateCodeAudit(answers: CodeAuditSignals): "ok" | "glance" | "deep_review" {
  const noulMax = Math.max(
    answers.wrong_layer,
    answers.blast_radius,
    answers.missing_verification,
    answers.secret_or_credential_risk,
    answers.inefficiency,
    answers.dead_or_premature_abstraction,
  );
  if (answers.secret_or_credential_risk >= 0.75) return "deep_review";
  if (answers.problem_severity >= 2.5) return "deep_review";
  if (noulMax >= 0.8) return "deep_review";
  if (noulMax >= 0.55 || answers.problem_severity >= 1.5) return "glance";
  return "ok";
}

export type VerifyGapSignals = {
  has_adequate_verification: number;
  claim_is_testable: number;
  evidence_matches_claim: number;
  verification_gap: number;
  next_proof?: string;
};

/** Caller-owned code_gate for verify_gap. Unit-test without a TypeSafe key. */
export function verifyGapCodeGate(signals: VerifyGapSignals): "ship" | "add_proof" | "block" {
  if (signals.verification_gap >= 2.5) return "block";
  if (signals.claim_is_testable >= 0.65 && signals.has_adequate_verification < 0.35) return "block";
  if (signals.next_proof === "none_needed" && signals.verification_gap < 1.5 && signals.has_adequate_verification >= 0.6) {
    return "ship";
  }
  if (signals.verification_gap >= 1.5) return "add_proof";
  if (signals.has_adequate_verification < 0.55 || signals.evidence_matches_claim < 0.45) return "add_proof";
  return "ship";
}
