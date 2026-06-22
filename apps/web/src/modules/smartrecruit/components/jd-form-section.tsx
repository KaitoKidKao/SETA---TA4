import { Input, Textarea } from '@seta/shared-ui';
import { FileText } from 'lucide-react';
import React from 'react';

interface JdFormSectionProps {
  jobTitle: string;
  setJobTitle: (val: string) => void;
  jdText: string;
  setJdText: (val: string) => void;
}

export const JdFormSection: React.FC<JdFormSectionProps> = React.memo(
  ({ jobTitle, setJobTitle, jdText, setJdText }) => {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5 font-sans">
          <FileText className="size-4 text-primary" /> 1. Job Description (Desires)
        </div>
        <div className="flex flex-col gap-2 p-3 bg-canvas/30 rounded-lg border border-hairline">
          <Input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Job Title (e.g. React Developer)"
            className="border-hairline h-9 bg-surface text-body-sm"
          />
          <Textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste your Job Description here to set Agent Desires..."
            rows={6}
            className="border-hairline resize-none bg-surface text-body-sm font-mono text-[11px]"
          />
        </div>
      </div>
    );
  },
);

JdFormSection.displayName = 'JdFormSection';
