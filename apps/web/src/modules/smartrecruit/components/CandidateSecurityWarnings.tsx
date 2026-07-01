import { Badge } from '@seta/shared-ui';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

export interface CandidateSecurityFlag {
  code?: string;
  severity?: 'warning' | 'error';
  message?: string;
  snippet?: string;
}

export interface CandidateSecurityState {
  riskLevel?: 'low' | 'medium' | 'high';
  requiresHumanReview?: boolean;
  ocrComparisonAvailable?: boolean;
  flags?: CandidateSecurityFlag[];
}

interface CandidateSecurityWarningsProps {
  security?: CandidateSecurityState | null;
  compact?: boolean;
}

export function hasSecurityReviewRisk(security?: CandidateSecurityState | null): boolean {
  return Boolean(
    security?.requiresHumanReview ||
      security?.riskLevel === 'medium' ||
      security?.riskLevel === 'high',
  );
}

function formatFlagInfo(code?: string, defaultMsg?: string) {
  switch (code) {
    case 'APPROVAL_MANIPULATION_SUSPECTED':
      return {
        title: 'Attempted AI Score Manipulation',
        description:
          'The CV appears to contain instructions asking the AI evaluator to approve or shortlist this candidate.',
      };
    case 'HIDDEN_TEXT_SUSPECTED':
      return {
        title: 'Hidden White Text Detected',
        description:
          'Instruction-like text was detected in the PDF text layer that does not appear in OCR text, indicating obscured or hidden content.',
      };
    case 'PROMPT_INJECTION_SUSPECTED':
      return {
        title: 'Prompt Injection Instruction Detected',
        description:
          'The document contains prompt override instructions designed to bypass evaluation criteria.',
      };
    case 'ROLE_PROMPT_SUSPECTED':
      return {
        title: 'Suspicious System Role Override',
        description:
          'The CV contains text attempting to redefine the AI assistant role or evaluation parameters.',
      };
    default: {
      const cleanTitle = code
        ? code
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase())
        : 'Security Alert';
      return {
        title: cleanTitle,
        description:
          defaultMsg || 'Suspicious instruction-like content was detected during automated review.',
      };
    }
  }
}

export function CandidateSecurityWarnings({
  security,
  compact = false,
}: CandidateSecurityWarningsProps) {
  if (!hasSecurityReviewRisk(security)) return null;

  const flags = security?.flags ?? [];
  const isHighRisk = security?.riskLevel === 'high';

  return (
    <div
      className={
        isHighRisk
          ? 'rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-red-50/50 p-4 shadow-sm text-red-900'
          : 'rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-50/50 p-4 shadow-sm text-amber-900'
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            isHighRisk
              ? 'p-2 rounded-lg bg-red-100 text-red-600 mt-0.5 shrink-0 shadow-xs'
              : 'p-2 rounded-lg bg-amber-100 text-amber-600 mt-0.5 shrink-0 shadow-xs'
          }
        >
          {isHighRisk ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight">Security Review Required</span>
              <Badge
                className={
                  isHighRisk
                    ? 'border border-red-200 bg-red-600 text-white font-semibold px-2.5 py-0.5 shadow-xs'
                    : 'border border-amber-200 bg-amber-600 text-white font-semibold px-2.5 py-0.5 shadow-xs'
                }
              >
                {security?.riskLevel ? `${security.riskLevel.toUpperCase()} RISK` : 'HIGH RISK'}
              </Badge>
            </div>
            {security?.ocrComparisonAvailable === false && !compact && (
              <Badge className="border border-neutral-200 bg-white text-neutral-600 font-normal">
                OCR comparison unavailable
              </Badge>
            )}
          </div>

          {!compact && (
            <div className="mt-3.5 flex flex-col gap-3">
              {flags.length === 0 ? (
                <p className="text-xs text-current/80">
                  Candidate CV requires human review before automatic approval.
                </p>
              ) : (
                flags.map((flag) => {
                  const { title, description } = formatFlagInfo(flag.code, flag.message);
                  const uniqueKey = `${flag.code ?? 'security'}-${flag.snippet?.slice(0, 20) ?? flag.message?.slice(0, 20) ?? 'flag'}`;
                  return (
                    <div
                      key={uniqueKey}
                      className="rounded-lg bg-white/90 border border-current/15 p-3.5 shadow-xs flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs flex items-center gap-1.5 text-neutral-900">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                          {title}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 leading-relaxed">{description}</p>
                      {flag.snippet && (
                        <div className="mt-1 flex flex-col gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                            Extracted Suspicious Snippet:
                          </span>
                          <div className="rounded border border-red-200/80 bg-red-50/50 p-2.5 font-mono text-[11px] text-red-950 break-words leading-relaxed italic">
                            "{flag.snippet}"
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
