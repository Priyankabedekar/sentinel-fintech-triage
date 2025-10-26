# Architecture Decision Records

## ADR-001: Keyset Pagination over Offset

**Decision:** Use keyset (cursor-based) pagination for transaction queries.

**Rationale:**
- Offset pagination scans all skipped rows: `OFFSET 10000` = scan 10k rows
- Keyset uses index: `WHERE (ts, id) < (cursor_ts, cursor_id)` = O(log n)
- Stable results during concurrent writes
- Required for sub-100ms p95 latency at 1M+ rows

**Trade-offs:**
- Cannot jump to arbitrary page number
- Requires composite index on (customer_id, ts, id)
- More complex to implement

**Implementation:**
```typescript
// Cursor format: "timestamp_id"
const [ts, id] = cursor.split('_');
where.OR = [
  { ts: { lt: new Date(ts) } },
  { ts: new Date(ts), id: { lt: id } }
];
```

---

## ADR-002: Prisma ORM

**Decision:** Use Prisma for database access.

**Rationale:**
- Type-safe queries (TypeScript native)
- Automatic migrations
- Visual studio (prisma studio)
- Great DX for rapid development

**Trade-offs:**
- Slightly higher overhead vs raw SQL
- Learning curve for complex queries

---

## ADR-003: Composite Indexes

**Decision:** Create multi-column indexes for common query patterns.

**Rationale:**
- `(customer_id, ts DESC)` - supports customer timeline queries
- `(merchant)` - supports merchant analysis
- `(mcc)` - supports category grouping
- Index-only scans avoid table lookups

**Trade-offs:**
- Increased storage (20-30% overhead)
- Slower writes (minimal impact at our scale)