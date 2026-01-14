import { NextRequest } from "next/server";
import { repos } from "@/lib/github";
import { ok, handleError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const org = new URL(request.url).searchParams.get("org");
    const data = org ? await repos.org(org) : await repos.user();
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}
