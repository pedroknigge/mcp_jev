import { choice, noul, score, type Questions } from "@typesafe-ai/sdk";

import type { PackDefinition, PackQuestion } from "./types.js";

export function toSdkQuestions(questions: PackQuestion[]): Questions {
  const out: Questions = {};
  for (const question of questions) {
    out[question.id] = toSdkQuestion(question);
  }
  return out;
}

export function questionsFor(pack: PackDefinition): Questions {
  return toSdkQuestions(pack.questions);
}

function toSdkQuestion(question: PackQuestion) {
  if (question.type === "choice") {
    return choice(question.instructions, question.criteria);
  }
  if (question.type === "noul") {
    return noul(question.instructions, question.criteria);
  }
  if (question.criteria.length < 2) {
    throw new Error(`Score question "${question.id}" needs at least two criteria.`);
  }
  const [first, second, ...rest] = question.criteria;
  return score(question.instructions, [first, second, ...rest]);
}
