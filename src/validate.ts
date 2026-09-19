import { ToolError } from "./errors.js";
import type { JsonSchema, PackDefinition } from "./packs/types.js";

export function validatePackState(pack: PackDefinition, state: unknown): void {
  const errors = validateSchema(pack.state_schema, state, "/");
  if (errors.length === 0) {
    return;
  }
  throw new ToolError(
    "invalid_state",
    `State failed validation for pack "${pack.id}": ${errors.join("; ")}. Call describe_pack for the JSON Schema and example_state.`,
  );
}

export function validateSchema(schema: JsonSchema, value: unknown, path: string): string[] {
  if (schema.type === "object") {
    if (!isPlainObject(value)) {
      return [`${path} must be object`];
    }
    const errors: string[] = [];
    const required = schema.required ?? [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push(`${join(path, key)} is required`);
      }
    }
    const properties = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      const childSchema = properties[key];
      if (!childSchema) {
        if (schema.additionalProperties === false) {
          errors.push(`${join(path, key)} is not allowed`);
        }
        continue;
      }
      errors.push(...validateSchema(childSchema, child, join(path, key)));
    }
    return errors;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      return [`${path} must be array`];
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      return [`${path} must have at least ${schema.minItems} items`];
    }
    if (!schema.items) {
      return [];
    }
    return value.flatMap((item, index) => validateSchema(schema.items as JsonSchema, item, join(path, String(index))));
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      return [`${path} must be string`];
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return [`${path} must be at least ${schema.minLength} characters`];
    }
    return [];
  }

  if (schema.type === "boolean") {
    return typeof value === "boolean" ? [] : [`${path} must be boolean`];
  }

  if (schema.type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? [] : [`${path} must be number`];
  }

  return [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function join(path: string, key: string): string {
  return path === "/" ? `/${key}` : `${path}/${key}`;
}
