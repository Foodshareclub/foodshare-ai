import { NextResponse } from "next/server";

export async function GET() {
  const host = process.env.OLLAMA_HOST || "http://localhost:11434";
  
  const headers: HeadersInit = {};
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }

  try {
    const res = await fetch(`${host}/api/tags`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    
    if (!res.ok) {
      return NextResponse.json({ status: "offline", host }, { status: 503 });
    }
    
    const data = await res.json();
    return NextResponse.json({ 
      status: "online", 
      host,
      models: data.models?.map((m: { name: string }) => m.name) || []
    });
  } catch {
    return NextResponse.json({ status: "offline", host }, { status: 503 });
  }
}
