import { Router } from 'express';
import { TriageOrchestrator } from '../agents/orchestrator.js';

const router = Router();

// Store active runs (in production, use Redis)
const activeRuns = new Map<string, TriageOrchestrator>();

// POST /api/triage - Start a new triage run
router.post('/', async (req, res) => {
  const { alertId } = req.body;

  if (!alertId) {
    return res.status(400).json({ error: 'alertId is required' });
  }

  try {
    const orchestrator = new TriageOrchestrator(alertId);
    activeRuns.set(orchestrator['runId'], orchestrator);

    // Start execution in background
    orchestrator.execute().finally(() => {
      // Clean up after 5 minutes
      setTimeout(() => activeRuns.delete(orchestrator['runId']), 5 * 60 * 1000);
    });

    res.json({
      runId: orchestrator['runId'],
      alertId,
      status: 'started'
    });
  } catch (error) {
    console.error('Triage error:', error);
    res.status(500).json({ error: 'Failed to start triage' });
  }
});

// GET /api/triage/:runId/stream - SSE endpoint
router.get('/:runId/stream', (req, res) => {
  const { runId } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', runId })}\n\n`);

  // Find orchestrator or wait for it
  const checkOrchestrator = () => {
    const orchestrator = activeRuns.get(runId);
    
    if (!orchestrator) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Run not found' })}\n\n`);
      res.end();
      return;
    }

    // Listen to orchestrator events
    const onStart = (data: any) => {
      res.write(`data: ${JSON.stringify({ type: 'start', data, timestamp: new Date().toISOString() })}\n\n`);
    };

    const onStep = (step: any) => {
      res.write(`data: ${JSON.stringify({ type: 'step', data: step, timestamp: new Date().toISOString() })}\n\n`);
    };

    const onFallback = (data: any) => {
      res.write(`data: ${JSON.stringify({ type: 'fallback', data, timestamp: new Date().toISOString() })}\n\n`);
    };

    const onComplete = (result: any) => {
      res.write(`data: ${JSON.stringify({ type: 'complete', data: result, timestamp: new Date().toISOString() })}\n\n`);
      res.end();
    };

    const onError = (error: any) => {
      res.write(`data: ${JSON.stringify({ type: 'error', data: error, timestamp: new Date().toISOString() })}\n\n`);
      res.end();
    };

    orchestrator.on('start', onStart);
    orchestrator.on('step', onStep);
    orchestrator.on('fallback', onFallback);
    orchestrator.on('complete', onComplete);
    orchestrator.on('error', onError);

    // Cleanup on client disconnect
    req.on('close', () => {
      orchestrator.off('start', onStart);
      orchestrator.off('step', onStep);
      orchestrator.off('fallback', onFallback);
      orchestrator.off('complete', onComplete);
      orchestrator.off('error', onError);
    });
  };

  // Check immediately or wait a bit
  setTimeout(checkOrchestrator, 100);
});

export default router;