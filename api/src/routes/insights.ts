import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/insights/:customerId/summary
router.get('/:customerId/summary', async (req, res) => {
  const { customerId } = req.params;
  const { days = '90' } = req.query;
  
  const daysAgo = parseInt(days as string);
  const fromDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  
  try {
    // Get transactions for analysis
    const transactions = await prisma.transaction.findMany({
      where: {
        customer_id: customerId,
        ts: { gte: fromDate }
      },
      orderBy: { ts: 'desc' }
    });
    
    if (transactions.length === 0) {
      return res.json({
        totalSpend: 0,
        transactionCount: 0,
        topMerchants: [],
        categories: [],
        monthlyTrend: [],
        anomalies: []
      });
    }
    
    // Total spend
    const totalSpend = transactions.reduce((sum, t) => sum + t.amount_cents, 0);
    
    // Top merchants
    const merchantMap = new Map<string, { count: number; total: number }>();
    transactions.forEach(t => {
      const existing = merchantMap.get(t.merchant) || { count: 0, total: 0 };
      merchantMap.set(t.merchant, {
        count: existing.count + 1,
        total: existing.total + t.amount_cents
      });
    });
    
    const topMerchants = Array.from(merchantMap.entries())
      .map(([merchant, data]) => ({ merchant, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    
    // Categories (by MCC)
    const mccMap = new Map<string, number>();
    transactions.forEach(t => {
      mccMap.set(t.mcc, (mccMap.get(t.mcc) || 0) + t.amount_cents);
    });
    
    const categories = Array.from(mccMap.entries())
      .map(([mcc, total]) => ({
        mcc,
        name: getMCCName(mcc),
        total,
        percentage: (total / totalSpend * 100).toFixed(1)
      }))
      .sort((a, b) => b.total - a.total);
    
    // Monthly trend
    const monthlyMap = new Map<string, number>();
    transactions.forEach(t => {
      const month = t.ts.toISOString().slice(0, 7); // YYYY-MM
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + t.amount_cents);
    });
    
    const monthlyTrend = Array.from(monthlyMap.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    // Simple anomaly detection (amounts > 3x average)
    const avgAmount = totalSpend / transactions.length;
    const anomalies = transactions
      .filter(t => t.amount_cents > avgAmount * 3)
      .map(t => ({
        id: t.id,
        merchant: t.merchant,
        amount: t.amount_cents,
        ts: t.ts,
        zScore: ((t.amount_cents - avgAmount) / avgAmount).toFixed(2)
      }))
      .slice(0, 5);
    
    res.json({
      totalSpend,
      transactionCount: transactions.length,
      avgTransaction: Math.round(avgAmount),
      topMerchants,
      categories,
      monthlyTrend,
      anomalies
    });
    
  } catch (error) {
    console.error('Insights error:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

function getMCCName(mcc: string): string {
  const mccNames: Record<string, string> = {
    '5411': 'Grocery',
    '5812': 'Restaurants',
    '5814': 'Fast Food',
    '4121': 'Rideshare',
    '5542': 'Gas Stations',
    '5311': 'Department Stores',
    '5732': 'Electronics',
    '7832': 'Entertainment',
    '5999': 'Retail',
    '5912': 'Pharmacy'
  };
  return mccNames[mcc] || 'Other';
}

export default router;