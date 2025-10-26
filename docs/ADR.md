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

## ADR-005: Prometheus Metrics over Custom Logging

**Decision:** Use Prometheus client to expose metrics at `/metrics` endpoint.

**Rationale:**
- **Industry standard:** Works with Grafana, Datadog, etc.
- **Pull-based:** No need to push metrics to external service
- **Efficient:** In-memory aggregation, minimal overhead
- **Rich types:** Counters, gauges, histograms, summaries
- **Labels:** Multi-dimensional metrics (method, route, status)

**Metrics Exposed:**
````
api_request_latency_ms{method, route, status} (histogram)
rate_limit_block_total{client} (counter)
agent_latency_ms{agent, ok} (histogram)
tool_call_total{tool, ok} (counter)

---

## ADR-006: Server-Side Analytics over Client-Side

**Decision:** Calculate insights (categories, trends, anomalies) on the backend.

**Rationale:**
- **Security:** Don't expose all raw transactions to frontend
- **Performance:** Process 200k rows on server, send ~100 aggregated data points
- **Consistency:** Single source of truth for business logic
- **Caching potential:** Can cache insights for minutes

**Trade-offs:**
- Higher server CPU usage
- Cannot filter/drill-down without API call
- Client is "dumb" (just displays data)

**Future Optimization:**
- Cache insights for 5 minutes (Redis)
- Incremental updates (process only new transactions)
- Pre-aggregate in database (materialized views)

---