import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/customer/:id/transactions
// Keyset pagination for performance
router.get('/:id/transactions', async (req, res) => {
  const { id } = req.params;
  const { cursor, limit = '20', from, to } = req.query;
  
  const limitNum = Math.min(parseInt(limit as string), 100);
  
  try {
    // Build where clause
    const where: any = { customer_id: id };
    
    // Date filters
    if (from) where.ts = { ...where.ts, gte: new Date(from as string) };
    if (to) where.ts = { ...where.ts, lte: new Date(to as string) };
    
    // Keyset cursor
    if (cursor) {
      const [ts, txnId] = (cursor as string).split('_');
      where.OR = [
        { ts: { lt: new Date(ts) } },
        { ts: new Date(ts), id: { lt: txnId } }
      ];
    }
    
    // Query with index
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: [
        { ts: 'desc' },
        { id: 'desc' }
      ],
      take: limitNum + 1, // Take one extra to check if more exist
      include: {
        card: {
          select: { last4: true, network: true }
        }
      }
    });
    
    // Check if more results exist
    const hasMore = transactions.length > limitNum;
    const items = hasMore ? transactions.slice(0, limitNum) : transactions;
    
    // Generate next cursor
    let nextCursor = null;
    if (hasMore) {
      const last = items[items.length - 1];
      nextCursor = `${last.ts.toISOString()}_${last.id}`;
    }
    
    res.json({
      items,
      nextCursor,
      hasMore
    });
    
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /api/customer/:id/profile
router.get('/:id/profile', async (req, res) => {
  const { id } = req.params;
  
  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        cards: true,
        accounts: true
      }
    });
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;