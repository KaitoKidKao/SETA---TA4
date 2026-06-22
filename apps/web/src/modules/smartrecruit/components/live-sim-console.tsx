// biome-ignore-all lint/suspicious/noArrayIndexKey: log/skeleton arrays have no stable id
import { cn } from '@seta/shared-ui';
import { RefreshCw } from 'lucide-react';
import React from 'react';

interface SimCandidate {
  id: string;
  name: string;
  status: string;
  progress: number;
  label: string;
  fitScore: number | null;
}

interface LiveSimConsoleProps {
  runStatus: string | null;
  showLiveSim: boolean;
  liveSimLogs: string[];
  liveSimCandidates: SimCandidate[];
}

export const LiveSimConsole: React.FC<LiveSimConsoleProps> = React.memo(
  ({ runStatus, showLiveSim, liveSimLogs, liveSimCandidates }) => {
    if (runStatus !== 'running' && !showLiveSim) return null;

    return (
      <div className="h-full flex flex-col gap-6 animate-in zoom-in-95 duration-300 font-sans">
        <div className="flex flex-col gap-1">
          <h3 className="text-body-lg font-bold text-ink">BDI Agent Execution Console</h3>
          <p className="text-body-sm text-ink-subtle">
            The agent is autonomously executing Phase 2: Concurrent Screening & Outreach Drafting.
          </p>
        </div>

        {/* Live Terminal Log */}
        <div className="bg-[#0A0A0A] rounded-xl border border-hairline-strong h-64 p-5 font-mono text-[11px] leading-relaxed overflow-y-auto flex flex-col gap-1.5 shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/0 via-emerald-500 to-emerald-500/0 animate-pulse" />

          <div className="text-emerald-500 font-bold mb-3">
            Seta Agentic OS v1.0.0 -- Live execution feed
          </div>

          {liveSimLogs.length > 0 ? (
            liveSimLogs.map((log, idx) => (
              <div
                key={`log-${idx}-${log.slice(0, 20)}`}
                className={cn(
                  'whitespace-pre-wrap',
                  log.includes('[ALT-ERROR]')
                    ? 'text-amber-500'
                    : log.includes('[ANTI-HALLUCINATION')
                      ? 'text-rose-500 animate-pulse'
                      : log.includes('[Feedback ✔]') || log.includes('[Feedback]')
                        ? 'text-emerald-500'
                        : 'text-zinc-400',
                )}
              >
                {log}
              </div>
            ))
          ) : (
            <>
              <div className="text-zinc-400">
                [{new Date().toLocaleTimeString()}] <span className="text-blue-400">[Desire]</span>{' '}
                Intent recognized: Screen candidate pool against approved criteria.
              </div>
              <div className="text-zinc-400">
                [{new Date().toLocaleTimeString()}] <span className="text-blue-400">[Tool]</span>{' '}
                Executing <span className="text-purple-400">semantic_search_tool</span> on Long-term
                Mem (S3)...
              </div>
              <div className="text-zinc-400">
                [{new Date().toLocaleTimeString()}]{' '}
                <span className="text-emerald-400">[Feedback ✔]</span> Found candidate batch.
              </div>
              <div className="text-zinc-400">
                [{new Date().toLocaleTimeString()}] <span className="text-blue-400">[Tool]</span>{' '}
                Executing <span className="text-purple-400">screen_cv_tool</span> concurrently...
              </div>
            </>
          )}

          {/* Blinking cursor */}
          <div className="w-2 h-3 bg-emerald-500 animate-ping mt-1" />
        </div>

        {/* Concurrent Processing Grid (Mock display of candidates) */}
        <div className="flex-1 bg-surface border border-hairline rounded-xl p-5 flex flex-col gap-4 shadow-sm">
          <h4 className="text-eyebrow font-bold text-ink-subtle uppercase flex items-center gap-2">
            <RefreshCw className="size-3.5 animate-spin text-primary" /> Concurrent Batch Processing
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {liveSimCandidates.length > 0
              ? liveSimCandidates.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 border border-hairline rounded-lg bg-canvas/30 flex flex-col gap-2.5 relative overflow-hidden transition-all duration-300"
                  >
                    <div
                      className={cn(
                        'absolute top-0 left-0 w-1 h-full',
                        c.progress === 100
                          ? 'bg-emerald-500'
                          : c.status.includes('Alert') || c.status.includes('Corrupted')
                            ? 'bg-rose-500'
                            : 'bg-primary',
                      )}
                    />
                    <span className="text-body-sm font-bold truncate text-ink">{c.name}</span>
                    <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full transition-all duration-300',
                          c.status.includes('Alert') || c.status.includes('Corrupted')
                            ? 'bg-rose-500'
                            : 'bg-primary',
                        )}
                        style={{ width: `${c.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span
                        className={cn(
                          'truncate uppercase font-bold text-[9px]',
                          c.status.includes('Alert') || c.status.includes('Corrupted')
                            ? 'text-rose-500'
                            : 'text-ink-muted',
                        )}
                      >
                        {c.status}
                      </span>
                      {c.fitScore !== null && (
                        <span className="text-primary font-bold">{c.fitScore}%</span>
                      )}
                    </div>
                  </div>
                ))
              : Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="p-3 border border-hairline rounded-lg bg-canvas/30 flex flex-col gap-2.5 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/50" />
                    <span className="text-body-sm font-bold truncate text-ink">
                      Cand_Profile_{i + 1}.pdf
                    </span>
                    <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-2/3 animate-pulse" />
                    </div>
                    <span className="text-[10px] text-ink-muted uppercase font-mono tracking-wider">
                      Processing...
                    </span>
                  </div>
                ))}
          </div>
        </div>
      </div>
    );
  },
);

LiveSimConsole.displayName = 'LiveSimConsole';
