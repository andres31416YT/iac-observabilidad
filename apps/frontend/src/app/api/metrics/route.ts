import { NextRequest, NextResponse } from 'next/server';
import { Registry, Counter, collectDefaultMetrics } from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'endpoint'],
  registers: [registry],
});

export async function GET(request: NextRequest) {
  httpRequestsTotal.inc({ method: 'GET', endpoint: '/api/metrics' });
  const metrics = await registry.metrics();
  return new NextResponse(metrics, {
    headers: { 'Content-Type': 'text/plain; version=0.0.4' },
  });
}
