/**
 * Optional Prometheus metrics for the MCP server.
 * Enabled via METRICS_ENABLED=true environment variable.
 * When disabled, all recording functions are no-ops.
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { getVersion } from './version.js';

let enabled = false;

export const register = new Registry();

let toolCalls: Counter | null = null;
let toolDuration: Histogram | null = null;
let activeSessions: Gauge | null = null;
let requests: Counter | null = null;

export function initMetrics(metricsEnabled: boolean): void {
  enabled = metricsEnabled;
  if (!enabled) return;

  requests = new Counter({
    name: 'mcp_requests_total',
    help: 'Total HTTP requests to the MCP server',
    labelNames: ['method'] as const,
    registers: [register],
  });

  toolCalls = new Counter({
    name: 'mcp_tool_calls_total',
    help: 'Total MCP tool invocations',
    labelNames: ['tool_name'] as const,
    registers: [register],
  });

  toolDuration = new Histogram({
    name: 'mcp_tool_call_duration_seconds',
    help: 'MCP tool call duration in seconds',
    labelNames: ['tool_name'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  });

  activeSessions = new Gauge({
    name: 'mcp_active_sessions',
    help: 'Number of currently active MCP sessions',
    registers: [register],
  });

  const buildInfoGauge = new Gauge({
    name: 'meteoswiss_mcp_build_info',
    help: 'MeteoSwiss MCP server build information',
    labelNames: ['version', 'node_version'] as const,
    registers: [register],
  });
  buildInfoGauge.labels({ version: getVersion(), node_version: process.version }).set(1);

  collectDefaultMetrics({ register });
}

export function recordToolCall(toolName: string, durationMs: number): void {
  if (!enabled) return;
  toolCalls!.inc({ tool_name: toolName });
  toolDuration!.observe({ tool_name: toolName }, durationMs / 1000);
}

export function sessionOpened(): void {
  if (!enabled) return;
  activeSessions!.inc();
}

export function sessionClosed(): void {
  if (!enabled) return;
  activeSessions!.dec();
}

export function recordRequest(method: string): void {
  if (!enabled) return;
  requests!.inc({ method });
}

export function metricsEnabled(): boolean {
  return enabled;
}
