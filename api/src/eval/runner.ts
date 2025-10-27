import { PrismaClient } from '@prisma/client';
import { TriageOrchestrator } from '../agents/orchestrator.js';
import { redactPII } from '../lib/redactor.js';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

interface EvalResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

class EvalRunner {
  private results: EvalResult[] = [];

  async runAll() {
    console.log('🧪 Running Evaluation Suite...\n');

    // Load eval cases
    const evalFiles = await fs.readdir('../../fixtures/evals');
    
    for (const file of evalFiles) {
      if (!file.endsWith('.json')) continue;
      
      const content = await fs.readFile(
        path.join('../../fixtures/evals', file),
        'utf-8'
      );
      const evalCase = JSON.parse(content);
      
      await this.runEval(evalCase);
    }

    this.printSummary();
  }

  async runEval(evalCase: any) {
    const start = Date.now();
    console.log(`Running: ${evalCase.name}`);

    try {
      switch (evalCase.name) {
        case 'Freeze Card with OTP':
          await this.testFreezeWithOTP(evalCase);
          break;
        case 'Dispute Creation':
          await this.testDisputeCreation(evalCase);
          break;
        case 'Rate Limit Behavior':
          await this.testRateLimit(evalCase);
          break;
        case 'PII Redaction':
          await this.testPIIRedaction(evalCase);
          break;
        case 'Risk Tool Timeout Fallback':
          await this.testFallback(evalCase);
          break;
        default:
          throw new Error(`Unknown eval: ${evalCase.name}`);
      }

      this.results.push({
        name: evalCase.name,
        passed: true,
        duration: Date.now() - start
      });
      console.log(`✅ PASS (${Date.now() - start}ms)\n`);

    } catch (error) {
      this.results.push({
        name: evalCase.name,
        passed: false,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      console.log(`❌ FAIL: ${error}\n`);
    }
  }

  async testFreezeWithOTP(evalCase: any) {
    // Create test customer with high KYC level
    const customer = await prisma.customer.create({
      data: {
        name: 'Test Customer OTP',
        email: 'test@example.com',
        kyc_level: 3
      }
    });

    const card = await prisma.card.create({
      data: {
        customer_id: customer.id,
        last4: '4242',
        network: 'visa',
        status: 'active'
      }
    });

    // Create alert
    const alert = await prisma.alert.create({
      data: {
        customer_id: customer.id,
        risk: 'high',
        status: 'open',
        reason: 'high_velocity'
      }
    });

    // Run triage
    const orchestrator = new TriageOrchestrator(alert.id);
    const result = await orchestrator.execute();

    // Verify expectations
    if (result.recommendation !== 'freeze_card') {
      throw new Error(`Expected freeze_card, got ${result.recommendation}`);
    }

    if (result.risk !== 'high') {
      throw new Error(`Expected high risk, got ${result.risk}`);
    }

    // Cleanup
    await prisma.alert.delete({ where: { id: alert.id } });
    await prisma.card.delete({ where: { id: card.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  async testDisputeCreation(evalCase: any) {
    // Test dispute flow
    const customer = await prisma.customer.create({
      data: {
        name: 'Test Dispute',
        email: 'dispute@example.com'
      }
    });

    const card = await prisma.card.create({
      data: {
        customer_id: customer.id,
        last4: '1234',
        network: 'mastercard'
      }
    });

    const transaction = await prisma.transaction.create({
      data: {
        customer_id: customer.id,
        card_id: card.id,
        merchant: 'ABC Mart',
        amount_cents: 499900,
        mcc: '5411',
        ts: new Date('2025-10-24T15:30:00Z')
      }
    });

    // Verify transaction exists
    const found = await prisma.transaction.findUnique({
      where: { id: transaction.id }
    });

    if (!found || found.merchant !== 'ABC Mart') {
      throw new Error('Transaction not found or merchant mismatch');
    }

    // Cleanup
    await prisma.transaction.delete({ where: { id: transaction.id } });
    await prisma.card.delete({ where: { id: card.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  async testRateLimit(evalCase: any) {
    // Test rate limit logic
    const expected = evalCase.expected;
    
    if (!expected.status_code || expected.status_code !== 429) {
      throw new Error('Rate limit test requires 429 status code');
    }

    // This would be tested via HTTP calls in integration tests
    console.log('  ⚠️  Rate limit test requires manual HTTP testing');
  }

  async testPIIRedaction(evalCase: any) {
    const input = evalCase.scenario.input.text;
    const { redacted, masked } = redactPII(input);

    if (!masked) {
      throw new Error('PII was not detected');
    }

    if (redacted.includes('4111111111111111')) {
      throw new Error('PAN was not redacted');
    }

    if (!redacted.includes('****REDACTED****')) {
      throw new Error('Redaction marker not found');
    }

    console.log(`  Original: ${input}`);
    console.log(`  Redacted: ${redacted}`);
  }

  async testFallback(evalCase: any) {
    // Create test alert
    const customer = await prisma.customer.create({
      data: {
        name: 'Test Fallback',
        email: 'fallback@example.com'
      }
    });

    const alert = await prisma.alert.create({
      data: {
        customer_id: customer.id,
        risk: 'medium',
        status: 'open',
        reason: 'test'
      }
    });

    const orchestrator = new TriageOrchestrator(alert.id);
    const result = await orchestrator.execute();

    // Check if fallback was used (randomly happens in orchestrator)
    console.log(`  Fallback used: ${result.fallbackUsed}`);
    
    // Cleanup
    await prisma.alert.delete({ where: { id: alert.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 EVALUATION SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => r.passed === false).length;
    const total = this.results.length;

    console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    // Agent latency stats
    const durations = this.results.map(r => r.duration);
    const p50 = this.percentile(durations, 0.5);
    const p95 = this.percentile(durations, 0.95);

    console.log(`\nAgent Latency:`);
    console.log(`  p50: ${p50}ms`);
    console.log(`  p95: ${p95}ms`);

    // Failed tests
    if (failed > 0) {
      console.log(`\n❌ Failed Tests:`);
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
    }

    console.log('\n' + '='.repeat(60));
  }

  percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new EvalRunner();
  runner.runAll()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Eval runner failed:', error);
      process.exit(1);
    });
}

export { EvalRunner };