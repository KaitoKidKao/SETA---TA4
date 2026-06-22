// biome-ignore-all lint/suspicious/noArrayIndexKey: screening report arrays have no stable id
import { Badge, Button, cn, Input, Textarea } from '@seta/shared-ui';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  Sparkles,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';
import type { CandidateState, DraftState } from '../hooks/use-smartrecruit-workflow';

interface OutreachApprovalSectionProps {
  isGate2Active: boolean;
  filteredCandidates: CandidateState[];
  selectedCandidate: CandidateState | null;
  handleSelectCandidate: (cand: CandidateState) => void;
  isHallucinationFail: (candidateId: string) => boolean;
  editingDraft: DraftState | null;
  setEditingDraft: React.Dispatch<React.SetStateAction<DraftState | null>>;
  isApprovingOutreach: boolean;
  handleDeclineWorkflow: () => void;
  handleApproveOutreachBulk: () => void;
}

function candidateReport(
  candidate: CandidateState,
): NonNullable<CandidateState['screening_report']> {
  return {
    pros: candidate.screening_report?.pros ?? [],
    gaps: candidate.screening_report?.gaps ?? [],
    yoeExplanation:
      candidate.screening_report?.yoeExplanation ??
      'No screening report is available for this candidate yet.',
    overallJustification: candidate.screening_report?.overallJustification ?? '',
    mustHaveMatches: candidate.screening_report?.mustHaveMatches ?? [],
    niceToHaveMatches: candidate.screening_report?.niceToHaveMatches ?? [],
  };
}

export const OutreachApprovalSection: React.FC<OutreachApprovalSectionProps> = React.memo(
  ({
    isGate2Active,
    filteredCandidates,
    selectedCandidate,
    handleSelectCandidate,
    isHallucinationFail,
    editingDraft,
    setEditingDraft,
    isApprovingOutreach,
    handleDeclineWorkflow,
    handleApproveOutreachBulk,
  }) => {
    const [activeTab, setActiveTab] = useState<'scorecard' | 'email'>('scorecard');

    if (!isGate2Active) return null;

    return (
      <div className="h-full flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-300 font-sans">
        {/* HUD Header */}
        <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 dark:bg-blue-950/20 dark:border-blue-900/50 shrink-0 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg dark:text-blue-400">
              <BrainCircuit className="size-5" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-blue-900 font-bold text-body-sm dark:text-blue-400 uppercase tracking-wide">
                [HITL GATE 2] Candidate Review & Outreach dispatch
              </div>
              <p className="text-blue-700 text-[11px] dark:text-blue-300 max-w-2xl leading-relaxed">
                Agent screening has concluded. Below is the parsed shortlist. Please inspect
                candidate details, view specific match scorecards, verify outreach drafts, and
                approve bulk mailing.
              </p>
            </div>
          </div>
        </div>

        {/* Main Split Pane */}
        <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
          {/* Left Side: Shortlist Candidate Cards */}
          <div className="w-[340px] shrink-0 flex flex-col gap-3 bg-surface border border-hairline rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-hairline bg-canvas/30 flex items-center justify-between">
              <h4 className="text-body-sm font-bold text-ink flex items-center gap-1.5">
                Shortlisted Profiles{' '}
                <Badge className="bg-primary/10 text-primary font-mono">
                  {filteredCandidates.length}
                </Badge>
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-hairline">
              {filteredCandidates.map((cand, idx) => {
                const isSelected = selectedCandidate?.id === cand.id;
                const hasHallucination = isHallucinationFail(cand.id);
                const initials = cand.display_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase();

                // Generate a deterministic color for candidate avatar
                const bgColors = [
                  'bg-blue-500',
                  'bg-indigo-500',
                  'bg-violet-500',
                  'bg-purple-500',
                  'bg-emerald-500',
                ];
                const avatarBg = bgColors[idx % bgColors.length];

                return (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => handleSelectCandidate(cand)}
                    className={cn(
                      'w-full text-left p-4 cursor-pointer transition-all flex items-center gap-3 outline-none border-l-4',
                      isSelected
                        ? 'bg-primary-tint/15 border-l-primary'
                        : 'hover:bg-canvas border-l-transparent',
                    )}
                  >
                    {/* Initial Avatar */}
                    <div
                      className={cn(
                        'size-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
                        avatarBg,
                      )}
                    >
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-body-sm font-bold text-ink truncate">
                          {cand.display_name}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-primary">
                          {cand.fit_score}%
                        </span>
                      </div>

                      {/* Fit Score Progress Bar */}
                      <div className="h-1 w-full bg-canvas rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${cand.fit_score}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[9px] mt-0.5">
                        {hasHallucination ? (
                          <span className="font-bold text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-100 uppercase dark:bg-rose-950/20 dark:border-rose-900/50">
                            Hallucination Fixed
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100 uppercase dark:bg-emerald-950/20 dark:border-emerald-900/50">
                            Verified Safe
                          </span>
                        )}
                        <span className="text-ink-muted font-mono">
                          {cand.screening_report?.yoeExplanation ? 'Analyzed' : 'Pending'}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={cn(
                        'size-4 text-ink-muted transition-transform',
                        isSelected && 'translate-x-0.5 text-primary',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Side: Tabbed Detail Inspection panel */}
          <div className="flex-1 bg-surface border border-hairline rounded-xl overflow-hidden flex flex-col shadow-sm">
            {selectedCandidate && editingDraft ? (
              <>
                {/* Tabs Header */}
                <div className="flex border-b border-hairline bg-canvas/30 px-4 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('scorecard')}
                    className={cn(
                      'px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
                      activeTab === 'scorecard'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-ink-subtle hover:text-ink',
                    )}
                  >
                    <FileText className="size-3.5" /> Candidate Scorecard
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('email')}
                    className={cn(
                      'px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5',
                      activeTab === 'email'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-ink-subtle hover:text-ink',
                    )}
                  >
                    <Mail className="size-3.5" /> Outreach Email Draft
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                  {activeTab === 'scorecard' ? (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      {/* Suitability Score Header */}
                      <div className="flex items-center justify-between border-b border-hairline pb-4">
                        <div className="flex flex-col gap-0.5">
                          <h3 className="text-body-lg font-bold text-ink">
                            {selectedCandidate.display_name}
                          </h3>
                          <p className="text-xs text-ink-subtle">
                            Screening score based on extracted criteria matches
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xs text-ink-subtle font-medium">Fit Score</div>
                            <div className="text-body-xl font-black text-primary font-mono">
                              {selectedCandidate.fit_score}%
                            </div>
                          </div>
                          <div className="h-10 w-[1px] bg-hairline" />
                          <div className="text-left">
                            <div className="text-xs text-ink-subtle font-medium text-center">
                              Status
                            </div>
                            <Badge
                              className={cn(
                                'mt-0.5',
                                (selectedCandidate.fit_score ?? 0) >= 80
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-amber-500 text-white',
                              )}
                            >
                              {(selectedCandidate.fit_score ?? 0) >= 80
                                ? 'Highly Qualified'
                                : 'Qualified'}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Experience Assessment */}
                      <div className="flex flex-col gap-2">
                        <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                          Experience Assessment
                        </h4>
                        <div className="bg-canvas/30 p-4 rounded-xl border border-hairline text-body-sm text-ink-subtle leading-relaxed italic">
                          "{candidateReport(selectedCandidate).yoeExplanation}"
                        </div>
                      </div>

                      {/* Pros & Gaps Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
                        <div className="flex flex-col gap-2.5">
                          <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle2 className="size-4 text-emerald-500" /> Key Strengths
                            (Pros)
                          </h4>
                          <div className="flex flex-col gap-1.5">
                            {candidateReport(selectedCandidate).pros.length > 0 ? (
                              candidateReport(selectedCandidate).pros.map((pro, idx) => (
                                <div
                                  key={`pro-${idx}`}
                                  className="flex gap-2 text-body-sm text-ink items-start bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10"
                                >
                                  <span className="text-emerald-500 font-bold shrink-0 mt-0.5">
                                    ✓
                                  </span>
                                  <span>{pro}</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-ink-muted italic">
                                No specific strengths highlighted.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2.5">
                          <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                            <AlertCircle className="size-4 text-amber-500" /> Requirements Gaps
                            (Gaps)
                          </h4>
                          <div className="flex flex-col gap-1.5">
                            {candidateReport(selectedCandidate).gaps.length > 0 ? (
                              candidateReport(selectedCandidate).gaps.map((gap, idx) => (
                                <div
                                  key={`gap-${idx}`}
                                  className="flex gap-2 text-body-sm text-ink items-start bg-amber-500/5 p-2 rounded-lg border border-amber-500/10"
                                >
                                  <span className="text-amber-500 font-bold shrink-0 mt-0.5">
                                    !
                                  </span>
                                  <span>{gap}</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-emerald-600 font-medium bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 flex items-center gap-1.5">
                                <CheckCircle2 className="size-3.5" /> Ideal candidate. No major gaps
                                identified!
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Skill Badge Matches */}
                      <div className="flex flex-col gap-3 border-t border-hairline pt-4 mt-2">
                        <div className="flex flex-col gap-2">
                          <div className="text-xs font-bold text-ink uppercase tracking-wider">
                            Must-Have Skill Matches
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {candidateReport(selectedCandidate).mustHaveMatches.length > 0 ? (
                              candidateReport(selectedCandidate).mustHaveMatches.map((m, idx) => (
                                <Badge
                                  key={`must-${idx}`}
                                  className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs"
                                >
                                  {m.jdSkill}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-ink-muted italic">None matched.</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 mt-2">
                          <div className="text-xs font-bold text-ink uppercase tracking-wider">
                            Nice-to-Have Skill Matches
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {candidateReport(selectedCandidate).niceToHaveMatches.length > 0 ? (
                              candidateReport(selectedCandidate).niceToHaveMatches.map((m, idx) => (
                                <Badge
                                  key={`nice-${idx}`}
                                  className="bg-blue-50 text-blue-700 border border-blue-200 text-xs"
                                >
                                  {m.jdSkill}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-ink-muted italic">None matched.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      {/* Adoption filter notification */}
                      {editingDraft.hallucination_check_status === 'failed' ? (
                        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex gap-3 text-rose-700 items-start dark:bg-rose-950/20 dark:border-rose-900/50">
                          <XCircle className="size-4 shrink-0 mt-0.5 text-rose-500" />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold uppercase tracking-wider">
                              Anti-Hallucination: FAILED (Flagged & Fixed)
                            </span>
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 leading-relaxed">
                              The initial email drafted by the agent contained details not supported
                              by the candidate's CV text. The safety filter successfully intervened,
                              reduced generator temperature, and recreated the draft safely.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3 text-emerald-700 items-start dark:bg-emerald-950/20 dark:border-emerald-900/50">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-500" />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold uppercase tracking-wider">
                              Anti-Hallucination adoption filter: Passed
                            </span>
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 leading-relaxed">
                              All entities, projects, and work history items mentioned in the email
                              draft have been successfully cross-verified with the candidate's CV
                              text. Zero hallucinations found.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Email form fields */}
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="text-eyebrow text-ink-subtle">Subject Line</div>
                          <Input
                            value={editingDraft.subject}
                            onChange={(e) =>
                              setEditingDraft((prev) =>
                                prev ? { ...prev, subject: e.target.value } : null,
                              )
                            }
                            className="border-hairline bg-canvas/30 font-bold text-body-sm h-9"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <div className="text-eyebrow text-ink-subtle">
                              Personalized Email Body
                            </div>
                            <span className="text-[10px] text-primary flex items-center gap-1 font-medium">
                              <Sparkles className="size-3" /> Rich Markdown Supported
                            </span>
                          </div>
                          <Textarea
                            value={editingDraft.body}
                            onChange={(e) =>
                              setEditingDraft((prev) =>
                                prev ? { ...prev, body: e.target.value } : null,
                              )
                            }
                            rows={12}
                            className={cn(
                              'border-hairline font-mono text-[11px] leading-relaxed bg-canvas/30',
                              editingDraft.hallucination_check_status === 'failed' &&
                                'border-rose-300 focus:ring-rose-500',
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-ink-subtle gap-2 p-6 text-center">
                <FileText className="size-10 text-ink-muted" />
                <p className="text-body-sm">
                  Select a candidate from the shortlist on the left to inspect their score card,
                  skill matches, and verify email outreach draft.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer controls */}
        <div className="bg-surface border-t border-hairline p-4 flex justify-end gap-3 shrink-0 shadow-sm rounded-xl">
          <Button
            variant="ghost"
            onClick={handleDeclineWorkflow}
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer h-10 px-4 font-semibold text-xs"
          >
            Reject & Abort
          </Button>
          <Button
            onClick={handleApproveOutreachBulk}
            disabled={isApprovingOutreach}
            className="bg-ink text-white hover:bg-ink-hover flex gap-2 items-center cursor-pointer h-10 px-6 font-bold text-xs shadow-sm"
          >
            {isApprovingOutreach ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            Approve & Dispatch {filteredCandidates.length} Emails
          </Button>
        </div>
      </div>
    );
  },
);

OutreachApprovalSection.displayName = 'OutreachApprovalSection';
