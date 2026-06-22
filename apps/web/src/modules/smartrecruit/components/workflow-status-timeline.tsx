import { cn } from '@seta/shared-ui';
import { Brain, FileSearch, RefreshCw, Send } from 'lucide-react';
import React from 'react';

interface WorkflowStatusTimelineProps {
  isGate1Active: boolean;
  runStatus: string | null;
  showLiveSim: boolean;
  isGate2Active: boolean;
  isSuccess: boolean;
}

export const WorkflowStatusTimeline: React.FC<WorkflowStatusTimelineProps> = React.memo(
  ({ isGate1Active, runStatus, showLiveSim, isGate2Active, isSuccess }) => {
    // Determine the status of each step
    const getStepStatus = (step: 1 | 2 | 3 | 4): 'pending' | 'active' | 'paused' | 'completed' => {
      if (isSuccess) return 'completed';

      switch (step) {
        case 1:
          if (isGate1Active) return 'paused';
          if (runStatus || isGate2Active) return 'completed';
          return 'pending';
        case 2:
          if (runStatus === 'running' || showLiveSim) return 'active';
          if (isGate2Active) return 'completed';
          return 'pending';
        case 3:
          if (isGate2Active) return 'paused';
          return 'pending';
        case 4:
          return 'pending';
        default:
          return 'pending';
      }
    };

    const steps = [
      {
        id: 1,
        name: '1. Extract Criteria',
        desc: 'Parse JD into screening rules',
        icon: FileSearch,
        role: 'HITL Gate 1',
      },
      {
        id: 2,
        name: '2. CV screening',
        desc: 'S3 Sync & Match Scoring',
        icon: RefreshCw,
        role: 'Agentic screening',
      },
      {
        id: 3,
        name: '3. Outreach Drafting',
        desc: 'Anti-Hallucination & Mail drafts',
        icon: Brain,
        role: 'HITL Gate 2',
      },
      {
        id: 4,
        name: '4. Dispatch Outreach',
        desc: 'SMTP Bulk Dispatching',
        icon: Send,
        role: 'LTM Connection',
      },
    ];

    return (
      <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm flex flex-col gap-4 font-sans select-none shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
            <Brain className="size-4 text-primary animate-pulse" /> BDI Agent Workflow Pipeline
          </h3>
          <span className="text-[10px] text-ink-subtle font-medium bg-canvas px-2.5 py-1 rounded-full border border-hairline">
            Human-in-the-Loop Orchestration
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {steps.map((step, idx) => {
            const status = getStepStatus(step.id as 1 | 2 | 3 | 4);
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex flex-col gap-2.5 relative">
                {/* Connector lines (Desktop) */}
                {idx < steps.length - 1 && (
                  <div className="hidden md:block absolute top-5 left-[calc(50%+24px)] right-[-20px] h-[2px] bg-hairline z-0">
                    <div
                      className={cn(
                        'h-full bg-primary transition-all duration-500',
                        status === 'completed' ? 'w-full' : 'w-0',
                      )}
                    />
                  </div>
                )}

                {/* Step Card */}
                <div
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 relative z-10',
                    status === 'active' &&
                      'bg-primary-tint/10 border-primary shadow-sm shadow-primary/5 ring-1 ring-primary/20',
                    status === 'paused' &&
                      'bg-amber-500/5 border-amber-500/30 shadow-sm shadow-amber-500/5 ring-1 ring-amber-500/20',
                    status === 'completed' && 'bg-emerald-500/5 border-emerald-500/20',
                    status === 'pending' && 'bg-canvas/30 border-hairline opacity-60',
                  )}
                >
                  {/* Icon bubble */}
                  <div
                    className={cn(
                      'size-9 rounded-lg flex items-center justify-center transition-all duration-300',
                      status === 'active' && 'bg-primary text-white animate-pulse',
                      status === 'paused' && 'bg-amber-500 text-white',
                      status === 'completed' && 'bg-emerald-500 text-white',
                      status === 'pending' && 'bg-surface text-ink-muted border border-hairline',
                    )}
                  >
                    {status === 'active' && step.id === 2 ? (
                      <Icon className="size-4.5 animate-spin" />
                    ) : (
                      <Icon className="size-4.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[11px] font-bold text-ink truncate">{step.name}</span>
                    <span className="text-[9px] text-ink-subtle leading-tight truncate">
                      {step.desc}
                    </span>

                    {/* Status Indicator */}
                    <span className="text-[8px] font-bold mt-1 uppercase w-fit">
                      {status === 'active' && (
                        <span className="text-primary bg-primary-tint/20 px-1.5 py-0.5 rounded">
                          Executing...
                        </span>
                      )}
                      {status === 'paused' && (
                        <span className="text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded animate-pulse">
                          Pending Review
                        </span>
                      )}
                      {status === 'completed' && (
                        <span className="text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          Completed
                        </span>
                      )}
                      {status === 'pending' && (
                        <span className="text-ink-muted bg-canvas px-1.5 py-0.5 rounded">
                          Inactive
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

WorkflowStatusTimeline.displayName = 'WorkflowStatusTimeline';
