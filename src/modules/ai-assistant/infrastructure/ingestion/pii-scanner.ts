export interface PiiFinding {
  rule: string;
  excerpt: string;
  severity: 'low' | 'medium' | 'high';
}

const RULES: Array<{
  rule: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high';
}> = [
  {
    rule: 'pii_email',
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    severity: 'medium',
  },
  {
    rule: 'pii_phone',
    // Digits with single separators; the ISO-date false positive is filtered
    // in `looksLikePhone` (the docs header carries a "Last Updated" date).
    pattern: /(?<!\d)\+?\d{1,4}(?:[ .-]?\d{2,4}){1,5}(?!\d)/g,
    severity: 'medium',
  },
  {
    rule: 'pii_address',
    pattern:
      /\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|lane|ln|close|crescent|court|ct)\b/gi,
    severity: 'high',
  },
  {
    rule: 'pii_patient_id',
    pattern:
      /\b(?:pet|cli|rx|ord)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    severity: 'high',
  },
  {
    rule: 'pii_lab_value',
    pattern:
      /\b\d+(?:\.\d+)?\s*(?:mg\/dL|mmol\/L|U\/L|g\/dL|ng\/mL|mEq\/L)\b/gi,
    severity: 'medium',
  },
];

/** Advisory PII scan (data-model/ai-assistant.md). The human approval gate is
 * authoritative; findings never block ingestion automatically. */
export function scanPii(text: string): PiiFinding[] {
  const findings: PiiFinding[] = [];
  for (const { rule, pattern, severity } of RULES) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (rule === 'pii_phone' && !looksLikePhone(match[0])) continue;
      const excerpt = match[0].slice(0, 200);
      findings.push({ rule, excerpt, severity });
      if (findings.length >= 100) return findings;
    }
  }
  return findings;
}

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return false;
  return true;
}
