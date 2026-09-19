import { ToolError } from "../errors.js";

/** Always present so Jev can refuse a target. */
export const NONE_OPTION = "none";
/** Present only when the catalog is empty (Choice needs ≥ 2 options). */
export const UNAVAILABLE_OPTION = "unavailable";
/** TypeSafe Choice cap (including `none`). */
export const MAX_CHOICE_OPTIONS = 255;

export type CatalogItem = {
  id: string;
  role: string;
  label: string;
  name?: string;
  value?: string;
  state?: string;
  region?: string;
  source?: string;
};

export function isCatalogItem(value: unknown): value is CatalogItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.role === "string" && typeof item.label === "string";
}

export function readCatalogItems(value: unknown): CatalogItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isCatalogItem);
}

export function formatCatalogItem(item: CatalogItem): string {
  const parts = [`role=${item.role}`, `label=${item.label}`];
  if (item.name) {
    parts.push(`name=${item.name}`);
  }
  if (item.value) {
    parts.push(`value=${item.value}`);
  }
  if (item.state) {
    parts.push(`state=${item.state}`);
  }
  if (item.region) {
    parts.push(`region=${item.region}`);
  }
  if (item.source) {
    parts.push(`source=${item.source}`);
  }
  return parts.join("; ");
}

/**
 * Build Choice criteria from a closed item catalog.
 * The TypeSafe JS SDK `choice(instructions, criteria)` takes a `Record<string, string>`,
 * so option keys can be the caller's item ids. This MCP does not invent ids.
 */
export function catalogChoiceCriteria(
  items: CatalogItem[],
  noneDescription: string,
  fieldPath: string,
): Record<string, string> {
  if (items.length === 0) {
    return {
      [NONE_OPTION]: noneDescription,
      [UNAVAILABLE_OPTION]: `Empty ${fieldPath} catalog; re-observe before targeting.`,
    };
  }
  if (items.length + 1 > MAX_CHOICE_OPTIONS) {
    throw new ToolError(
      "invalid_state",
      `${fieldPath} has ${items.length} items; TypeSafe Choice allows at most ${MAX_CHOICE_OPTIONS - 1} plus "${NONE_OPTION}". Filter the catalog in the harness.`,
    );
  }

  const seen = new Set<string>();
  const criteria: Record<string, string> = {
    [NONE_OPTION]: noneDescription,
  };
  for (const item of items) {
    if (item.id === NONE_OPTION || item.id === UNAVAILABLE_OPTION) {
      throw new ToolError(
        "invalid_state",
        `${fieldPath} id "${item.id}" is reserved. Use another id; keep "${NONE_OPTION}" / "${UNAVAILABLE_OPTION}" for pack-owned options.`,
      );
    }
    if (seen.has(item.id)) {
      throw new ToolError("invalid_state", `${fieldPath} has duplicate id "${item.id}". Catalog ids must be unique.`);
    }
    seen.add(item.id);
    criteria[item.id] = formatCatalogItem(item);
  }
  return criteria;
}

export function readStringCatalog(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/**
 * Build Choice criteria from a closed string catalog (file paths, ids).
 * Keys are the caller values; this MCP does not invent entries.
 */
export function stringCatalogChoiceCriteria(
  values: string[],
  noneDescription: string,
  fieldPath: string,
): Record<string, string> {
  if (values.length === 0) {
    return {
      [NONE_OPTION]: noneDescription,
      [UNAVAILABLE_OPTION]: `Empty ${fieldPath} catalog; pass a closed list before targeting.`,
    };
  }
  if (values.length + 1 > MAX_CHOICE_OPTIONS) {
    throw new ToolError(
      "invalid_state",
      `${fieldPath} has ${values.length} entries; TypeSafe Choice allows at most ${MAX_CHOICE_OPTIONS - 1} plus "${NONE_OPTION}". Filter the catalog in the caller.`,
    );
  }

  const seen = new Set<string>();
  const criteria: Record<string, string> = {
    [NONE_OPTION]: noneDescription,
  };
  for (const raw of values) {
    const value = raw.trim();
    if (value === NONE_OPTION || value === UNAVAILABLE_OPTION) {
      throw new ToolError(
        "invalid_state",
        `${fieldPath} entry "${value}" is reserved. Use another path; keep "${NONE_OPTION}" / "${UNAVAILABLE_OPTION}" for pack-owned options.`,
      );
    }
    if (seen.has(value)) {
      throw new ToolError("invalid_state", `${fieldPath} has duplicate entry "${value}". Catalog values must be unique.`);
    }
    seen.add(value);
    criteria[value] = `Closed catalog entry from ${fieldPath}.`;
  }
  return criteria;
}
