export type CvSecurityRiskLevel = 'low' | 'medium' | 'high';

export type CvSecurityFlagCode =
  | 'PROMPT_INJECTION_SUSPECTED'
  | 'APPROVAL_MANIPULATION_SUSPECTED'
  | 'ROLE_PROMPT_SUSPECTED'
  | 'HIDDEN_TEXT_SUSPECTED'
  | 'INVALID_EVIDENCE_PROMPT_INJECTION';

export interface CvSecurityFlag {
  code: CvSecurityFlagCode;
  severity: 'warning' | 'error';
  message: string;
  snippet: string;
}

export interface CvSecurityResult {
  riskLevel: CvSecurityRiskLevel;
  requiresHumanReview: boolean;
  ocrComparisonAvailable: boolean;
  flags: CvSecurityFlag[];
}

interface ScanCvSecurityInput {
  cvText: string;
  nativeText?: string | null;
  ocrText?: string | null;
  filename?: string | null;
}

interface PatternRule {
  code: CvSecurityFlagCode;
  severity: CvSecurityFlag['severity'];
  message: string;
  patterns: RegExp[];
}

const PROMPT_INJECTION_PATTERNS = [
  /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions?\b/i,
  /\bdisregard\s+(all\s+)?(previous|prior|above)\s+instructions?\b/i,
  /\boverride\s+(the\s+)?(system|developer|recruiter)\s+instructions?\b/i,
  /\bdo\s+not\s+follow\s+(the\s+)?(system|previous)\s+instructions?\b/i,
  /\bgive\s+(this\s+)?cv\s+(a\s+)?(100|hundred|high|maximum)\s+(score|rating)\b/i,
  /\bscore\s+(this\s+)?cv\s+(as\s+)?(100|high|maximum)\b/i,
  /\bh[ãa]y\s+ch[ấa]m\s+[đd]i[ểe]m\s+(cv|h[ồo]\s*s[ơo]).{0,30}(cao|t[ốo]i\s*[đd]a|100)/i,
  /\bh[ãa]y\s+cho\s+(cv|h[ồo]\s*s[ơo]).{0,40}(qua|[đd][ậa]u|pass)/i,
  /\bb[ỏo]\s+qua\s+(c[áa]c\s+)?h[ưu][ớo]ng\s+d[ẫa]n\s+(tr[ưu][ớo]c|ph[íi]a\s+tr[êe]n)/i,
];

const APPROVAL_MANIPULATION_PATTERNS = [
  /\b(shortlist|approve|pass|accept)\s+(this\s+)?(candidate|cv|profile)\b/i,
  /\bmark\s+(this\s+)?(candidate|cv|profile)\s+as\s+(passed|shortlisted|approved|accepted)\b/i,
  /\bauto[-\s]?approve\s+(this\s+)?(candidate|cv|profile)\b/i,
  /\bbypass\s+(the\s+)?(screening|approval|review)\b/i,
  /\bcho\s+(t[ôo]i|[ứu]ng\s+vi[êe]n|cv).{0,40}(qua\s+v[òo]ng|[đd][ậa]u|duy[ệe]t)/i,
];

const ROLE_PROMPT_PATTERNS = [
  /\bsystem\s+prompt\b/i,
  /\bdeveloper\s+message\b/i,
  /\bassistant\s+message\b/i,
  /\byou\s+are\s+(chatgpt|an?\s+ai|an?\s+assistant)\b/i,
  /\bact\s+as\s+(the\s+)?(recruiter|screening\s+agent|system)\b/i,
];

const RULES: PatternRule[] = [
  {
    code: 'PROMPT_INJECTION_SUSPECTED',
    severity: 'error',
    message: 'The CV appears to contain instructions that try to manipulate the AI evaluator.',
    patterns: PROMPT_INJECTION_PATTERNS,
  },
  {
    code: 'APPROVAL_MANIPULATION_SUSPECTED',
    severity: 'error',
    message: 'The CV appears to ask the system to approve or pass the candidate.',
    patterns: APPROVAL_MANIPULATION_PATTERNS,
  },
  {
    code: 'ROLE_PROMPT_SUSPECTED',
    severity: 'warning',
    message: 'The CV contains role or prompt-like text that should be treated as untrusted data.',
    patterns: ROLE_PROMPT_PATTERNS,
  },
];

function normalizeForMatching(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function snippetForMatch(text: string, matchIndex: number, matchLength: number): string {
  let start = Math.max(0, matchIndex - 60);
  if (start > 0) {
    while (start < matchIndex && !/\s/.test(text[start])) {
      start++;
    }
  }
  let end = Math.min(text.length, matchIndex + matchLength + 60);
  if (end < text.length) {
    while (end > matchIndex + matchLength && !/\s/.test(text[end])) {
      end--;
    }
  }
  const prefix = start > 0 ? '... ' : '';
  const suffix = end < text.length ? ' ...' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`.replace(/\s+/g, ' ').trim();
}

function flagsForText(text: string): CvSecurityFlag[] {
  const normalized = normalizeForMatching(text);
  const flags: CvSecurityFlag[] = [];
  const seen = new Set<string>();

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(normalized);
      if (!match || match.index === undefined) continue;
      const key = `${rule.code}:${match[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flags.push({
        code: rule.code,
        severity: rule.severity,
        message: rule.message,
        snippet: snippetForMatch(normalized, match.index, match[0].length),
      });
      break;
    }
  }

  return flags;
}

function riskFromFlags(flags: CvSecurityFlag[]): CvSecurityRiskLevel {
  if (flags.some((flag) => flag.severity === 'error')) return 'high';
  if (flags.length > 0) return 'medium';
  return 'low';
}

function includesInstructionLikeText(text: string): boolean {
  return flagsForText(text).some(
    (flag) =>
      flag.code === 'PROMPT_INJECTION_SUSPECTED' || flag.code === 'APPROVAL_MANIPULATION_SUSPECTED',
  );
}

function hasSimilarInstructionRisk(nativeText: string, ocrText: string): boolean {
  return includesInstructionLikeText(nativeText) && !includesInstructionLikeText(ocrText);
}

export function isInstructionLikeText(text?: string | null): boolean {
  if (!text?.trim()) return false;
  return flagsForText(text).length > 0;
}

export function scanCvSecurity(input: ScanCvSecurityInput): CvSecurityResult {
  const text = input.cvText || input.nativeText || '';
  const flags = flagsForText(text);
  const ocrComparisonAvailable = Boolean(input.nativeText?.trim() && input.ocrText?.trim());

  if (
    input.nativeText?.trim() &&
    input.ocrText?.trim() &&
    hasSimilarInstructionRisk(input.nativeText, input.ocrText)
  ) {
    flags.push({
      code: 'HIDDEN_TEXT_SUSPECTED',
      severity: 'error',
      message:
        'Instruction-like text appears in the PDF text layer but not in OCR text, which may indicate hidden or visually obscured content.',
      snippet:
        flagsForText(input.nativeText)[0]?.snippet ?? input.filename ?? 'PDF text layer mismatch',
    });
  }

  const riskLevel = riskFromFlags(flags);
  return {
    riskLevel,
    requiresHumanReview: riskLevel !== 'low',
    ocrComparisonAvailable,
    flags,
  };
}
