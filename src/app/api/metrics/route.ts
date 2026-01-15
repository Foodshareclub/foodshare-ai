import { NextResponse } from 'next/server';
import { metrics } from '@/lib/metrics';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const metricsData = metrics.getMetrics();
    
    logger.info('Metrics endpoint accessed', { 
      counterCount: Object.keys(metricsData.counters).length,
      gaugeCount: Object.keys(metricsData.gauges).length,
      histogramCount: Object.keys(metricsData.histograms).length,
    });

    return NextResponse.json(metricsData);
  } catch (error) {
    logger.error('Failed to retrieve metrics', error);
    return NextResponse.json(
      { error: 'Failed to retrieve metrics' },
      { status: 500 }
    );
  }
}
