// biome-ignore-all lint/suspicious/noArrayIndexKey: log/skeleton arrays have no stable id
import { Badge, Button, Card, Input } from '@seta/shared-ui';
import { AlertTriangle, CheckCircle, Loader2, Plus } from 'lucide-react';
import React, { useState } from 'react';
import type { CriteriaState } from '../hooks/use-smartrecruit-workflow';

interface CriteriaReviewSectionProps {
  activeCriteria: CriteriaState | null;
  setActiveCriteria: (criteria: CriteriaState | null) => void;
  isConfirmingCriteria: boolean;
  handleConfirmCriteria: () => void;
  handleDeclineWorkflow: () => void;
}

export const CriteriaReviewSection: React.FC<CriteriaReviewSectionProps> = React.memo(
  ({
    activeCriteria,
    setActiveCriteria,
    isConfirmingCriteria,
    handleConfirmCriteria,
    handleDeclineWorkflow,
  }) => {
    const [newMustHave, setNewMustHave] = useState('');
    const [newNiceToHave, setNewNiceToHave] = useState('');

    if (!activeCriteria) return null;

    const handleAddMustHave = () => {
      if (!newMustHave.trim()) return;
      setActiveCriteria({
        ...activeCriteria,
        must_have_skills: [...activeCriteria.must_have_skills, newMustHave.trim()],
      });
      setNewMustHave('');
    };

    const handleAddNiceToHave = () => {
      if (!newNiceToHave.trim()) return;
      setActiveCriteria({
        ...activeCriteria,
        nice_to_have_skills: [...activeCriteria.nice_to_have_skills, newNiceToHave.trim()],
      });
      setNewNiceToHave('');
    };

    return (
      <div className="max-w-4xl mx-auto flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-300 font-sans">
        <div className="bg-amber-50 border-l-4 border-l-amber-500 border-amber-200 rounded-r-lg p-4 flex flex-col gap-2 dark:bg-amber-950/20 dark:border-amber-900/50">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-body-sm dark:text-amber-500 uppercase tracking-wide">
            <AlertTriangle className="size-4" /> [HITL GATE] Execution Paused: Pending Review
          </div>
          <p className="text-amber-700 text-body-sm dark:text-amber-400">
            The BDI Planner has successfully extracted technical criteria from the Job Description.
            Please review and approve these criteria before the Agent saves them to{' '}
            <strong className="font-semibold">Working Memory (Beliefs)</strong> and proceeds to
            candidate screening.
          </p>
        </div>

        <Card className="shadow-sm border-hairline bg-surface">
          <div className="p-4 border-b border-hairline bg-canvas/30 flex justify-between items-center">
            <h3 className="text-body-sm font-bold text-ink">Extracted Screening Criteria</h3>
            <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20">
              Phase 1
            </Badge>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="text-eyebrow text-ink-subtle">Target Job Title</div>
                <Input
                  value={activeCriteria.job_title}
                  onChange={(e) =>
                    setActiveCriteria({ ...activeCriteria, job_title: e.target.value })
                  }
                  className="border-hairline h-9 text-body-sm font-medium bg-canvas/50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-eyebrow text-ink-subtle">Min Years of Experience (YOE)</div>
                <Input
                  type="number"
                  value={activeCriteria.min_yoe}
                  onChange={(e) =>
                    setActiveCriteria({
                      ...activeCriteria,
                      min_yoe: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="border-hairline h-9 text-body-sm bg-canvas/50"
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="text-eyebrow text-ink-subtle flex items-center gap-1">
                  <span className="size-2 rounded-full bg-rose-500" /> Must-Have Technical Skills
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {activeCriteria.must_have_skills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="bg-surface border-hairline text-body-sm font-medium px-2 py-1 gap-1"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveCriteria({
                            ...activeCriteria,
                            must_have_skills: activeCriteria.must_have_skills.filter(
                              (s) => s !== skill,
                            ),
                          })
                        }
                        className="text-ink-muted hover:text-rose-500 cursor-pointer"
                      >
                        &times;
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newMustHave}
                    onChange={(e) => setNewMustHave(e.target.value)}
                    placeholder="Add skill..."
                    className="border-hairline h-8 text-xs bg-canvas/50 flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddMustHave()}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleAddMustHave}
                    className="h-8 w-8 p-0 flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-hairline pt-3">
                <div className="text-eyebrow text-ink-subtle flex items-center gap-1">
                  <span className="size-2 rounded-full bg-blue-500" /> Nice-to-Have Skills
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {activeCriteria.nice_to_have_skills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="bg-surface border-hairline text-body-sm font-medium px-2 py-1 gap-1"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() =>
                          setActiveCriteria({
                            ...activeCriteria,
                            nice_to_have_skills: activeCriteria.nice_to_have_skills.filter(
                              (s) => s !== skill,
                            ),
                          })
                        }
                        className="text-ink-muted hover:text-rose-500 cursor-pointer"
                      >
                        &times;
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newNiceToHave}
                    onChange={(e) => setNewNiceToHave(e.target.value)}
                    placeholder="Add skill..."
                    className="border-hairline h-8 text-xs bg-canvas/50 flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNiceToHave()}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleAddNiceToHave}
                    className="h-8 w-8 p-0 flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-canvas/50 border-t border-hairline flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={handleDeclineWorkflow}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
            >
              Reject & Abort
            </Button>
            <Button
              onClick={handleConfirmCriteria}
              disabled={isConfirmingCriteria}
              className="bg-ink text-white hover:bg-ink-hover shadow-sm flex gap-2 items-center cursor-pointer"
            >
              {isConfirmingCriteria ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle className="size-4" />
              )}
              Approve & Save to Beliefs
            </Button>
          </div>
        </Card>
      </div>
    );
  },
);

CriteriaReviewSection.displayName = 'CriteriaReviewSection';
