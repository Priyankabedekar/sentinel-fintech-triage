import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper: random from array
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Helper: random date within last N days
const randomDate = (daysAgo: number) => {
  const now = Date.now();
  const past = now - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
};

// Realistic data
const MERCHANTS = [
  'Amazon India', 'Flipkart', 'Swiggy', 'Zomato', 'Uber', 'Ola',
  'Big Bazaar', 'DMart', 'BookMyShow', 'Paytm Mall', 'MakeMyTrip',
  'Reliance Digital', 'Croma', 'Decathlon', 'Starbucks', 'McDonald\'s',
  'Domino\'s Pizza', 'KFC', 'Cafe Coffee Day', 'PVR Cinemas'
];

const MCC_CODES = {
  '5411': 'Grocery Stores',
  '5812': 'Restaurants',
  '5814': 'Fast Food',
  '4121': 'Taxi/Rideshare',
  '5542': 'Gas Stations',
  '5311': 'Department Stores',
  '5732': 'Electronics',
  '7832': 'Movies',
  '5999': 'Misc Retail',
  '5912': 'Drug Stores'
};

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata'];

async function main() {
  console.log('🌱 Starting seed...');

  // 1. Create customers
  console.log('Creating 50 customers...');
  const customers = await Promise.all(
    Array.from({ length: 50 }, (_, i) => 
      prisma.customer.create({
        data: {
          name: `Customer ${i + 1}`,
          email: `customer${i + 1}@example.com`,
          phone: `+91${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`,
          kyc_level: pick([1, 2, 3]),
        }
      })
    )
  );

  // 2. Create cards (1-2 per customer)
  console.log('Creating cards...');
  const cards = [];
  for (const customer of customers) {
    const numCards = Math.random() > 0.7 ? 2 : 1;
    for (let i = 0; i < numCards; i++) {
      const card = await prisma.card.create({
        data: {
          customer_id: customer.id,
          last4: String(Math.floor(1000 + Math.random() * 9000)),
          network: pick(['visa', 'mastercard', 'rupay']),
          status: pick(['active', 'active', 'active', 'frozen']), // mostly active
        }
      });
      cards.push(card);
    }
  }

  // 3. Create accounts
  console.log('Creating accounts...');
  await Promise.all(
    customers.map(customer =>
      prisma.account.create({
        data: {
          customer_id: customer.id,
          balance_cents: Math.floor(Math.random() * 10000000), // ₹0-₹100k
          currency: 'INR'
        }
      })
    )
  );

  // 4. Create transactions (200k rows - this takes time!)
  console.log('Creating 200,000 transactions (this may take 2-3 minutes)...');
  
  const BATCH_SIZE = 1000;
  const TOTAL_TXN = 200000;
  
  for (let batch = 0; batch < TOTAL_TXN / BATCH_SIZE; batch++) {
    const txnBatch = [];
    
    for (let i = 0; i < BATCH_SIZE; i++) {
      const customer = pick(customers);
      const card = cards.find(c => c.customer_id === customer.id) || cards[0];
      const mcc = pick(Object.keys(MCC_CODES));
      
      txnBatch.push({
        customer_id: customer.id,
        card_id: card.id,
        mcc,
        merchant: pick(MERCHANTS),
        amount_cents: Math.floor(Math.random() * 50000), // ₹0-₹500
        currency: 'INR',
        ts: randomDate(90), // Last 90 days
        device_id: `device_${Math.floor(Math.random() * 1000)}`,
        country: 'IN',
        city: pick(CITIES),
        status: pick(['completed', 'completed', 'completed', 'pending'])
      });
    }
    
    await prisma.transaction.createMany({ data: txnBatch });
    
    if ((batch + 1) % 10 === 0) {
      console.log(`  ✓ ${(batch + 1) * BATCH_SIZE} transactions created...`);
    }
  }

  // 5. Create alerts (sample)
  console.log('Creating alerts...');
  const recentTxns = await prisma.transaction.findMany({
    take: 100,
    orderBy: { ts: 'desc' }
  });
  
  await Promise.all(
    recentTxns.slice(0, 20).map(txn =>
      prisma.alert.create({
        data: {
          customer_id: txn.customer_id,
          suspect_txn_id: txn.id,
          risk: pick(['low', 'medium', 'high']),
          status: 'open',
          reason: pick(['high_velocity', 'unusual_merchant', 'large_amount'])
        }
      })
    )
  );

  // 6. Create KB docs
  console.log('Creating knowledge base...');
  await prisma.kBDoc.createMany({
    data: [
      {
        title: 'Dispute Process',
        anchor: 'disputes',
        content_text: 'To open a dispute, verify transaction details and customer identity. Reason codes: 10.4 (fraud), 13.1 (services not rendered).'
      },
      {
        title: 'Card Freeze Policy',
        anchor: 'freeze',
        content_text: 'Cards can be frozen immediately. OTP verification required for amounts > ₹50,000 or foreign transactions.'
      },
      {
        title: 'False Positive Handling',
        anchor: 'false-positive',
        content_text: 'If customer confirms transaction is legitimate, mark alert as false positive and whitelist merchant.'
      }
    ]
  });

  // 7. Create policies
  console.log('Creating policies...');
  await prisma.policy.createMany({
    data: [
      {
        code: 'OTP_REQUIRED',
        title: 'OTP Verification Required',
        content_text: 'High-risk actions require OTP verification'
      },
      {
        code: 'FREEZE_LIMIT',
        title: 'Card Freeze Limits',
        content_text: 'Agents can freeze cards up to KYC level 2. Level 3 requires lead approval.'
      }
    ]
  });

  console.log('✅ Seed complete!');
  console.log(`
    📊 Created:
    - ${customers.length} customers
    - ${cards.length} cards
    - ${customers.length} accounts
    - 200,000 transactions
    - 20 alerts
    - 3 KB docs
    - 2 policies
  `);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });