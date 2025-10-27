import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/alerts
router.get('/', async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { status: 'open' },
      include: {
        customer: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { created_at: 'desc' },
      take: 50
    });

    res.json({ alerts });
  } catch (error) {
    console.error('Alerts error:', error);
    res.status(500).json({ error: 'Failed to load alerts' });
  }
});

export default router;