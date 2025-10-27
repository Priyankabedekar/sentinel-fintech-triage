import express from 'express';
import cors from 'cors';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { register } from './lib/metrics.js';
import customerRouter from './routes/customer.js';
import insightsRouter from './routes/insights.js';
import ingestRouter from './routes/ingest.js';
import triageRouter from './routes/triage.js';
import alertsRouter from './routes/alerts.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(metricsMiddleware);

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Metrics endpoint (Prometheus format)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// API routes (with rate limiting)
app.use('/api/customer', rateLimitMiddleware, customerRouter);
app.use('/api/insights', rateLimitMiddleware, insightsRouter);
app.use('/api/ingest', rateLimitMiddleware, ingestRouter);
app.use('/api/triage', triageRouter);
app.use('/api/alerts', alertsRouter);

app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
  console.log(`📊 Metrics: http://localhost:${PORT}/metrics`);
});