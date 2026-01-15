import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const checks = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {
        database: 'unknown',
        github: 'unknown',
      },
    };

    // Database check
    try {
      const supabase = await createClient();
      const { error } = await supabase.from('repo_configs').select('id').limit(1);
      checks.checks.database = error ? 'unhealthy' : 'healthy';
    } catch {
      checks.checks.database = 'unhealthy';
    }

    // GitHub API check
    try {
      const token = process.env.GITHUB_TOKEN;
      if (token) {
        const res = await fetch('https://api.github.com/rate_limit', {
          headers: { Authorization: `Bearer ${token}` },
        });
        checks.checks.github = res.ok ? 'healthy' : 'unhealthy';
      } else {
        checks.checks.github = 'not_configured';
      }
    } catch {
      checks.checks.github = 'unhealthy';
    }

    const allHealthy = Object.values(checks.checks).every(v => v === 'healthy' || v === 'not_configured');
    checks.status = allHealthy ? 'healthy' : 'degraded';

    logger.info('Health check completed', checks);

    return NextResponse.json(checks, { status: allHealthy ? 200 : 503 });
  } catch (error) {
    logger.error('Health check failed', error);
    return NextResponse.json(
      { status: 'unhealthy', error: 'Health check failed' },
      { status: 503 }
    );
  }
}
