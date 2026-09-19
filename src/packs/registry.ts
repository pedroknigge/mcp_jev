import { ToolError } from "../errors.js";
import { computerUseStepPack } from "./computer-use-step.js";
import { intentRouterPack } from "./intent-router.js";
import { localeCountryPack } from "./locale-country.js";
import { modelRouterPack } from "./model-router.js";
import { prAuditPack } from "./pr-audit.js";
import type { PackDefinition, PackSummary } from "./types.js";

const packs: PackDefinition[] = [
  prAuditPack,
  intentRouterPack,
  localeCountryPack,
  computerUseStepPack,
  modelRouterPack,
];

const byId = new Map(packs.map((pack) => [pack.id, pack]));

export function listPacks(): PackSummary[] {
  return packs.map((pack) => ({
    id: pack.id,
    version: pack.version,
    title: pack.title,
    summary: pack.summary,
    when_to_use: pack.when_to_use,
  }));
}

export function getPack(packId: string): PackDefinition {
  const pack = byId.get(packId);
  if (!pack) {
    const known = packs.map((item) => item.id).join(", ");
    throw new ToolError(
      "unknown_pack",
      `Unknown pack_id "${packId}". Use list_packs. Known packs: ${known}.`,
    );
  }
  return pack;
}

export function packCount(): number {
  return packs.length;
}

export function allPacks(): readonly PackDefinition[] {
  return packs;
}
