// biome-ignore-all lint/suspicious/noExplicitAny: ignore explicit any type check
// biome-ignore-all lint/a11y/noLabelWithoutControl: ignore form label validation
// biome-ignore-all lint/a11y/noStaticElementInteractions: ignore static div onClick interactions
// biome-ignore-all lint/a11y/useKeyWithClickEvents: ignore keyboard event warnings on click
// biome-ignore-all lint/suspicious/noArrayIndexKey: ignore array index as key in loop
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-empty */

import { Button, cn, PageChrome } from '@seta/shared-ui';
import { Brain, CheckCircle, Loader2, Play } from 'lucide-react';
import { lazy, Suspense } from 'react';
// Static Subcomponents
import { BdiMemoryRibbon } from '../components/bdi-memory-ribbon';
import { IngestionSection } from '../components/ingestion-section';
import { JdFormSection } from '../components/jd-form-section';
import { QuickDemoSimulator } from '../components/quick-demo-simulator';
import { WorkflowStatusTimeline } from '../components/workflow-status-timeline';
import { useSmartRecruitWorkflow } from '../hooks/use-smartrecruit-workflow';

// Lazily Loaded Phase Components (Code-Splitting for bundle optimization)
const CriteriaReviewSection = lazy(() =>
  import('../components/criteria-review-section').then((m) => ({
    default: m.CriteriaReviewSection,
  })),
);

const LiveSimConsole = lazy(() =>
  import('../components/live-sim-console').then((m) => ({
    default: m.LiveSimConsole,
  })),
);

const OutreachApprovalSection = lazy(() =>
  import('../components/outreach-approval-section').then((m) => ({
    default: m.OutreachApprovalSection,
  })),
);

// Fallback Spinner for Suspense
const SuspenseFallback = () => (
  <div className="flex h-40 w-full items-center justify-center">
    <Loader2 className="size-8 animate-spin text-primary" />
  </div>
);

export function SmartrecruitPage() {
  const {
    runStatus,
    activeRunId,
    jobTitle,
    setJobTitle,
    jdText,
    setJdText,
    uploadedCvs,
    criteriaOptions,
    selectedCriteriaId,
    setSelectedCriteriaId,
    isImportingMockData,
    isScreeningMockPool,
    mockDataSummary,
    s3Logs,
    s3Progress,
    showLiveSim,
    liveSimLogs,
    liveSimCandidates,
    ingestionMethod,
    setIngestionMethod,
    activeApproval,
    isGate1Active,
    isGate2ActiveReal,
    isGate2Active,
    activeCriteria,
    setActiveCriteria,
    isConfirmingCriteria,
    isApprovingOutreach,
    selectedCandidate,
    setSelectedCandidate,
    editingDraft,
    setEditingDraft,
    filteredCandidates,
    isUploading,
    isHallucinationFail,
    handleCvUpload,
    handleRemoveCv,
    handleStartPipeline,
    handleImportMockData,
    handleConfirmCriteria,
    handleDeclineWorkflow,
    handleApproveOutreachBulk,
    resetPipeline,
    loadDemoScenario,
  } = useSmartRecruitWorkflow();

  return (
    <PageChrome title="SmartRecruit Screening & Outreach">
      {/* Container - Enterprise Master-Detail Layout */}
      <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-surface overflow-hidden">
        {/* BDI Memory Architecture Ribbon (Memoized) */}
        <BdiMemoryRibbon
          isGate1Active={isGate1Active}
          runStatus={runStatus}
          isGate2Active={isGate2Active}
          activeCriteria={activeCriteria}
        />

        {/* Master-Detail Split Pane */}
        <div className="flex flex-1 overflow-hidden">
          {/* CỘT TRÁI: PIPELINE CONFIGURATION (Master) */}
          <div className="w-[380px] shrink-0 border-r border-hairline bg-surface flex flex-col h-full z-10 shadow-sm relative">
            {/* Lock overlay */}
            {(isGate1Active || runStatus === 'running' || showLiveSim || isGate2Active) && (
              <div className="absolute inset-0 bg-canvas/70 backdrop-blur-[1.5px] z-20 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-250 font-sans">
                <div className="bg-surface border border-hairline p-5 rounded-2xl shadow-xl flex flex-col gap-3 max-w-[300px]">
                  <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-wider bg-amber-500/10 px-2.5 py-1 rounded-full w-fit mx-auto border border-amber-500/20">
                    Pipeline Active
                  </span>
                  <h4 className="text-body-sm font-bold text-ink">Configuration Locked</h4>
                  <p className="text-[10px] text-ink-subtle leading-relaxed">
                    The active BDI pipeline is running. Settings are read-only until the pipeline
                    completes or is aborted.
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={resetPipeline}
                    className="mt-2 h-9 text-xs font-bold cursor-pointer bg-surface hover:bg-canvas text-ink border border-hairline w-full justify-center"
                  >
                    Abort & Restart
                  </Button>
                </div>
              </div>
            )}

            <div className="p-4 border-b border-hairline flex flex-col gap-2">
              <h2 className="text-eyebrow font-bold text-ink-subtle uppercase">
                Pipeline Configuration
              </h2>

              {/* Quick Demo Simulator Selection */}
              <QuickDemoSimulator onLoadScenario={loadDemoScenario} />
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
              {/* PHẦN 1: THÔNG TIN CHIẾN DỊCH TUYỂN DỤNG (JD) (Memoized) */}
              <JdFormSection
                jobTitle={jobTitle}
                setJobTitle={setJobTitle}
                jdText={jdText}
                setJdText={setJdText}
              />

              {/* PHẦN 2: NGUỒN HỒ SƠ ỨNG VIÊN (INGESTION SOURCE) (Memoized) */}
              <IngestionSection
                ingestionMethod={ingestionMethod}
                setIngestionMethod={setIngestionMethod}
                isImportingMockData={isImportingMockData}
                isScreeningMockPool={isScreeningMockPool}
                isGate1Active={isGate1Active}
                runStatus={runStatus}
                handleImportMockData={handleImportMockData}
                s3Logs={s3Logs}
                s3Progress={s3Progress}
                criteriaOptions={criteriaOptions}
                selectedCriteriaId={selectedCriteriaId}
                setSelectedCriteriaId={setSelectedCriteriaId}
                mockDataSummary={mockDataSummary}
                handleCvUpload={handleCvUpload}
                isUploading={isUploading}
                uploadedCvs={uploadedCvs}
                handleRemoveCv={handleRemoveCv}
              />
            </div>

            <div className="p-4 border-t border-hairline bg-canvas/30">
              <Button
                onClick={handleStartPipeline}
                disabled={isGate1Active || runStatus === 'running' || isGate2Active}
                className="w-full bg-ink text-white hover:bg-ink-hover h-10 shadow-sm flex gap-2 justify-center font-medium transition-all cursor-pointer"
              >
                <Play className="size-4 fill-current" /> Launch BDI Pipeline
              </Button>
            </div>
          </div>

          {/* CỘT PHẢI: AGENT WORKSPACE (Detail) */}
          <div className="flex-1 bg-canvas flex flex-col h-full overflow-hidden relative">
            <div className="px-6 py-4 border-b border-hairline bg-surface shrink-0 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-3">
                <h2 className="text-eyebrow font-bold text-ink-subtle">
                  {isGate1Active || runStatus || isGate2Active
                    ? 'AGENT EXECUTION RUN'
                    : 'WORKSPACE'}
                </h2>

                {/* Embedded Stepper HUD */}
                {(isGate1Active || runStatus || isGate2Active) && (
                  <div className="hidden lg:flex items-center gap-1.5 ml-4 border-l border-hairline pl-4 text-[10px] font-mono">
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded transition-all',
                        isGate1Active
                          ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                      )}
                    >
                      1. parseJd {isGate1Active ? '●' : '✔'}
                    </span>
                    <span className="text-hairline-strong">→</span>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded transition-all',
                        showLiveSim
                          ? 'bg-blue-100 text-blue-800 border border-blue-300 animate-pulse font-bold'
                          : runStatus === 'running'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold'
                            : isGate2ActiveReal
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-canvas text-ink-muted border border-hairline',
                      )}
                    >
                      2. screenCvs {showLiveSim ? '▶' : isGate2ActiveReal ? '✔' : '○'}
                    </span>
                    <span className="text-hairline-strong">→</span>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded transition-all',
                        isGate2Active
                          ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                          : activeApproval?.stepId === 'smartrecruit.executeOutreach'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-canvas text-ink-muted border border-hairline',
                      )}
                    >
                      3. draftOutreach {isGate2Active ? '●' : '○'}
                    </span>
                    <span className="text-hairline-strong">→</span>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded transition-all',
                        'bg-canvas text-ink-muted border border-hairline',
                      )}
                    >
                      4. executeOutreach ○
                    </span>
                  </div>
                )}
              </div>

              {(isGate1Active || runStatus || isGate2Active) && (
                <div className="flex items-center gap-2 bg-surface-1 border border-hairline rounded-md px-2 py-1">
                  {activeRunId && (
                    <a
                      href={`/agent/workflows/${activeRunId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-primary hover:underline font-mono border-r border-hairline pr-2 mr-2 flex items-center gap-1"
                    >
                      Orchestrator HUD ↗
                    </a>
                  )}
                  <span
                    className={cn(
                      'flex size-2 rounded-full',
                      runStatus === 'running' || showLiveSim
                        ? 'bg-emerald-500 animate-ping'
                        : 'bg-amber-500',
                    )}
                  />
                  <span
                    className={cn(
                      'text-eyebrow font-bold uppercase',
                      runStatus === 'running' || showLiveSim
                        ? 'text-emerald-600'
                        : 'text-amber-600',
                    )}
                  >
                    {runStatus === 'running' || showLiveSim ? 'Running' : 'Paused (HITL)'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col gap-6 p-6 overflow-hidden min-h-0">
              {/* Timeline luôn hiển thị ở đầu giúp HR nắm bắt luồng chạy */}
              <WorkflowStatusTimeline
                isGate1Active={isGate1Active}
                runStatus={runStatus}
                showLiveSim={showLiveSim}
                isGate2Active={isGate2Active}
                isSuccess={runStatus === 'success'}
              />

              {/* Vùng nội dung chi tiết theo từng Phase */}
              <div className="flex-1 min-h-0 overflow-y-auto relative">
                {/* IDLE STATE: Màn hình hướng dẫn trực quan luồng tuyển dụng cho HR */}
                {!runStatus && !isGate1Active && !isGate2Active && (
                  <div className="h-full max-w-4xl mx-auto flex flex-col justify-center gap-8 py-6 font-sans animate-in fade-in duration-300">
                    <div className="flex flex-col gap-2 text-center">
                      <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1">
                        <Brain className="size-7" />
                      </div>
                      <h2 className="text-body-xl font-bold text-ink">
                        BDI Recruitment Agent Workspace
                      </h2>
                      <p className="text-body-sm text-ink-subtle max-w-lg mx-auto leading-relaxed">
                        Configure candidate source, define requirements, and coordinate the agent's
                        decision-making flow.
                      </p>
                    </div>

                    {/* Step Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-surface border border-hairline rounded-2xl flex gap-3 shadow-sm hover:border-primary/20 transition-colors">
                        <div className="size-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold font-mono">1</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <h4 className="text-xs font-bold text-ink">
                            1. Define & Approve Rules (Gate 1)
                          </h4>
                          <p className="text-[11px] text-ink-subtle leading-relaxed">
                            Paste a Job Description. Seta Agent automatically parses key
                            qualifications and pauses for your approval to lock requirements.
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-surface border border-hairline rounded-2xl flex gap-3 shadow-sm hover:border-primary/20 transition-colors">
                        <div className="size-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold font-mono">2</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <h4 className="text-xs font-bold text-ink">
                            2. Sync Candidate Ingestion
                          </h4>
                          <p className="text-[11px] text-ink-subtle leading-relaxed">
                            Sync CV profiles bulk from AWS S3 or manually upload PDF files. Seta
                            Agent will concurrently read and index all profiles.
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-surface border border-hairline rounded-2xl flex gap-3 shadow-sm hover:border-primary/20 transition-colors">
                        <div className="size-8 rounded-lg bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold font-mono">3</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <h4 className="text-xs font-bold text-ink">
                            3. Screen & Anti-Hallucination
                          </h4>
                          <p className="text-[11px] text-ink-subtle leading-relaxed">
                            Agent scores candidates and drafts outreach letters. An active adoption
                            filter filters out LLM hallucinations automatically.
                          </p>
                        </div>
                      </div>

                      <div className="p-4 bg-surface border border-hairline rounded-2xl flex gap-3 shadow-sm hover:border-primary/20 transition-colors">
                        <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold font-mono">4</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <h4 className="text-xs font-bold text-ink">
                            4. Review & Dispatch (Gate 2)
                          </h4>
                          <p className="text-[11px] text-ink-subtle leading-relaxed">
                            Inspect matching scorecards and edit email templates, then hit Dispatch
                            to initiate SMTP bulk mailing and update S3 history.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-canvas/50 p-4 rounded-2xl border border-hairline text-center">
                      <span className="text-[10px] text-primary bg-primary-tint/20 px-2 py-0.5 rounded-full font-bold uppercase mr-1.5">
                        Pro Tip
                      </span>
                      <span className="text-[11px] text-ink-subtle">
                        Chọn một kịch bản ở hộp <strong>Quick Demo Simulator</strong> bên trái để
                        điền nhanh dữ liệu mẫu!
                      </span>
                    </div>
                  </div>
                )}

                {/* Suspense Boundaries for code-split components */}
                <Suspense fallback={<SuspenseFallback />}>
                  {/* GIAI ĐOẠN 1 (GATE 1): DUYỆT TIÊU CHÍ */}
                  {isGate1Active && activeCriteria && (
                    <CriteriaReviewSection
                      activeCriteria={activeCriteria}
                      setActiveCriteria={setActiveCriteria}
                      isConfirmingCriteria={isConfirmingCriteria}
                      handleConfirmCriteria={handleConfirmCriteria}
                      handleDeclineWorkflow={handleDeclineWorkflow}
                    />
                  )}

                  {/* GIAI ĐOẠN 2: BDI LIVE CONSOLE (RUNNING) */}
                  {(runStatus === 'running' || showLiveSim) && !activeApproval && (
                    <LiveSimConsole
                      runStatus={runStatus}
                      showLiveSim={showLiveSim}
                      liveSimLogs={liveSimLogs}
                      liveSimCandidates={liveSimCandidates}
                    />
                  )}

                  {/* GIAI ĐOẠN 3 (GATE 2): DUYỆT SHORTLIST & DRAFTS */}
                  {isGate2Active && (
                    <OutreachApprovalSection
                      isGate2Active={isGate2Active}
                      filteredCandidates={filteredCandidates}
                      selectedCandidate={selectedCandidate}
                      handleSelectCandidate={setSelectedCandidate}
                      isHallucinationFail={isHallucinationFail}
                      editingDraft={editingDraft}
                      setEditingDraft={setEditingDraft}
                      isApprovingOutreach={isApprovingOutreach}
                      handleDeclineWorkflow={handleDeclineWorkflow}
                      handleApproveOutreachBulk={handleApproveOutreachBulk}
                    />
                  )}
                </Suspense>

                {/* SUCCESS STATE */}
                {runStatus === 'success' && (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-4 animate-in zoom-in-95 duration-300 font-sans">
                    <div className="size-20 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <CheckCircle className="size-10 text-emerald-500" />
                    </div>
                    <div className="flex flex-col gap-1 max-w-md">
                      <h2 className="text-body-xl font-bold text-ink">Pipeline Complete!</h2>
                      <p className="text-body-sm text-ink-subtle">
                        Outreach emails dispatched successfully. Interaction history has been saved
                        back to{' '}
                        <strong className="font-semibold text-ink">Long-term Memory (S3)</strong>.
                      </p>
                    </div>
                    <Button
                      onClick={resetPipeline}
                      className="bg-surface border border-hairline text-ink hover:bg-canvas mt-2 cursor-pointer"
                    >
                      Start New Workflow
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageChrome>
  );
}

export default SmartrecruitPage;
