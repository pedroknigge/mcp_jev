/**
 * Generate skills/mcp_jev/references/pack-catalog.md from live pack metadata
 * and keep SKILL.md frontmatter description prefixed with `${package.json version} — `.
 * Usage: npx tsx scripts/sync-skill-catalog.ts [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { allPacks } from "../src/packs/registry.js";
import type { JsonSchema, PackDefinition, PackQuestion } from "../src/packs/types.js";

export const CATALOG_REL = "skills/mcp_jev/references/pack-catalog.md";
export const SKILL_REL = "skills/mcp_jev/SKILL.md";

/** Semver + em dash. Standing rule for Pedro skills (mcp_jev is the template). */
export const SKILL_VERSION_PREFIX_RE = /^\d+\.\d+\.\d+ — /;

export function readPackageVersion(repoRoot: string): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  if (!pkg.version) {
    throw new Error("package.json missing version");
  }
  return pkg.version;
}

export function skillDescriptionVersionPrefix(version: string): string {
  return `${version} — `;
}

export function skillFrontmatterDescriptionFirstLine(skillMd: string): string {
  const fmMatch = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    throw new Error(`${SKILL_REL} missing YAML frontmatter`);
  }
  const descMatch = fmMatch[1].match(/^description:\s*>\s*\r?\n[ \t]*(.*)$/m);
  if (!descMatch) {
    throw new Error(`${SKILL_REL} description must be a folded YAML scalar (description: >)`);
  }
  return descMatch[1];
}

export function applySkillDescriptionVersion(skillMd: string, version: string): string {
  const prefix = skillDescriptionVersionPrefix(version);
  const fmMatch = skillMd.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/);
  if (!fmMatch) {
    throw new Error(`${SKILL_REL} missing YAML frontmatter`);
  }
  const [full, open, fm, close] = fmMatch;
  const descLineRe = /^(description:\s*>\s*\r?\n)([ \t]*)(.*)$/m;
  const descMatch = fm.match(descLineRe);
  if (!descMatch) {
    throw new Error(`${SKILL_REL} description must be a folded YAML scalar (description: >)`);
  }
  const first = `${prefix}${descMatch[3].replace(SKILL_VERSION_PREFIX_RE, "")}`;
  const nextFm = fm.replace(descLineRe, `${descMatch[1]}${descMatch[2]}${first}`);
  return skillMd.replace(full, `${open}${nextFm}${close}`);
}

export type FlatField = {
  path: string;
  type: string;
  required: boolean;
  description: string;
};

export function flattenStateFields(schema: JsonSchema, prefix = ""): FlatField[] {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const out: FlatField[] = [];
  for (const [name, child] of Object.entries(props)) {
    const fieldPath = prefix ? `${prefix}.${name}` : name;
    out.push({
      path: fieldPath,
      type: child.type ?? (child.properties ? "object" : "unknown"),
      required: required.has(name),
      description: child.description ?? "",
    });
    if (child.properties) {
      out.push(...flattenStateFields(child, fieldPath));
    }
    if (child.items?.properties) {
      out.push(...flattenStateFields(child.items, `${fieldPath}[]`));
    }
  }
  return out;
}

function questionLine(question: PackQuestion): string {
  if (question.type === "choice") {
    const options = Object.keys(question.criteria)
      .map((key) => `\`${key}\``)
      .join(" | ");
    return `- **choice** \`${question.id}\` — options: ${options}`;
  }
  if (question.type === "noul") {
    return `- **noul** \`${question.id}\``;
  }
  const rungs = question.criteria.map((rung) => rung.split(":")[0]?.trim() ?? rung).join("; ");
  return `- **score** \`${question.id}\` — ${question.criteria.length} rungs: ${rungs}`;
}

function renderPack(pack: PackDefinition): string {
  const fields = flattenStateFields(pack.state_schema);
  const body: string[] = [
    `## \`${pack.id}\` ${pack.version}`,
    "",
    `**${pack.title}.** ${pack.summary}`,
    "",
    `When to use: ${pack.when_to_use}`,
    "",
    "### State",
    "",
  ];

  const topRequired = (pack.state_schema.required ?? []).map((name) => `\`${name}\``);
  const requiredLine =
    topRequired.length > 0
      ? `Required: ${topRequired.join(", ")}.`
      : "Required: none at the top level (see pack notes for Mode A / Mode B).";
  const extra =
    pack.state_schema.additionalProperties === false ? " `additionalProperties: false`." : "";
  body.push(`${requiredLine}${extra}`);
  body.push("", "| field | type | required | description |", "| --- | --- | --- | --- |");
  for (const field of fields) {
    const desc = field.description.replace(/\|/g, "\\|").replace(/\n/g, " ");
    body.push(`| \`${field.path}\` | ${field.type} | ${field.required ? "yes" : "no"} | ${desc} |`);
  }

  body.push("", "### Questions", "");
  if (pack.questionsForState) {
    body.push(
      "`describe_pack` returns the static template below. `run_pack` may rebuild Choice options from state (`dynamic_choice_from_state`).",
      "",
    );
  }
  for (const question of pack.questions) {
    body.push(questionLine(question));
  }

  body.push("", "### Example state", "", "```json", JSON.stringify(pack.example_state, null, 2), "```", "");
  if (pack.suggested_workflow.length > 0) {
    body.push("### Suggested workflow", "");
    for (const step of pack.suggested_workflow) {
      body.push(`1. ${step}`);
    }
    body.push("");
  }
  if (pack.notes.length > 0) {
    body.push("### Notes", "");
    for (const note of pack.notes) {
      body.push(`- ${note}`);
    }
    body.push("");
  }
  return body.join("\n");
}

export function renderPackCatalog(packs: readonly PackDefinition[] = allPacks()): string {
  const ids = packs.map((pack) => pack.id);
  const parts = [
    "<!-- Generated by scripts/sync-skill-catalog.ts from src/packs/. Do not edit by hand. -->",
    "",
    "# Pack catalog (generated)",
    "",
    "Exact pack ids, state fields, and question ids from the TypeScript pack definitions.",
    "Regenerate: `npx tsx scripts/sync-skill-catalog.ts` (also `npm run sync-skill-catalog`).",
    "`npm test` fails if this file drifts from the registry.",
    "",
    `Registry order (${packs.length}): ${ids.map((id) => `\`${id}\``).join(", ")}.`,
    "",
    "Agent skill: [`../SKILL.md`](../SKILL.md). Frontmatter description always starts with",
    "`package.json` version + ` — `. After `scripts/update.sh`, the skill is refreshed **once**",
    "to `~/.agents/skills/mcp_jev`. Hosts that do not read that path: re-add **once** with",
    "`npx skills add pedroknigge/mcp_jev --skill mcp_jev`. Do not also copy (nests `mcp_jev/mcp_jev`).",
    "",
  ];
  for (const pack of packs) {
    parts.push(renderPack(pack));
  }
  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function catalogFilePath(repoRoot: string): string {
  return path.join(repoRoot, CATALOG_REL);
}

function repoRootFromHere(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function main(): void {
  const root = repoRootFromHere();
  const dest = catalogFilePath(root);
  const next = renderPackCatalog(allPacks());
  const version = readPackageVersion(root);
  const skillPath = path.join(root, SKILL_REL);
  const skillPrev = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, "utf8") : "";
  const skillNext = applySkillDescriptionVersion(skillPrev, version);
  if (process.argv.includes("--check")) {
    const prev = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : "";
    let stale = false;
    if (prev !== next) {
      console.error(`${CATALOG_REL} is stale. Run: npx tsx scripts/sync-skill-catalog.ts`);
      stale = true;
    }
    if (skillPrev !== skillNext) {
      console.error(
        `${SKILL_REL} description must start with ${skillDescriptionVersionPrefix(version)}. Run: npx tsx scripts/sync-skill-catalog.ts`,
      );
      stale = true;
    }
    if (stale) {
      process.exit(1);
    }
    console.log(`${CATALOG_REL} matches pack metadata.`);
    console.log(`${SKILL_REL} description starts with ${skillDescriptionVersionPrefix(version)}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, next);
  console.log(`Wrote ${CATALOG_REL}`);
  if (skillPrev !== skillNext) {
    fs.writeFileSync(skillPath, skillNext);
    console.log(`Wrote ${SKILL_REL} description prefix ${skillDescriptionVersionPrefix(version)}`);
  }
}

const invokedAsScript =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]!) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  main();
}
