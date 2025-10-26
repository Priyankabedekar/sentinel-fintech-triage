import client from 'prom-client';

// Create a Registry
export const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestDuration = new client.Histogram({
  name: 'api_request_latency_ms',
  help: 'HTTP request latency in milliseconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [10, 50, 100, 200, 500, 1000, 2000]
});

export const rateLimitBlocks = new client.Counter({
  name: 'rate_limit_block_total',
  help: 'Total number of rate limit blocks',
  labelNames: ['client']
});

export const agentLatency = new client.Histogram({
  name: 'agent_latency_ms',
  help: 'Agent execution latency',
  labelNames: ['agent', 'ok'],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000]
});

export const toolCallsTotal = new client.Counter({
  name: 'tool_call_total',
  help: 'Total tool calls',
  labelNames: ['tool', 'ok']
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(rateLimitBlocks);
register.registerMetric(agentLatency);
register.registerMetric(toolCallsTotal);