import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError as baseHandleError, ValidationError } from "./errors";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleError(error: unknown) {
  const result = baseHandleError(error);
  return NextResponse.json(
    { error: result.error, code: result.code, details: (result as any).details },
    { status: result.statusCode }
  );
}

// Custom validators extending Zod
export const v = {
  ...z,
  // Slug: lowercase alphanumeric with hyphens/underscores
  slug: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  // Positive integer
  posInt: z.number().int().positive(),
  // Optional string
  optString: z.string().optional(),
  // Optional boolean
  optBool: z.boolean().optional(),
  // Optional array of strings
  optArray: z.array(z.string()).optional(),
  // Enum/oneOf helper
  oneOf: <T extends string>(...values: T[]) => z.enum(values as [T, ...T[]]).optional(),
};

export function validate<T>(data: unknown, schemaObj: Record<string, z.ZodType>): T {
  const schema = z.object(schemaObj);
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data as T;
}
