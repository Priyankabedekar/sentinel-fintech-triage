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

---

## ADR-004: Token Bucket Rate Limiting with Redis

**Decision:** Implement token bucket algorithm using Redis sorted sets.

**Rationale:**
- **Distributed:** Multiple API instances share rate limit state
- **Atomic:** MULTI/EXEC ensures race-condition-free operations
- **Efficient:** O(log n) sorted set operations
- **Self-cleaning:** TTL automatically removes old data
- **Fail-open:** On Redis error, allow request (availability over strict limiting)

**Implementation:**
```typescript
// Sorted set: score = timestamp, member = unique ID
redis.zadd('ratelimit:client', timestamp, `${timestamp}-${random}`)
redis.zremrangebyscore('ratelimit:client', 0, timestamp - window)
redis.zcard('ratelimit:client') // Count tokens used
```

**Alternatives Considered:**
- **Leaky bucket:** More complex, no significant benefit
- **Fixed window:** Burst at window boundaries
- **Sliding window log:** Same as our implementation
- **In-memory:** Doesn't work with multiple instances

**Trade-offs:**
- Requires Redis (adds dependency)
- Network call per request (~2-5ms overhead)
- Fail-open on Redis error (may allow excess traffic)

---