import { Request, Response, NextFunction } from 'express';
import { redactObject } from '../lib/redactor.js';

// Redact request bodies before processing
export function redactRequestBody(req: Request, res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    const { redacted, masked } = redactObject(req.body);
    
    if (masked) {
      console.warn('PII detected and redacted in request body', {
        path: req.path,
        method: req.method,
        masked: true
      });
    }
    
    req.body = redacted;
  }
  
  next();
}

// Redact response bodies before sending
export function redactResponseBody(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  
  res.json = function (body: any) {
    const { redacted, masked } = redactObject(body);
    
    if (masked) {
      console.warn('PII detected and redacted in response body', {
        path: req.path,
        method: req.method,
        masked: true
      });
    }
    
    return originalJson(redacted);
  };
  
  next();
}

// API Key validation
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }
  
  next();
}

// Idempotency key handling
const idempotencyCache = new Map<string, any>();

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  if (!idempotencyKey) {
    return next();
  }
  
  // Check cache for previous result
  if (idempotencyCache.has(idempotencyKey)) {
    const cachedResult = idempotencyCache.get(idempotencyKey);
    return res.status(200).json(cachedResult);
  }
  
  // Store result after response
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    idempotencyCache.set(idempotencyKey, body);
    // Clear after 1 hour
    setTimeout(() => idempotencyCache.delete(idempotencyKey), 60 * 60 * 1000);
    return originalJson(body);
  };
  
  next();
}