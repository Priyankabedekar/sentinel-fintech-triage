# Architecture Decision Records

## ADR-001: Keyset Pagination over Offset

**Context:** Need to paginate millions of transactions efficiently with stable results during concurrent writes.

**Decision:** Use keyset (cursor-based) pagination with composite `(ts, id)` cursor.

**Rationale:**
- **Performance**: O(log n) via index vs O(n) for large offsets
- **Stability**: Results don't shift during concurrent inserts
- **Scalability**: Works efficiently at 1M+ rows
- **Index-friendly**: Leverages composite index `(customer_id, ts DESC, id DESC)`

**Implementation:**
```sql
SELECT * FROM transactions
WHERE customer_id = $1
  AND (ts, id) < ($cursor_ts, $cursor_id)
ORDER BY ts DESC, id DESC
LIMIT 20;
```

**Trade-offs:**
- ❌ Cannot jump to arbitrary page
- ❌ More complex than offset
- ✅ Consistent performance regardless of dataset size
- ✅ No phantom reads during pagination

**Benchmark (200k rows):**
- Keyset: 45ms (p95: 89ms)
- Offset 10k: 450ms (scans all skipped rows)

---

## ADR-002: Server-Sent Events over WebSocket

**Context:** Stream triage updates from backend to frontend in real-time.

**Decision:** Use SSE (Server-Sent Events) instead of WebSocket.

**Rationale:**
- **Simplicity**: Built on HTTP, no special protocol
- **Unidirectional**: We only need server → client (no client → server during stream)
- **Auto-reconnect**: Browser handles reconnection automatically
- **HTTP/2 friendly**: Better multiplexing than WebSocket
- **Firewall friendly**: Works through HTTP proxies

**Implementation:**
```typescript
// Backend
res.setHeader('Content-Type', 'text/event-stream');
res.write(`data: ${JSON.stringify(event)}\n\n`);

// Frontend
const es = new EventSource('/triage/run_123/stream');
es.onmessage = (e) => handleEvent(JSON.parse(e.data));
```

**Trade-offs:**
- ❌ Text-only (JSON encoded)
- ❌ No bi-directional communication
- ✅ Simpler implementation
- ✅ Better error handling
- ✅ Works with existing HTTP infrastructure

**When to use WebSocket instead:**
- Need bidirectional real-time communication
- Binary data (video, audio)
- Real-time gaming

---

## ADR-003: Token Bucket Rate Limiting with Redis

**Context:** Protect API from abuse across multiple instances.

**Decision:** Implement distributed token bucket using Redis sorted sets.

**Rationale:**
- **Distributed**: All API instances share same limit via Redis
- **Atomic**: Redis MULTI/EXEC ensures race-condition-free operations
- **Efficient**: O(log n) sorted set operations
- **Self-cleaning**: TTL automatically removes old entries
- **Sliding window**: More accurate than fixed window

**Implementation:**
```typescript
const key = `ratelimit:${clientId}`;
const now = Date.now();
const window = 1000; // 1 second

redis.multi()
  .zremrangebyscore(key, 0, now - window)  // Remove old
  .zadd(key, now, `${now}-${random}`)      // Add current
  .zcard(key)                               // Count tokens
  .expire(key, 2)                           // Auto-cleanup
  .exec();
```

**Trade-offs:**
- ❌ Redis dependency (single point of failure)
- ❌ Network latency (~2-5ms per request)
- ✅ Shared state across instances
- ✅ Accurate rate limiting
- ✅ Configurable per client/route

**Fail-open strategy:** On Redis error, allow request (availability over strict enforcement).

---

## ADR-004: PII Redaction at Edge

**Context:** Ensure sensitive data never appears in logs, traces, or responses.

**Decision:** Scan and redact all request/response bodies before processing.

**Patterns Detected:**
- PANs: 13-19 digit sequences → `****REDACTED****`
- Emails: `user@domain.com` → `us***@domain.com`
- SSN/Aadhaar: `123-45-6789` → `***-**-****`

**Implementation:**
```typescript
// Middleware applied globally
app.use(redactRequestBody);
app.use(redactResponseBody);

// Logs include masked flag
logger.info({ masked: true, event: 'pii_detected' });
```

**Trade-offs:**
- ❌ CPU overhead (~1-2ms per request)
- ❌ May over-redact (false positives)
- ✅ Defense in depth (even if logging breaks)
- ✅ Compliance (GDPR, PCI-DSS)
- ✅ Audit trail shows redaction occurred

**Alternative considered:** Database-level encryption (rejected: still visible in logs/traces).

---

## ADR-005: Idempotency via Headers

**Context:** Prevent duplicate actions (double charges, multiple freezes).

**Decision:** Use `Idempotency-Key` header with in-memory cache.

**Implementation:**
```typescript
const key = req.headers['idempotency-key'];
if (cache.has(key)) return cache.get(key);

// Process request
const result = await processAction();

cache.set(key, result, { ttl: 3600 });
return result;
```

**Trade-offs:**
- ❌ Memory usage (mitigated with TTL + LRU eviction)
- ❌ Loses state on restart (acceptable for 1-hour TTL)
- ✅ Simple implementation
- ✅ No database overhead
- ✅ Works across multiple requests

**Production upgrade:** Use Redis for persistent cache across instances.

---

## ADR-006: Prisma ORM over Raw SQL

**Context:** Balance type safety, productivity, and performance.

**Decision:** Use Prisma for all database access.

**Rationale:**
- **Type safety**: Generated types from schema
- **Migrations**: Version-controlled schema changes
- **Productivity**: Auto-completion, refactoring support
- **Prisma Studio**: Visual database browser
- **Query builder**: Prevents SQL injection

**Trade-offs:**
- ❌ Slight overhead vs raw SQL (~5-10%)
- ❌ Learning curve for complex queries
- ✅ Faster development
- ✅ Safer (injection-proof)
- ✅ Better DX (developer experience)

**When we use raw SQL:**
- Complex analytical queries
- Performance-critical paths
- Database-specific features (e.g., full-text search)

---

## ADR-007: Event Sourcing for Audit Trail

**Context:** Maintain immutable audit log of all actions.

**Decision:** Store every action as event in `case_events` table.

**Schema:**
```sql
case_events(
  id pk,
  case_id fk,
  ts timestamptz,
  actor text,         -- 'system' or agent_id
  action text,        -- 'card_frozen', 'dispute_opened'
  payload_json jsonb  -- Full context (redacted)
);
```

**Benefits:**
- **Immutable**: Never UPDATE or DELETE events
- **Traceable**: Full history of who did what when
- **Debuggable**: Replay events to understand issues
- **Compliance**: Required for financial audits

**Trade-offs:**
- ❌ Storage grows linearly (mitigated with partitioning)
- ❌ No "current state" query (need aggregation)
- ✅ Complete audit trail
- ✅ Time-travel queries
- ✅ Event replay for debugging

---

## ADR-008: Fail-Open Security Model

**Context:** Balance security with availability.

**Decision:** On infrastructure failure (Redis down), allow requests but log warnings.

**Examples:**
- Rate limiter: Allow request if Redis unavailable
- PII redaction: Continue if regex fails (log error)
- Metrics: Drop metric if Prometheus unreachable

**Rationale:**
- **Availability**: Don't block critical user actions
- **Graceful degradation**: Partial functionality better than none
- **Monitoring**: Alerts on degraded mode

**Trade-offs:**
- ❌ Security weakened during failures
- ❌ May allow abuse during Redis outage
- ✅ Users can complete critical actions
- ✅ Clear alerts on degraded state

**When to fail-closed:**
- Authentication (must verify credentials)
- Authorization (must check permissions)
- Payment processing (must prevent double charges)

---

## ADR-009: Multi-Agent Orchestration

**Context:** Complex decision-making requires multiple specialized agents.

**Decision:** Sequential orchestrator with retry + fallback.

**Flow:**
```
getProfile → recentTx → riskSignals → kbLookup → decide
              ↓              ↓             ↓
           retry(2)      retry(2)      fallback
```

**Agent Guardrails:**
- Timeout: 1 second per agent
- Retries: Max 2 with exponential backoff (150ms, 400ms)
- Fallback: Medium risk + `service_unavailable` reason
- Total budget: 5 seconds for entire flow

**Trade-offs:**
- ❌ Sequential (slower than parallel)
- ❌ Single failure blocks downstream
- ✅ Easier to debug (clear order)
- ✅ Deterministic fallback
- ✅ Bounded execution time

**Future optimization:** Parallel execution with dependency graph.

---

## ADR-010: Structured Logging with Context

**Context:** Enable fast debugging in production.

**Decision:** JSON structured logs with request context.

**Format:**
```json
{
  "ts": "2025-10-25T12:34:56Z",
  "level": "info",
  "requestId": "req_abc123",
  "runId": "run_def456",
  "customerId_masked": "cust****5678",
  "event": "decision_finalized",
  "masked": false,
  "duration_ms": 1247
}
```

**Benefits:**
- **Searchable**: Query by requestId, customerId, event
- **Traceable**: Follow request through entire flow
- **Privacy**: Masked customer IDs
- **Performance**: Duration tracking

**Tools:**
- Elasticsearch/Kibana for search
- Grafana Loki for log aggregation
- DataDog/New Relic for APM

---

## ADR-011: Composite Indexes for Time-Series Queries

**Context:** Fast customer transaction timelines.

**Decision:** Create composite index `(customer_id, ts DESC, id DESC)`.

**Query pattern:**
```sql
-- Lightning fast with index
SELECT * FROM transactions
WHERE customer_id = $1
ORDER BY ts DESC, id DESC
LIMIT 20;

-- Index scan: 42ms for 200k rows
```

**Index Strategy:**
- `(customer_id, ts DESC)`: Customer timelines
- `(merchant)`: Merchant analysis
- `(mcc)`: Category grouping
- `(ts DESC)`: Recent transactions

**Trade-offs:**
- ❌ Storage overhead (~20-30%)
- ❌ Slower writes (update 4 indexes)
- ✅ 10-100x faster reads
- ✅ Consistent performance at scale

**Monitoring:** Use `pg_stat_user_indexes` to verify index usage.

---

## ADR-012: Client-Side Routing (CSR) over SSR

**Context:** Choose rendering strategy for React app.

**Decision:** Client-Side Rendering (Vite + React Router).

**Rationale:**
- **Simpler deployment**: Static files + CDN
- **Better UX**: No page refreshes, instant navigation
- **Offline-capable**: Service worker potential
- **Developer experience**: Hot reload, fast builds

**Trade-offs:**
- ❌ Slower initial load (bundle size)
- ❌ No SEO (not relevant for internal tool)
- ✅ Faster navigation after load
- ✅ Simpler backend (no SSR logic)
- ✅ Better for real-time updates (SSE)

**When to use SSR:**
- Public marketing pages (SEO)
- Content-heavy sites
- Slower client devices

---

## Summary: Key Takeaways

1. **Performance**: Keyset pagination + composite indexes = sub-100ms at 1M rows
2. **Scalability**: Distributed rate limiting via Redis
3. **Reliability**: Fail-open + circuit breakers + retries
4. **Security**: Edge redaction + idempotency + audit trail
5. **Observability**: Structured logs + Prometheus metrics + SSE traces
6. **Developer Experience**: Prisma + TypeScript + Hot reload