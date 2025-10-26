## 🚀 Setup

### 1. Clone the repository
```bash
git clone <your-repo>
cd fintech-case-console
```

### 2. Create environment file
```bash
cp .env.example .env
# Edit .env and set your passwords
```

### 3. Start services
```bash
docker compose up -d
```

### 4. Verify
```bash
docker compose ps
# All services should be "healthy"
```

## 🔑 Environment Variables

Copy `.env.example` to `.env` and configure:
- `POSTGRES_PASSWORD` - Database password (change for production!)
- `DATABASE_URL` - Full connection string
- Other settings as needed

## Database Schema

### Schema Highlights
- **12 tables** with proper relationships and indexes
- **Keyset pagination** for transactions (handles 1M+ rows efficiently)
- **Audit trail** via case_events table
- **Observability** via triage_runs and agent_traces

### Key Indexes
```sql
-- Critical for performance on 200k+ transactions
CREATE INDEX idx_customer_ts ON transactions(customer_id, ts DESC);
CREATE INDEX idx_merchant ON transactions(merchant);
CREATE INDEX idx_mcc ON transactions(mcc);
```

### Seed Data
- 50 customers
- ~75 cards
- 200,000 transactions (90 days)
- 20 alerts
- KB docs and policies

### Database Commands
```bash
# Run migrations
npm run db:migrate

# Seed database
npm run db:seed

# Open visual editor
npm run db:studio

# Reset database
npm run db:reset
```

### API Endpoints Built
- `GET /api/customer/:id/transactions?cursor=&limit=` - Keyset pagination
- `GET /api/customer/:id/profile` - Customer details

### Performance
Keyset pagination ensures O(log n) queries even with 1M+ transactions.