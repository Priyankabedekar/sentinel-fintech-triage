// PAN (Primary Account Number) regex: 13-19 digits
const PAN_REGEX = /\b\d{13,19}\b/g;

// Email regex
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// SSN/Aadhaar-like patterns
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const AADHAAR_REGEX = /\b\d{4}\s\d{4}\s\d{4}\b/g;

export function redactPII(text: string): { redacted: string; masked: boolean } {
  let redacted = text;
  let masked = false;

  // Redact PANs (card numbers)
  if (PAN_REGEX.test(redacted)) {
    redacted = redacted.replace(PAN_REGEX, '****REDACTED****');
    masked = true;
  }

  // Redact emails (partial)
  if (EMAIL_REGEX.test(redacted)) {
    redacted = redacted.replace(EMAIL_REGEX, (email) => {
      const [username, domain] = email.split('@');
      return `${username.slice(0, 2)}***@${domain}`;
    });
    masked = true;
  }

  // Redact SSN/Aadhaar
  if (SSN_REGEX.test(redacted) || AADHAAR_REGEX.test(redacted)) {
    redacted = redacted.replace(SSN_REGEX, '***-**-****');
    redacted = redacted.replace(AADHAAR_REGEX, '**** **** ****');
    masked = true;
  }

  return { redacted, masked };
}

export function redactObject(obj: any): { redacted: any; masked: boolean } {
  let globalMasked = false;

  function redactRecursive(value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      const { redacted, masked } = redactPII(value);
      if (masked) globalMasked = true;
      return redacted;
    }

    if (Array.isArray(value)) {
      return value.map(redactRecursive);
    }

    if (value && typeof value === 'object') {
      const redactedObj: any = {};
      for (const [key, val] of Object.entries(value)) {
        // Redact sensitive field names
        if (key.toLowerCase().includes('pan')) {
          if (typeof val === 'string') {
            const { redacted, masked } = redactPII(val);
            if (masked) globalMasked = true;
            redactedObj[key] = redacted;
          } else {
            redactedObj[key] = '****REDACTED****';
            globalMasked = true;
          }
        } else {
          redactedObj[key] = redactRecursive(val);
        }
      }
      return redactedObj;
    }

    return value;
  }

  const redacted = redactRecursive(obj);
  return { redacted, masked: globalMasked };
}

// Mask customer ID for logging
export function maskCustomerId(id: string): string {
  if (!id || id.length < 8) return '****';
  return `${id.slice(0, 4)}****${id.slice(-4)}`;
}