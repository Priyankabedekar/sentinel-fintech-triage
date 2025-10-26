import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

// Token bucket rate limiter
export class RateLimiter {
  private capacity: number;
  private refillRate: number;
  private window: number;

  constructor(capacity = 5, windowSeconds = 1) {
    this.capacity = capacity;
    this.refillRate = capacity / windowSeconds;
    this.window = windowSeconds;
  }

  async checkLimit(key: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    const windowStart = now - this.window * 1000;
    
    // Redis sorted set: score = timestamp, member = unique request ID
    const redisKey = `ratelimit:${key}`;
    
    try {
      // Clean old entries and add new request
      const multi = redis.multi();
      multi.zremrangebyscore(redisKey, 0, windowStart);
      multi.zadd(redisKey, now, `${now}-${Math.random()}`);
      multi.zcard(redisKey);
      multi.expire(redisKey, this.window * 2);
      
      const results = await multi.exec();
      const count = results?.[2]?.[1] as number;
      
      if (count > this.capacity) {
        // Calculate retry after
        const oldestTimestamp = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
        const oldestTime = parseInt(oldestTimestamp[1] || '0');
        const retryAfter = Math.ceil((oldestTime + this.window * 1000 - now) / 1000);
        
        return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
      }
      
      return { allowed: true };
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open (allow request on Redis error)
      return { allowed: true };
    }
  }
}

export const rateLimiter = new RateLimiter(5, 1); // 5 requests per second