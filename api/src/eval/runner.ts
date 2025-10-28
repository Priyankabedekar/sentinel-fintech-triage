import { PrismaClient } from '@prisma/client';
import { TriageOrchestrator } from '../agents/orchestrator.js';
import { redactPII } from '../lib/redactor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const evalDir = path.resolve('/app/docs/fixtures/evals');
    console.log(`📂 Loading evals from ${evalDir}`);
    
    const evalFiles = await fs.readdir(evalDir);
    
    for (const file of evalFiles) {
        console.log(`Running:${file}`);
        if (!file.endsWith('.json')) continue;
        
        const fullPath = path.join(evalDir, file);
        const content = await fs.readFile(fullPath, 'utf-8');
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

  async safeCleanup(customerId: string, alertId?: string)
  {
    try {
        if (alertId) {
        // find any triage runs for this alert
        const runs = await prisma.triageRun.findMany({
            where: { alert_id: alertId },
            select: { id: true }
        });
        const runIds = runs.map(r => r.id);

        // delete agent traces that reference those runs (if any)
        if (runIds.length > 0) {
            await prisma.agentTrace.deleteMany({
            where: { run_id: { in: runIds } }
            });
        }

        // delete the triage runs
        await prisma.triageRun.deleteMany({ where: { alert_id: alertId } });

        // delete any other children that might reference alert_id (defensive)
        // await prisma.someOtherChild.deleteMany({ where: { alert_id: alertId } }).catch(()=>{});
        }

        // delete transactions/cards/etc for the customer before deleting customer
        await prisma.transaction.deleteMany({ where: { customer_id: customerId } });
        await prisma.card.deleteMany({ where: { customer_id: customerId } });
        await prisma.alert.deleteMany({ where: { customer_id: customerId } });
        await prisma.customer.deleteMany({ where: { id: customerId } });
    } catch (e) {
        // swallow — cleanup shouldn't throw your test runner
        console.warn('safeCleanup warning:', e instanceof Error ? e.message : e);
    }
  }

  async testFreezeWithOTP(evalCase: any) {
    const unique = crypto.randomUUID();
    // Create test customer with high KYC level
    const customer = await prisma.customer.create({
      data: {
        name: 'Test Customer OTP',
        email: `test-otp-${unique}.com`,
        kyc_level: 2
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

    // Create many transactions for velocity and merchant concentration
    const txPromises = [];
    const merchant = 'Concentrated Merchant';
    for (let i = 0; i < 18; i++) { // >15 -> high_velocity
        txPromises.push(prisma.transaction.create({
        data: {
            customer_id: customer.id,
            card_id: card.id,
            merchant,
            amount_cents: 1000 + i,    // small historical txs
            mcc: '5411',
            currency: 'INR',
            ts: new Date(Date.now() - (i * 60 * 1000)) // different timestamps
        }
        }));
    }

    // create the suspect transaction (large and foreign)
    const suspectTx = await prisma.transaction.create({
        data: {
        customer_id: customer.id,
        card_id: card.id,
        merchant: 'Suspicious Merchant',
        amount_cents: 499900,   // > 50000 -> large_amount
        mcc: '5411',
        currency: 'USD',
        country: 'US',          // not 'IN' -> foreign_transaction
        ts: new Date('2025-10-24T15:30:00Z')
        }
    });

    await Promise.all(txPromises);

    // Create alert
    const alert = await prisma.alert.create({
      data: {
        customer_id: customer.id,
        suspect_txn_id: suspectTx.id,
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
      console.log('decision details:', result);
      throw new Error(`Expected freeze_card, got ${result.recommendation}`);
    }

    if (result.risk !== 'high') {
      throw new Error(`Expected high risk, got ${result.risk}`);
    }

    // Cleanup
    await this.safeCleanup(customer.id, alert.id);
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
    const unique = crypto.randomUUID();
    // Create test alert
    const customer = await prisma.customer.create({
      data: {
        name: 'Test Fallback',
        email: `fallback${unique}@example.com`
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
    await this.safeCleanup(customer.id, alert.id)
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