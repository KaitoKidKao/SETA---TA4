// biome-ignore-all lint/suspicious/noArrayIndexKey: ignore array index key
// biome-ignore-all lint/suspicious/noExplicitAny: ignore explicit any
// biome-ignore-all lint/a11y/noLabelWithoutControl: ignore form labels association
/* eslint-disable react-hooks/set-state-in-effect */
import { Badge, Button, Input, toast } from '@seta/shared-ui';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Check,
  Loader2,
  Sparkles,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface MatchItem {
  jdSkill: string;
  cvSkill: string | null;
  matched: boolean;
  justification: string;
  evidenceSnippet?: string | null;
}

interface CandidateState {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  status: string;
  applied_position?: string | null;
  fit_score: number | null;
  effective_fit_score?: number | null;
  reviewed_fit_score?: number | null;
  review_reason?: string | null;
  screening_report: {
    pros: string[];
    gaps: string[];
    yoeExplanation: string;
    overallJustification: string;
    piiMapping?: Record<string, string>;
    contactDetails?: {
      name: string;
      email: string;
      phone: string | null;
    };
    mustHaveMatches: MatchItem[];
    niceToHaveMatches: MatchItem[];
    scoreBreakdown?: {
      mustHaveSkills: number;
      yoe: number;
      english: number;
      niceToHave: number;
      teamSkillGapBonus?: number;
    };
    flags?: string[];
    solvedTeamGaps?: string[];
    missingTeamGaps?: string[];
    appliedTeamGaps?: Array<{
      skill: string;
      matched: boolean;
      treatment: 'must_have' | 'nice_to_have';
    }>;
    teamSkillGapBonus?: number;
    originalFitScore?: number;
  } | null;
}

interface CandidateScorecardProps {
  selectedCandidate: CandidateState;
  campaignId: string;
  onReviewSaved: () => Promise<void>;
}

export function CandidateScorecard({
  selectedCandidate,
  campaignId,
  onReviewSaved,
}: CandidateScorecardProps) {
  const [reviewScore, setReviewScore] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setReviewScore(
      String(
        selectedCandidate.reviewed_fit_score ??
          selectedCandidate.effective_fit_score ??
          selectedCandidate.fit_score ??
          '',
      ),
    );
    setReviewReason(selectedCandidate.review_reason ?? '');
    setErrorMsg(null);
  }, [selectedCandidate]);

  const handleSaveReview = async () => {
    const fitScore = Number(reviewScore);
    if (!Number.isInteger(fitScore) || fitScore < 0 || fitScore > 100) {
      setErrorMsg('Score must be an integer from 0 to 100.');
      return;
    }
    if (!reviewReason.trim()) {
      setErrorMsg('A score override reason is required.');
      return;
    }
    if (reviewReason.trim().length < 5) {
      setErrorMsg('Override reason must be at least 5 characters.');
      return;
    }

    setIsSavingReview(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/smartrecruit/v1/campaigns/${campaignId}/candidates/${selectedCandidate.id}/review`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fitScore, reason: reviewReason.trim() }),
        },
      );
      const text = await res.text();
      let data: { message?: string; error?: string } = {};
      if (text.trim()) {
        try {
          const parsed = JSON.parse(text) as unknown;
          data = parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          throw new Error(text.slice(0, 300));
        }
      }
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Could not save recruiter review.');
      }
      toast.success('Reviewed score saved successfully!');
      await onReviewSaved();
    } catch (err) {
      setErrorMsg((err as Error).message);
      toast.error('Could not save reviewed score');
    } finally {
      setIsSavingReview(false);
    }
  };

  const getScoreBreakdown = () => {
    return (
      selectedCandidate.screening_report?.scoreBreakdown ?? {
        mustHaveSkills: 0,
        yoe: 0,
        english: 0,
        niceToHave: 0,
      }
    );
  };

  const hasFlags = selectedCandidate.screening_report?.flags?.includes('EVIDENCE_MISSING');
  const report = selectedCandidate.screening_report;
  const pros = report?.pros ?? [];
  const gaps = report?.gaps ?? [];
  const contactDetails = report?.contactDetails ?? {
    name: selectedCandidate.display_name,
    email: selectedCandidate.email,
    phone: selectedCandidate.phone,
  };
  const decodedContactRows = [
    { label: 'Candidate name', value: contactDetails.name },
    { label: 'Email', value: contactDetails.email },
    { label: 'Phone', value: contactDetails.phone },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <div className="flex flex-col gap-5">
      {/* Visual Score breakdown & Override Form */}
      <div className="bg-neutral-50/50 p-5 rounded-xl border border-neutral-200 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h4 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-600" />
            AI Candidate Scorecard
          </h4>
          {selectedCandidate.reviewed_fit_score !== null && (
            <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-600" />
              Reviewed by Recruiter
            </Badge>
          )}
        </div>

        {/* Breakdown counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-xs">
            <span className="block text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
              Must-have skills
            </span>
            <span className="text-lg font-extrabold text-neutral-800">
              {getScoreBreakdown().mustHaveSkills}%
            </span>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-xs">
            <span className="block text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
              Experience (YOE)
            </span>
            <span className="text-lg font-extrabold text-neutral-800">
              {getScoreBreakdown().yoe}%
            </span>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-xs">
            <span className="block text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
              English level
            </span>
            <span className="text-lg font-extrabold text-neutral-800">
              {getScoreBreakdown().english}%
            </span>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-xs">
            <span className="block text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
              Nice-to-have skills
            </span>
            <span className="text-lg font-extrabold text-neutral-800">
              {getScoreBreakdown().niceToHave}%
            </span>
          </div>
        </div>

        {/* Evidence warning */}
        {hasFlags && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex items-start gap-2 text-xs text-amber-800 leading-normal">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Review required:</span> Candidate-claimed skills were
              found without clear evidence in the source CV.
            </div>
          </div>
        )}

        {/* Override Form */}
        <div className="border-t border-neutral-100 pt-4 flex flex-col gap-3">
          <h5 className="text-xs font-bold text-neutral-700 uppercase tracking-wide">
            Score Override
          </h5>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3 flex flex-col gap-1">
              <label className="text-xs font-semibold text-neutral-600">
                New score (0-100) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                value={reviewScore}
                onChange={(e) => setReviewScore(e.target.value)}
                className="h-9 text-xs border-neutral-300"
              />
            </div>
            <div className="md:col-span-6 flex flex-col gap-1">
              <label className="text-xs font-semibold text-neutral-600">
                Review reason <span className="text-red-500">*</span>
              </label>
              <Input
                value={reviewReason}
                placeholder="Enter the required reason for the audit log..."
                onChange={(e) => setReviewReason(e.target.value)}
                className="h-9 text-xs border-neutral-300"
              />
            </div>
            <div className="md:col-span-3">
              <Button
                type="button"
                onClick={handleSaveReview}
                disabled={isSavingReview}
                className="w-full h-9 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {isSavingReview ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded-lg mt-1">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* Team Skill Gap Contribution */}
      {((report?.solvedTeamGaps && report.solvedTeamGaps.length > 0) ||
        (report?.missingTeamGaps && report.missingTeamGaps.length > 0) ||
        (report?.appliedTeamGaps && report.appliedTeamGaps.length > 0)) && (
        <div className="bg-neutral-50/50 p-5 rounded-xl border border-neutral-200 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h4 className="text-sm font-bold text-neutral-850 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Team Skill Gap Contribution
            </h4>
            {report.teamSkillGapBonus && report.teamSkillGapBonus > 0 ? (
              <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                Score bonus: +{report.teamSkillGapBonus}% Fit Score
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2 bg-emerald-50/20 border border-emerald-100 rounded-xl p-4">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                <Check className="w-4 h-4 text-emerald-500" />
                Covers team skill gaps
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {report.solvedTeamGaps && report.solvedTeamGaps.length > 0 ? (
                  report.solvedTeamGaps.map((skill, idx) => (
                    <Badge
                      key={idx}
                      className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium py-1 px-2.5 rounded-full flex items-center gap-1"
                    >
                      <Check className="w-3 h-3 text-emerald-600" />
                      {skill}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-neutral-400 italic">
                    No team gap contribution recorded.
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 bg-neutral-100/50 border border-neutral-200 rounded-xl p-4">
              <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider flex items-center gap-1">
                <XCircle className="w-4 h-4 text-neutral-400" />
                Remaining team gaps
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {report.missingTeamGaps && report.missingTeamGaps.length > 0 ? (
                  report.missingTeamGaps.map((skill, idx) => (
                    <Badge
                      key={idx}
                      className="bg-neutral-100 text-neutral-500 border border-neutral-200 text-xs font-medium py-1 px-2.5 rounded-full"
                    >
                      {skill}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-neutral-400 italic">None or fully covered.</span>
                )}
              </div>
            </div>
          </div>

          {report.appliedTeamGaps && report.appliedTeamGaps.length > 0 && (
            <div className="border-t border-neutral-100 pt-3 flex flex-col gap-2">
              <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider">
                Prioritized Team Gap Skills (Applied to Criteria)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {report.appliedTeamGaps.map((gap, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      gap.matched
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50/50 border-red-200 text-red-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {gap.matched ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                      <span className="font-semibold">{gap.skill}</span>
                      <span className="text-[10px] opacity-75 uppercase">
                        ({gap.treatment === 'must_have' ? 'Must-Have' : 'Nice-to-Have'})
                      </span>
                    </div>
                    <span className="font-bold">{gap.matched ? 'Covered' : 'Missing'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Skills Match Matrix with Evidence Snippets */}
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
          <ThumbsUp className="w-4 h-4 text-blue-600" />
          Skills Alignment Matrix
        </h4>

        <div className="space-y-3">
          {/* Must Have Skills */}
          {report?.mustHaveMatches && report.mustHaveMatches.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold text-red-600/90 uppercase tracking-wider bg-red-50 w-fit px-2 py-0.5 rounded">
                Must-have requirements
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {report.mustHaveMatches.map((match, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-lg border border-neutral-200 text-xs shadow-xs flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-50 pb-1.5">
                      <span className="font-semibold text-neutral-800">{match.jdSkill}</span>
                      <Badge
                        className={
                          match.matched
                            ? 'bg-emerald-500 text-white font-bold'
                            : 'bg-red-500 text-white font-bold'
                        }
                      >
                        {match.matched ? 'Matched' : 'Missing'}
                      </Badge>
                    </div>
                    {match.cvSkill && (
                      <div className="text-[11px] text-neutral-500">
                        CV keyword: <strong className="text-neutral-700">{match.cvSkill}</strong>
                      </div>
                    )}
                    <p className="text-[11px] text-neutral-600 italic bg-neutral-50/50 p-2 rounded border-l-2 border-neutral-300">
                      {match.evidenceSnippet ||
                        match.justification ||
                        'No information or evidence found in the CV.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nice Have Skills */}
          {report?.niceToHaveMatches && report.niceToHaveMatches.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              <div className="text-[11px] font-bold text-blue-600/90 uppercase tracking-wider bg-blue-50 w-fit px-2 py-0.5 rounded">
                Nice-to-have requirements
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {report.niceToHaveMatches.map((match, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-lg border border-neutral-200 text-xs shadow-xs flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-50 pb-1.5">
                      <span className="font-semibold text-neutral-800">{match.jdSkill}</span>
                      <Badge
                        className={
                          match.matched
                            ? 'bg-emerald-500 text-white font-bold'
                            : 'bg-red-500 text-white font-bold'
                        }
                      >
                        {match.matched ? 'Matched' : 'Missing'}
                      </Badge>
                    </div>
                    {match.cvSkill && (
                      <div className="text-[11px] text-neutral-500">
                        CV keyword: <strong className="text-neutral-700">{match.cvSkill}</strong>
                      </div>
                    )}
                    <p className="text-[11px] text-neutral-600 italic bg-neutral-50/50 p-2 rounded border-l-2 border-neutral-300">
                      {match.evidenceSnippet ||
                        match.justification ||
                        'No information or evidence found in the CV.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pros & Gaps summary columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 bg-emerald-50/20 border border-emerald-100 rounded-xl p-4">
          <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <Check className="w-4 h-4 text-emerald-500" />
            Strengths
          </span>
          <ul className="flex flex-col gap-1.5 mt-1">
            {pros.length === 0 ? (
              <li className="text-xs text-neutral-400 italic">No specific strengths recorded.</li>
            ) : (
              pros.map((pro, idx) => (
                <li key={idx} className="text-xs text-neutral-700 flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
                  <span>{pro}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-col gap-2 bg-red-50/20 border border-red-100 rounded-xl p-4">
          <span className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center gap-1">
            <XCircle className="w-4 h-4 text-red-500" />
            Skill gaps
          </span>
          <ul className="flex flex-col gap-1.5 mt-1">
            {gaps.length === 0 ? (
              <li className="text-xs text-neutral-400 italic">No skill gaps recorded.</li>
            ) : (
              gaps.map((gap, idx) => (
                <li key={idx} className="text-xs text-neutral-700 flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0 mt-0.5">•</span>
                  <span>{gap}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Experience Calculation */}
      <div className="border-t border-neutral-200 pt-3 flex flex-col gap-1">
        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
          YOE Analysis
        </span>
        <p className="text-xs text-neutral-700 italic font-medium leading-relaxed mt-1">
          {report?.yoeExplanation || 'No YOE calculation details available.'}
        </p>
      </div>

      {/* Canonical contact details, independent from model-generated redaction placeholders. */}
      {decodedContactRows.length > 0 && (
        <div className="border-t border-neutral-200 pt-4 flex flex-col gap-2">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
            Decoded Contact Details
          </span>
          <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs">
            {decodedContactRows.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-neutral-400 font-semibold uppercase">
                  {item.label}
                </span>
                <span className="font-semibold text-neutral-800 truncate">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
