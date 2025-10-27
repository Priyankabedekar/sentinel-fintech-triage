import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const FreezeCardSchema = z.object({
  cardId: z.string().uuid(),
  otp: z.string().length(6).optional(),
  reason: z.string().optional()
});

const OpenDisputeSchema = z.object({
  txnId: z.string().uuid(),
  reasonCode: z.string(),
  description: z.string().optional(),
  confirm: z.boolean().default(false)
});

const MarkFalsePositiveSchema = z.object({
  alertId: z.string().uuid(),
  notes: z.string().optional()
});

// POST /api/action/freeze-card
router.post('/freeze-card', async (req, res) => {
  try {
    const data = FreezeCardSchema.parse(req.body);
    
    // Check if card exists
    const card = await prisma.card.findUnique({
      where: { id: data.cardId },
      include: {
        customer: {
          select: { kyc_level: true }
        }
      }
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Check if already frozen
    if (card.status === 'frozen') {
      return res.json({
        status: 'ALREADY_FROZEN',
        cardId: data.cardId,
        message: 'Card is already frozen'
      });
    }

    // OTP requirement check
    const requiresOtp = card.customer.kyc_level >= 3;
    
    if (requiresOtp && !data.otp) {
      return res.json({
        status: 'PENDING_OTP',
        cardId: data.cardId,
        message: 'OTP verification required for high-value accounts',
        requiresOtp: true
      });
    }

    // Validate OTP (simple check - in production use real OTP service)
    if (requiresOtp && data.otp !== '123456') {
      return res.status(400).json({
        error: 'Invalid OTP',
        status: 'OTP_FAILED'
      });
    }

    // Freeze the card
    const updatedCard = await prisma.card.update({
      where: { id: data.cardId },
      data: { status: 'frozen' }
    });

    // Create case event for audit
    const caseRecord = await prisma.case.create({
      data: {
        customer_id: card.customer_id,
        type: 'card_freeze',
        status: 'completed',
        reason_code: data.reason || 'suspected_fraud'
      }
    });

    await prisma.caseEvent.create({
      data: {
        case_id: caseRecord.id,
        actor: 'system',
        action: 'card_frozen',
        payload_json: {
          cardId: data.cardId,
          cardLast4: card.last4,
          otpVerified: requiresOtp
        }
      }
    });

    res.json({
      status: 'FROZEN',
      cardId: updatedCard.id,
      cardLast4: card.last4,
      caseId: caseRecord.id,
      message: 'Card successfully frozen',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Freeze card error:', error);
    res.status(500).json({ error: 'Failed to freeze card' });
  }
});

// POST /api/action/open-dispute
router.post('/open-dispute', async (req, res) => {
  try {
    const data = OpenDisputeSchema.parse(req.body);

    if (!data.confirm) {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Set confirm: true to open dispute'
      });
    }

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: data.txnId },
      include: {
        customer: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Check if dispute already exists
    const existingDispute = await prisma.case.findFirst({
      where: {
        txn_id: data.txnId,
        type: 'dispute',
        status: { in: ['open', 'investigating'] }
      }
    });

    if (existingDispute) {
      return res.json({
        status: 'ALREADY_EXISTS',
        caseId: existingDispute.id,
        message: 'Dispute already exists for this transaction'
      });
    }

    // Create dispute case
    const disputeCase = await prisma.case.create({
      data: {
        customer_id: transaction.customer_id,
        txn_id: data.txnId,
        type: 'dispute',
        status: 'open',
        reason_code: data.reasonCode
      }
    });

    // Create case event
    await prisma.caseEvent.create({
      data: {
        case_id: disputeCase.id,
        actor: 'system',
        action: 'dispute_opened',
        payload_json: {
          txnId: data.txnId,
          merchant: transaction.merchant,
          amount: transaction.amount_cents,
          reasonCode: data.reasonCode,
          description: data.description
        }
      }
    });

    res.json({
      status: 'OPEN',
      caseId: disputeCase.id,
      txnId: data.txnId,
      merchant: transaction.merchant,
      amount: transaction.amount_cents,
      message: 'Dispute case opened successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Open dispute error:', error);
    res.status(500).json({ error: 'Failed to open dispute' });
  }
});

// POST /api/action/mark-false-positive
router.post('/mark-false-positive', async (req, res) => {
  try {
    const data = MarkFalsePositiveSchema.parse(req.body);

    // Get alert
    const alert = await prisma.alert.findUnique({
      where: { id: data.alertId },
      include: {
        customer: {
          select: { id: true, name: true }
        }
      }
    });

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Update alert status
    const updatedAlert = await prisma.alert.update({
      where: { id: data.alertId },
      data: { status: 'false_positive' }
    });

    // Create case for audit trail
    const caseRecord = await prisma.case.create({
      data: {
        customer_id: alert.customer_id,
        type: 'false_positive',
        status: 'closed',
        reason_code: 'verified_legitimate'
      }
    });

    await prisma.caseEvent.create({
      data: {
        case_id: caseRecord.id,
        actor: 'system',
        action: 'marked_false_positive',
        payload_json: {
          alertId: data.alertId,
          originalRisk: alert.risk,
          notes: data.notes
        }
      }
    });

    res.json({
      status: 'CLOSED',
      alertId: updatedAlert.id,
      caseId: caseRecord.id,
      message: 'Alert marked as false positive',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Mark false positive error:', error);
    res.status(500).json({ error: 'Failed to mark false positive' });
  }
});

export default router;