import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import type { AgentStep, TriageResult, StreamEvent } from '../types/agents.js';
import { agentLatency, toolCallsTotal } from '../lib/metrics.js';

const prisma = new PrismaClient();

export class TriageOrchestrator extends EventEmitter {
  private runId: string;
  private alertId: string;
  private steps: AgentStep[] = [];
  private startTime: number;

  constructor(alertId: string) {
    super();
    this.alertId = alertId;
    this.runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
  }

  async execute(): Promise<TriageResult> {
    this.emit('start', { runId: this.runId, alertId: this.alertId });

    try {
      // Step 1: Get customer profile
      const profile = await this.executeStep('getProfile', async () => {
        const alert = await prisma.alert.findUnique({
          where: { id: this.alertId },
          include: {
            customer: {
              include: {
                cards: true,
                accounts: true
              }
            },
            transaction: true
          }
        });

        if (!alert) throw new Error('Alert not found');

        return {
          customerId: alert.customer.id,
          name: alert.customer.name,
          kycLevel: alert.customer.kyc_level,
          cardCount: alert.customer.cards.length,
          accountBalance: alert.customer.accounts[0]?.balance_cents || 0,
          suspectTransaction: alert.transaction
        };
      });

      // Step 2: Analyze recent transactions
      const recentTx = await this.executeStep('recentTransactions', async () => {
        const transactions = await prisma.transaction.findMany({
          where: { customer_id: profile.result.customerId },
          orderBy: { ts: 'desc' },
          take: 20
        });

        return {
          count: transactions.length,
          totalSpend: transactions.reduce((sum, t) => sum + t.amount_cents, 0),
          merchants: [...new Set(transactions.map(t => t.merchant))].length
        };
      });

      // Step 3: Risk signals (with potential failure)
      const riskSignals = await this.executeStepWithRetry('riskSignals', async () => {
        // Simulate occasional failures for demo
        if (Math.random() < 0.2) {
          throw new Error('Risk service timeout');
        }

        const signals = [];
        const txCount = recentTx.result.count;
        
        if (txCount > 15) signals.push('high_velocity');
        if (profile.result.suspectTransaction?.amount_cents > 50000) signals.push('large_amount');
        if (profile.result.suspectTransaction?.country !== 'IN') signals.push('foreign_transaction');

        return {
          signals,
          score: signals.length * 0.3
        };
      }, 2); // Max 2 retries

      // Step 4: KB lookup
      const kbResult = await this.executeStep('kbLookup', async () => {
        const kb = await prisma.kBDoc.findMany({
          where: {
            OR: [
              { title: { contains: 'freeze', mode: 'insensitive' } },
              { title: { contains: 'dispute', mode: 'insensitive' } }
            ]
          },
          take: 3
        });

        return {
          documents: kb.map(d => ({ title: d.title, anchor: d.anchor }))
        };
      });

      // Step 5: Make decision
      const decision = await this.executeStep('decide', async () => {
        const riskScore = riskSignals.result.score;
        const signals = riskSignals.result.signals;

        let risk: 'low' | 'medium' | 'high';
        let recommendation: string;
        let confidence: number;

        if (riskScore >= 0.7) {
          risk = 'high';
          recommendation = 'freeze_card';
          confidence = 0.95;
        } else if (riskScore >= 0.4) {
          risk = 'medium';
          recommendation = 'contact_customer';
          confidence = 0.75;
        } else {
          risk = 'low';
          recommendation = 'mark_false_positive';
          confidence = 0.60;
        }

        return {
          risk,
          recommendation,
          confidence,
          reasons: signals.length > 0 ? signals : ['no_clear_risk'],
          requiresOtp: risk === 'high'
        };
      });

      // Calculate total duration
      const totalDuration = Date.now() - this.startTime;

      // Save to database
      const triageRun = await prisma.triageRun.create({
        data: {
          alert_id: this.alertId,
          ended_at: new Date(),
          risk: decision.result.risk,
          reasons: decision.result.reasons,
          fallback_used: this.steps.some(s => !s.success),
          latency_ms: totalDuration
        }
      });

      // Save traces
      await prisma.agentTrace.createMany({
        data: this.steps.map((step, idx) => ({
          run_id: triageRun.id,
          seq: idx,
          step: step.name,
          ok: step.success,
          duration_ms: step.duration_ms,
          detail_json: step.result || { error: step.error }
        }))
      });

      const result: TriageResult = {
        runId: this.runId,
        alertId: this.alertId,
        risk: decision.result.risk,
        reasons: decision.result.reasons,
        recommendation: decision.result.recommendation,
        confidence: decision.result.confidence,
        steps: this.steps,
        fallbackUsed: this.steps.some(s => !s.success),
        totalDuration
      };

      this.emit('complete', result);
      return result;

    } catch (error) {
      this.emit('error', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  private async executeStep(name: string, fn: () => Promise<any>): Promise<AgentStep> {
    const start = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      const step: AgentStep = {
        name,
        duration_ms: duration,
        success: true,
        result
      };

      this.steps.push(step);
      this.emit('step', step);
      
      // Record metrics
      agentLatency.labels(name, 'true').observe(duration);
      toolCallsTotal.labels(name, 'true').inc();

      return step;
    } catch (error) {
      const duration = Date.now() - start;
      const step: AgentStep = {
        name,
        duration_ms: duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.steps.push(step);
      this.emit('step', step);
      
      // Record metrics
      agentLatency.labels(name, 'false').observe(duration);
      toolCallsTotal.labels(name, 'false').inc();

      throw error;
    }
  }

  private async executeStepWithRetry(
    name: string,
    fn: () => Promise<any>,
    maxRetries = 2
  ): Promise<AgentStep> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 150ms, 400ms
          const delay = Math.min(150 * Math.pow(2, attempt - 1), 400);
          await this.sleep(delay);
          this.emit('retry', { step: name, attempt });
        }

        return await this.executeStep(name, fn);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.log(`Step ${name} failed, attempt ${attempt + 1}/${maxRetries + 1}`);
      }
    }

    // All retries failed - use fallback
    this.emit('fallback', { step: name, error: lastError?.message });
    
    const fallbackResult = await this.executeStep(`${name}_fallback`, async () => {
      return {
        fallback: true,
        score: 0.5, // Medium risk as fallback
        signals: ['service_unavailable']
      };
    });

    return fallbackResult;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}