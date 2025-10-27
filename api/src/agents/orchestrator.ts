import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import type { AgentStep, TriageResult } from '../types/agents.js';
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

  getRunId(): string {
    return this.runId;
  }

  async execute(): Promise<TriageResult> {
    this.emit('start', { runId: this.runId, alertId: this.alertId });

    try {
      const profile = await this.executeStep('getProfile', async () => {
        const alert = await prisma.alert.findUnique({
          where: { id: this.alertId },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                kyc_level: true
              }
            },
            transaction: {
              select: {
                id: true,
                amount_cents: true,
                merchant: true,
                country: true
              }
            }
          }
        });

        if (!alert) throw new Error('Alert not found');

        // Count cards and get first account balance
        const cardCount = await prisma.card.count({
          where: { customer_id: alert.customer.id }
        });

        const account = await prisma.account.findFirst({
          where: { customer_id: alert.customer.id },
          select: { balance_cents: true }
        });

        return {
          customerId: alert.customer.id,
          name: alert.customer.name,
          kycLevel: alert.customer.kyc_level,
          cardCount,
          accountBalance: account?.balance_cents || 0,
          suspectTransaction: alert.transaction
        };
      });

      // Simulate delay for realistic UX
      await this.sleep(300);

      // Analyze recent transactions
      const recentTx = await this.executeStep('recentTransactions', async () => {
        const transactions = await prisma.transaction.findMany({
          where: { customer_id: profile.result.customerId },
          orderBy: { ts: 'desc' },
          take: 20,
          select: {
            amount_cents: true,
            merchant: true,
            ts: true
          }
        });

        const uniqueMerchants = new Set(transactions.map(t => t.merchant)).size;
        const totalSpend = transactions.reduce((sum, t) => sum + t.amount_cents, 0);

        return {
          count: transactions.length,
          totalSpend,
          merchants: uniqueMerchants,
          avgAmount: transactions.length > 0 ? totalSpend / transactions.length : 0
        };
      });

      await this.sleep(400);

      // Risk signals (with retry and fallback)
      const riskSignals = await this.executeStepWithRetry('riskSignals', async () => {
        // Simulate occasional failures (10% chance)
        if (Math.random() < 0.1) {
          throw new Error('Risk service timeout');
        }

        const signals = [];
        const txCount = recentTx.result.count;
        const suspectAmount = profile.result.suspectTransaction?.amount_cents || 0;
        
        // Velocity check
        if (txCount > 15) signals.push('high_velocity');
        
        // Large amount check
        if (suspectAmount > 50000) signals.push('large_amount');
        
        // Foreign transaction check
        if (profile.result.suspectTransaction?.country !== 'IN') {
          signals.push('foreign_transaction');
        }

        // Unusual merchant check
        if (recentTx.result.merchants < 3 && txCount > 10) {
          signals.push('merchant_concentration');
        }

        const score = Math.min(signals.length * 0.25, 1.0);

        return { signals, score };
      }, 2);

      await this.sleep(500);

      // Step 4: KB lookup
      const kbResult = await this.executeStep('kbLookup', async () => {
        const docs = await prisma.kBDoc.findMany({
          take: 2,
          select: { title: true, anchor: true }
        });

        return {
          documents: docs,
          citationsFound: docs.length
        };
      });

      await this.sleep(300);

      // Step 5: Make decision
      const decision = await this.executeStep('decide', async () => {
        const riskScore = riskSignals.result.score;
        const signals = riskSignals.result.signals;

        let risk: 'low' | 'medium' | 'high';
        let recommendation: string;
        let confidence: number;

        if (riskScore >= 0.6) {
          risk = 'high';
          recommendation = 'freeze_card';
          confidence = 0.92;
        } else if (riskScore >= 0.3) {
          risk = 'medium';
          recommendation = 'contact_customer';
          confidence = 0.78;
        } else {
          risk = 'low';
          recommendation = 'mark_false_positive';
          confidence = 0.65;
        }

        return {
          risk,
          recommendation,
          confidence,
          reasons: signals.length > 0 ? signals : ['no_clear_risk'],
          requiresOtp: risk === 'high' && profile.result.kycLevel < 3
        };
      });

      // Calculate total duration
      const totalDuration = Date.now() - this.startTime;

      // Save to database (FAST - single insert)
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

      // Save traces (BATCH insert)
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
      console.error('Orchestrator error:', error);
      this.emit('error', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  private async executeStep(name: string, fn: () => Promise<any>): Promise<AgentStep> {
    const start = Date.now();
    
    try {
      const result = await Promise.race([
        fn(),
        this.timeout(5000, `${name} timeout`)
      ]);
      
      const duration = Date.now() - start;
      
      const step: AgentStep = {
        name,
        duration_ms: duration,
        success: true,
        result
      };

      this.steps.push(step);
      this.emit('step', step);
      
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
        score: 0.5,
        signals: ['service_unavailable']
      };
    });

    return fallbackResult;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private timeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error(message)), ms)
    );
  }
}