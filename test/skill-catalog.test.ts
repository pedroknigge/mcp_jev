import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { allPacks, listPacks } from "../src/packs/index.js";
import { SMOKE_TOOLS } from "../src/smoke.js";
import {
  CATALOG_REL,
  SKILL_REL,
  applySkillDescriptionVersion,
  catalogFilePath,
  flattenStateFields,
  readPackageVersion,
  renderPackCatalog,
  skillDescriptionVersionPrefix,
  skillFrontmatterDescriptionFirstLine,
} from "../scripts/sync-skill-catalog.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("generated pack-catalog.md matches live pack metadata", () => {
  const expected = renderPackCatalog(allPacks());
  const dest = catalogFilePath(root);
  assert.ok(fs.existsSync(dest), `missing ${CATALOG_REL} — run npx tsx scripts/sync-skill-catalog.ts`);
  const actual = fs.readFileSync(dest, "utf8");
  assert.equal(
    actual,
    expected,
    `${CATALOG_REL} is stale. Run: npx tsx scripts/sync-skill-catalog.ts`,
  );
});

test("SKILL.md description begins with package.json version + em dash", () => {
  const version = readPackageVersion(root);
  const skill = read(SKILL_REL);
  const first = skillFrontmatterDescriptionFirstLine(skill);
  const prefix = skillDescriptionVersionPrefix(version);
  assert.ok(
    first.startsWith(prefix),
    `${SKILL_REL} description first line must start with ${JSON.stringify(prefix)}; got ${JSON.stringify(first)}`,
  );
  assert.equal(applySkillDescriptionVersion(skill, version), skill);
});

test("applySkillDescriptionVersion rewrites a stale prefix and stays idempotent", () => {
  const skill = read(SKILL_REL);
  const bumped = applySkillDescriptionVersion(skill, "9.9.9");
  assert.ok(skillFrontmatterDescriptionFirstLine(bumped).startsWith("9.9.9 — "));
  assert.equal(applySkillDescriptionVersion(bumped, "9.9.9"), bumped);
  const version = readPackageVersion(root);
  const restored = applySkillDescriptionVersion(bumped, version);
  assert.ok(skillFrontmatterDescriptionFirstLine(restored).startsWith(skillDescriptionVersionPrefix(version)));
});

test("SKILL.md covers every registry pack id and points at the catalog", () => {
  const skill = read("skills/mcp_jev/SKILL.md");
  assert.match(skill, /references\/pack-catalog\.md/);
  assert.match(skill, /npx skills add pedroknigge\/mcp_jev --skill mcp_jev/);
  assert.match(skill, /VERSION — /);
  assert.match(skill, /~\/\.agents\/skills\/mcp_jev/);
  assert.match(skill, /nests `mcp_jev\/mcp_jev`/);
  assert.doesNotMatch(skill, /MCP_JEV_SYNC_SKILL/);
  assert.match(skill, /list_packs/);
  assert.match(skill, /describe_pack/);
  assert.match(skill, /run_pack/);
  assert.match(skill, /run_questions/);
  assert.match(skill, /`ping`/);
  assert.match(skill, /mcp_jev doctor/);
  assert.match(skill, /mcp_jev hosts print/);
  assert.match(skill, /mcp_jev hosts write/);
  assert.match(skill, /mcp_jev config set-key/);
  assert.match(skill, /mcp_jev config status/);
  assert.match(skill, /mcp_jev config path/);
  assert.match(skill, /mcp_jev scan/);
  assert.match(skill, /mcp_jev urlcheck/);
  assert.match(skill, /mcp_jev smoke/);
  assert.match(skill, /mcp_jev help/);
  assert.match(skill, /dist\/cli\.js scan/);
  assert.match(skill, /dist\/cli\.js urlcheck/);

  for (const pack of listPacks()) {
    assert.ok(skill.includes(`\`${pack.id}\``), `SKILL.md missing pack id ${pack.id}`);
  }
});

test("skill corpus includes every question id and state field from each pack", () => {
  const skill = read("skills/mcp_jev/SKILL.md");
  const catalog = read(CATALOG_REL);
  const corpus = `${skill}\n${catalog}`;

  for (const pack of allPacks()) {
    assert.ok(catalog.includes(`## \`${pack.id}\``), `${CATALOG_REL} missing heading for ${pack.id}`);
    for (const question of pack.questions) {
      assert.ok(
        corpus.includes(`\`${question.id}\``),
        `skill/catalog missing ${pack.id} question id ${question.id}`,
      );
    }
    for (const field of flattenStateFields(pack.state_schema)) {
      assert.ok(
        catalog.includes(`\`${field.path}\``),
        `${CATALOG_REL} missing ${pack.id} state field ${field.path}`,
      );
    }
  }
});

test("SKILL.md routes tree scans to code_audit and documents pr_audit pitfalls", () => {
  const skill = read("skills/mcp_jev/SKILL.md");
  assert.match(skill, /pr_audit` is not the only file-list pack/);
  assert.match(skill, /PR-shaped merge risk only/);
  assert.match(skill, /experiment narrative/);
  assert.match(skill, /~40-path/);
  assert.match(skill, /Path false positives/);
  assert.match(skill, /does \*\*not\*\* read file bodies/);
  assert.match(skill, /budget/);
  assert.match(skill, /[Pp]ath-only test/);
  assert.match(skill, /Recipe: Full repo scan/);
  assert.match(skill, /6000 files/);
  assert.match(skill, /mcp_jev scan/);
  assert.match(skill, /Tree → `code_audit`/);
  assert.match(skill, /[Dd]omain example/);
  assert.match(skill, /Prefer `review_diff` \/ `code_audit` first/);
  assert.match(skill, /caller’s closed `countries\[\]`/);
  assert.doesNotMatch(skill, /argentina|uruguay|saudi_arabia|one of five countries/i);
});

test("docs do not pitch a fixed five-country or one-product story", () => {
  const readme = read("README.md");
  const skill = read("skills/mcp_jev/SKILL.md");
  assert.match(readme, /Breaking \(`locale_country` 2\.0\.0\)/);
  assert.match(readme, /caller’s closed `countries\[\]` catalog/);
  assert.match(readme, /\*\*Domain example\*\*/);
  assert.match(readme, /Prefer `review_diff` \/ `code_audit`/);
  assert.doesNotMatch(readme, /Catalogue item → Argentina/);
  assert.doesNotMatch(`${readme}\n${skill}`, /plata\/horas/i);
});

test("README pack table covers the same registry ids", () => {
  const readme = read("README.md");
  assert.match(readme, /## Skill stays in sync/);
  assert.match(readme, /VERSION — /);
  assert.match(readme, /~\/\.agents\/skills\/mcp_jev/);
  assert.doesNotMatch(readme, /MCP_JEV_SYNC_SKILL/);
  for (const pack of listPacks()) {
    assert.ok(readme.includes(`\`${pack.id}\``), `README.md missing pack id ${pack.id}`);
  }
});

test("docs teach run_questions and mention every MCP tool id", () => {
  const skill = read("skills/mcp_jev/SKILL.md");
  const readme = read("README.md");
  const contributing = read("CONTRIBUTING.md");
  const custom = read("docs/CUSTOM_JUDGMENTS.md");

  for (const id of SMOKE_TOOLS) {
    assert.ok(skill.includes(`\`${id}\``), `SKILL.md missing tool id ${id}`);
    assert.ok(readme.includes(`\`${id}\``), `README.md missing tool id ${id}`);
  }

  assert.match(skill, /[Pp]acks are shortcuts/);
  assert.match(skill, /If \*\*no pack fits\*\*/);
  assert.match(skill, /is_breaking_for_callers/);
  assert.match(skill, /doc_debt/);
  assert.match(skill, /hottest_symbol/);
  assert.match(skill, /CUSTOM_JUDGMENTS\.md/);
  assert.match(skill, /Shortcut pack/);
  assert.match(skill, /## Blind-test protocol/);
  assert.match(skill, /invent typed Choice \/ Noul \/ Score questions \*\*before\*\*/i);
  assert.match(skill, /i18n via `run_questions`/);
  assert.match(skill, /needs_locale_split/);
  assert.match(skill, /Model route via `run_questions`/);
  assert.match(skill, /needs_shell_tools/);
  assert.match(skill, /irreversible_side_effect/);
  assert.match(skill, /tools_cascade/);
  assert.match(skill, /DOGFOOD\.md/);
  assert.match(skill, /before 255/);
  assert.match(skill, /turn start/);
  assert.doesNotMatch(skill, /Four tools\. No others/);
  assert.doesNotMatch(skill, /say this server cannot do that/);
  assert.doesNotMatch(
    skill,
    /A typed judgment \*\*no pack covers\*\* \(e\.g\. i18n hardcoded copy\)/,
  );

  assert.match(readme, /run_questions/);
  assert.match(readme, /[Pp]acks are shortcuts/);
  assert.match(readme, /is_breaking_for_callers/);
  assert.match(readme, /i18n via `run_questions`/);
  assert.match(readme, /needs_locale_split/);
  assert.match(readme, /model route via `run_questions`/i);
  assert.match(readme, /DOGFOOD\.md/);
  assert.match(readme, /before 255/);
  assert.match(readme, /turn start/);
  assert.match(contributing, /`run_questions`/);
  assert.match(contributing, /typed escape hatch/);
  assert.match(contributing, /[Pp]acks are shortcuts/);
  assert.match(contributing, /DOGFOOD\.md/);
  assert.doesNotMatch(contributing, /A tool that accepts arbitrary TypeSafe questions/);

  assert.match(custom, /run_questions/);
  assert.match(custom, /[Pp]acks are shortcuts/);
  assert.match(custom, /is_breaking_for_callers/);
  assert.match(custom, /doc_debt/);
  assert.match(custom, /hottest_symbol/);
  assert.match(custom, /i18n_copy/);
  assert.match(custom, /list_packs/);
  assert.match(custom, /write me a review/i);
  assert.match(custom, /## Recipe: i18n via `run_questions`/);
  assert.match(custom, /needs_locale_split/);
  assert.match(custom, /## Recipe: model route via `run_questions`/);
  assert.match(custom, /needs_shell_tools/);
  assert.match(custom, /irreversible_side_effect/);
  assert.match(custom, /tools_cascade/);
  assert.match(custom, /DOGFOOD\.md/);
  assert.doesNotMatch(custom, /## Example: i18n hardcoded copy/);
});

test("DOGFOOD.md teaches invent-before-list_packs and equal i18n recipes", () => {
  const dogfood = read("docs/DOGFOOD.md");
  assert.match(dogfood, /Blind-test protocol/);
  assert.match(dogfood, /Invent typed questions first/);
  assert.match(dogfood, /before/i);
  assert.match(dogfood, /list_packs/);
  assert.match(dogfood, /matches exactly/);
  assert.match(dogfood, /run_questions/);
  assert.match(dogfood, /needs_locale_split/);
  assert.match(dogfood, /computer_use_step/);
  assert.match(dogfood, /model_router/);
  assert.match(dogfood, /needs_shell_tools/);
  assert.match(dogfood, /run_questions/);
  assert.match(dogfood, /effective_targets/);
  assert.match(dogfood, /turn start/);
  assert.match(dogfood, /blind-i18n-example/);
  assert.match(dogfood, /Bi-hourly dogfood notes/);
  assert.match(dogfood, /Version prefix required/);
  assert.match(dogfood, /VERSION — /);
  assert.match(dogfood, /One skill refresh path/);
  assert.match(dogfood, /~\/\.agents\/skills\/mcp_jev/);
  assert.match(dogfood, /nests `mcp_jev\/mcp_jev`/);
  assert.match(dogfood, /npx skills add pedroknigge\/mcp_jev --skill mcp_jev/);
  assert.doesNotMatch(dogfood, /MCP_JEV_SYNC_SKILL/);
});
