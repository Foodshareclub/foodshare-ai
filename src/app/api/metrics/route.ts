import { NextRequest, NextResponse } from "next/server";
import { metrics } from "@/lib/metrics";
import { githubCircuitBreaker, llmCircuitBreaker } from "@/lib/circuit-breaker";

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format");
  
  const data = {
    ...metrics.getMetrics(),
    circuitBreakers: {
      github: githubCircuitBreaker.getState(),
      llm: llmCircuitBreaker.getState(),
    },
    timestamp: new Date().toISOString(),
  };

  if (format === "prometheus") {
    const lines: string[] = [];
    const m = metrics.getMetrics();
    
    for (const [key, value] of Object.entries(m.counters)) {
      lines.push(`# TYPE ${key.split("{")[0]} counter`);
      lines.push(`${key} ${value}`);
    }
    for (const [key, value] of Object.entries(m.gauges)) {
      lines.push(`# TYPE ${key.split("{")[0]} gauge`);
      lines.push(`${key} ${value}`);
    }
    for (const [key, hist] of Object.entries(m.histograms)) {
      const name = key.split("{")[0];
      const h = hist as { count: number; p50: number; p95: number; p99: number };
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_count ${h.count}`);
      lines.push(`${name}_p50 ${h.p50}`);
      lines.push(`${name}_p95 ${h.p95}`);
      lines.push(`${name}_p99 ${h.p99}`);
    }
    
    return new NextResponse(lines.join("\n"), {
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json(data);
}
