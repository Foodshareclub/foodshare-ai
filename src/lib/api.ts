import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T) {
  return NextResponse.json(data);
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleError(error: unknown) {
  console.error(error);
  if (error instanceof ApiError) {
    return err(error.message, error.statusCode);
  }
  return err(error instanceof Error ? error.message : "Internal error", 500);
}

export function validate<T>(data: unknown, schema: Record<string, (v: unknown) => boolean>): T {
  if (!data || typeof data !== "object") throw new ApiError(400, "Invalid request body");
  const obj = data as Record<string, unknown>;
  for (const [key, validator] of Object.entries(schema)) {
    if (!validator(obj[key])) throw new ApiError(400, `Invalid ${key}`);
  }
  return obj as T;
}

// Common validators
export const v = {
  string: (v: unknown) => typeof v === "string" && v.length > 0,
  optString: (v: unknown) => v === undefined || typeof v === "string",
  slug: (v: unknown) => typeof v === "string" && /^[\w.-]+$/.test(v),
  posInt: (v: unknown) => typeof v === "number" && Number.isInteger(v) && v > 0,
  bool: (v: unknown) => typeof v === "boolean",
  optBool: (v: unknown) => v === undefined || typeof v === "boolean",
  array: (v: unknown) => Array.isArray(v),
  optArray: (v: unknown) => v === undefined || Array.isArray(v),
  oneOf: <T extends string>(...vals: T[]) => (v: unknown) => v === undefined || vals.includes(v as T),
};
