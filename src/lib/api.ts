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

export const v = z;

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data;
}
