import { Request, Response, NextFunction } from 'express';
import { rateLimiter } from '../lib/redis.js';

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Use IP as client identifier (in production, use API key or user ID)
  const clientId = req.ip || 'unknown';
  
  const result = await rateLimiter.checkLimit(clientId);
  
  if (!result.allowed) {
    res.set('Retry-After', result.retryAfter?.toString() || '1');
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: result.retryAfter,
      message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`
    });
  }
  
  next();
}