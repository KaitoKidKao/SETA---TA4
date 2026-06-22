// biome-ignore-all lint/suspicious/noArrayIndexKey: log arrays have no stable id
import { Button, cn, Dropzone } from '@seta/shared-ui';
import { HardDrive, RefreshCw, Server, Trash2, Upload } from 'lucide-react';
import React from 'react';
import type { CriteriaState, UploadedCv } from '../hooks/use-smartrecruit-workflow';

interface IngestionSectionProps {
  ingestionMethod: 's3' | 'manual';
  setIngestionMethod: (method: 's3' | 'manual') => void;
  isImportingMockData: boolean;
  isScreeningMockPool: boolean;
  isGate1Active: boolean;
  runStatus: string | null;
  handleImportMockData: () => void;
  s3Logs: string[];
  s3Progress: number;
  criteriaOptions: CriteriaState[];
  selectedCriteriaId: string;
  setSelectedCriteriaId: (id: string) => void;
  mockDataSummary: string | null;
  handleCvUpload: (file: File) => void;
  isUploading: boolean;
  uploadedCvs: UploadedCv[];
  handleRemoveCv: (id: string) => void;
}

export const IngestionSection: React.FC<IngestionSectionProps> = React.memo(
  ({
    ingestionMethod,
    setIngestionMethod,
    isImportingMockData,
    isScreeningMockPool,
    isGate1Active,
    runStatus,
    handleImportMockData,
    s3Logs,
    s3Progress,
    criteriaOptions,
    selectedCriteriaId,
    setSelectedCriteriaId,
    mockDataSummary,
    handleCvUpload,
    isUploading,
    uploadedCvs,
    handleRemoveCv,
  }) => {
    return (
      <div className="flex flex-col gap-2.5 border-t border-hairline pt-4 font-sans">
        <div className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
          <HardDrive className="size-4 text-primary" /> 2. Candidate Source (Ingestion)
        </div>

        {/* Segmented Control (Tabs) cho HR dễ chọn */}
        <div className="grid grid-cols-2 p-1 bg-canvas rounded-lg border border-hairline">
          <button
            type="button"
            onClick={() => setIngestionMethod('s3')}
            className={cn(
              'py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer',
              ingestionMethod === 's3'
                ? 'bg-surface text-primary shadow-sm border border-hairline'
                : 'text-ink-subtle hover:text-ink',
            )}
          >
            <Server className="size-3" /> AWS S3 Cloud
          </button>
          <button
            type="button"
            onClick={() => setIngestionMethod('manual')}
            className={cn(
              'py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer',
              ingestionMethod === 'manual'
                ? 'bg-surface text-primary shadow-sm border border-hairline'
                : 'text-ink-subtle hover:text-ink',
            )}
          >
            <Upload className="size-3" /> Manual Upload
          </button>
        </div>

        {/* Nội dung tương ứng với nguồn đã chọn */}
        <div className="p-3 bg-canvas/30 rounded-lg border border-hairline min-h-[140px] flex flex-col justify-center">
          {ingestionMethod === 's3' ? (
            <div className="flex flex-col gap-2.5 animate-in fade-in duration-200">
              <p className="text-[11px] text-ink-subtle leading-relaxed">
                Sync candidate profiles in bulk from AWS S3 bucket straight to Vector DB.
              </p>

              <Button
                variant="secondary"
                onClick={handleImportMockData}
                disabled={
                  isImportingMockData ||
                  isScreeningMockPool ||
                  isGate1Active ||
                  runStatus === 'running'
                }
                className="w-full justify-center gap-2 h-9 bg-surface text-ink border border-hairline hover:bg-canvas/50 cursor-pointer"
              >
                <RefreshCw className={cn('size-3.5', isImportingMockData && 'animate-spin')} />
                {isImportingMockData ? 'Syncing...' : 'Sync S3 Candidates'}
              </Button>

              {/* S3 Simulation Progress */}
              {(isImportingMockData || s3Logs.length > 0) && (
                <div className="flex flex-col gap-2 mt-1 bg-zinc-950 p-2.5 rounded border border-zinc-800 shadow-inner">
                  <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${s3Progress}%` }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 max-h-16 overflow-y-auto font-mono text-[9px] text-zinc-400">
                    {s3Logs.map((log, idx) => (
                      <div key={`s3log-${idx}-${log.slice(0, 15)}`} className="truncate">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {criteriaOptions.length > 0 && (
                <div className="flex flex-col gap-1 mt-1 border-t border-hairline pt-2">
                  <div className="text-[10px] font-bold text-ink-subtle uppercase">
                    Criteria Profile Selector
                  </div>
                  <select
                    value={selectedCriteriaId}
                    onChange={(e) => setSelectedCriteriaId(e.target.value)}
                    className="h-8 rounded border border-hairline bg-surface px-2 text-xs text-ink outline-none"
                  >
                    <option value="">Select Criteria Profile</option>
                    {criteriaOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.job_title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mockDataSummary && !isImportingMockData && (
                <div className="p-2 bg-emerald-50 text-emerald-700 text-[10px] rounded border border-emerald-200 mt-1 font-medium text-center">
                  S3 Cloud Pool Synced & Indexed.
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 animate-in fade-in duration-200">
              <p className="text-[11px] text-ink-subtle leading-relaxed">
                Upload PDF CVs manually to bypass the cloud database.
              </p>

              <Dropzone
                onDrop={handleCvUpload}
                accept=".pdf"
                multiple
                maxFiles={50}
                maxSize={10 * 1024 * 1024}
                className="bg-surface border-hairline py-4 hover:bg-canvas/30 transition-colors"
                text={isUploading ? 'Uploading...' : 'Drag & drop CVs here'}
              />

              {uploadedCvs.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-1 border-t border-hairline pt-2">
                  <div className="text-[10px] font-bold text-ink-subtle uppercase">
                    Loaded Candidates ({uploadedCvs.length})
                  </div>
                  <div className="max-h-24 overflow-y-auto flex flex-col gap-1 border border-hairline p-1 rounded bg-surface">
                    {uploadedCvs.map((cv) => (
                      <div
                        key={cv.id}
                        className="flex items-center justify-between p-1 bg-canvas/30 rounded border border-hairline"
                      >
                        <span className="text-[10px] font-bold truncate text-ink max-w-[180px]">
                          {cv.name || cv.filename}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveCv(cv.id)}
                          className="h-5 w-5 p-0 text-rose-500 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);

IngestionSection.displayName = 'IngestionSection';
