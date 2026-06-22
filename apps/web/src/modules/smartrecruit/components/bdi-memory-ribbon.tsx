import { cn } from '@seta/shared-ui';
import { Brain, Cpu, Database, Server } from 'lucide-react';
import React from 'react';
import type { CriteriaState } from '../hooks/use-smartrecruit-workflow';

interface BdiMemoryRibbonProps {
  isGate1Active: boolean;
  runStatus: string | null;
  isGate2Active: boolean;
  activeCriteria: CriteriaState | null;
}

export const BdiMemoryRibbon: React.FC<BdiMemoryRibbonProps> = React.memo(
  ({ isGate1Active, runStatus, isGate2Active, activeCriteria }) => {
    const isJdActive = isGate1Active || runStatus === 'running' || isGate2Active;
    const isWmLocked = activeCriteria !== null || isGate2Active;

    return (
      <div className="flex items-center gap-4 border-b border-hairline px-6 py-2 shrink-0 bg-canvas/30 text-eyebrow">
        <span className="font-bold text-ink flex items-center gap-1.5 uppercase">
          <Brain className="size-3.5 text-primary" /> BDI Architecture
        </span>
        <div className="flex items-center gap-3 text-ink-subtle">
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors',
              isJdActive ? 'border-blue-500/30 text-blue-600 bg-blue-500/10' : 'border-hairline',
            )}
          >
            <Cpu className="size-3" /> [ STM: {isJdActive ? 'JD Active' : 'Idle'} ]
          </div>
          <span className="text-hairline-strong">──</span>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-0.5 rounded border transition-colors',
              isWmLocked
                ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10'
                : 'border-hairline',
            )}
          >
            <Server className="size-3" /> [ WM (Beliefs): {isWmLocked ? 'Locked' : 'Empty'} ]
          </div>
          <span className="text-hairline-strong">──</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-purple-500/30 text-purple-600 bg-purple-500/10">
            <Database className="size-3" /> [ LTM: Connected ]
          </div>
        </div>
      </div>
    );
  },
);

BdiMemoryRibbon.displayName = 'BdiMemoryRibbon';
