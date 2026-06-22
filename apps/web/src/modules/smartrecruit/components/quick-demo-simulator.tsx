import { Brain } from 'lucide-react';
import React from 'react';

interface QuickDemoSimulatorProps {
  onLoadScenario: (scenarioId: string) => void;
}

export const QuickDemoSimulator: React.FC<QuickDemoSimulatorProps> = React.memo(
  ({ onLoadScenario }) => {
    return (
      <div className="flex flex-col gap-1 mt-1 bg-primary-tint/10 p-2 rounded border border-primary/20">
        <label
          htmlFor="demo-scenario-select"
          className="text-[10px] font-bold text-primary uppercase flex items-center gap-1"
        >
          <Brain className="size-3" /> Quick Demo Simulator
        </label>
        <select
          id="demo-scenario-select"
          onChange={(e) => onLoadScenario(e.target.value)}
          className="h-8 rounded border border-primary/20 bg-surface px-2 text-xs text-ink outline-none cursor-pointer font-medium"
          defaultValue=""
        >
          <option value="">-- Load Demo Scenario --</option>
          <option value="ai_engineer">Scenario 1: AI Engineer (OCR Fallback)</option>
          <option value="react_dev">Scenario 2: React Dev (Anti-Hallucination)</option>
        </select>
      </div>
    );
  },
);

QuickDemoSimulator.displayName = 'QuickDemoSimulator';
