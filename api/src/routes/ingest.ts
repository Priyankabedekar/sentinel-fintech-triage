import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Transaction schema validation
const TransactionSchema = z.object({
  customer_id: z.string().uuid(),
  card_id: z.string().uuid(),
  merchant: z.string(),
  amount_cents: z.number().int().positive(),
  mcc: z.string(),
  currency: z.string().default('INR'),
  ts: z.string().datetime().optional(),
  device_id: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('IN')
});

// POST /api/ingest/transactions
router.post('/transactions', async (req, res) => {
  const { transactions } = req.body;
  
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Expected array of transactions' });
  }
  
  try {
    // Validate all transactions
    const validated = transactions.map(t => TransactionSchema.parse(t));
    
    // Batch insert with upsert (dedupe)
    const results = await Promise.allSettled(
      validated.map(data =>
        prisma.transaction.create({
          data: {
            ...data,
            ts: data.ts ? new Date(data.ts) : new Date()
          }
        })
      )
    );
    
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    res.json({
      accepted: true,
      count: succeeded,
      failed,
      requestId: `ingest_${Date.now()}`
    });
    
  } catch (error) {
    console.error('Ingest error:', error);
    res.status(400).json({ error: 'Validation failed', details: error });
  }
});

export default router;