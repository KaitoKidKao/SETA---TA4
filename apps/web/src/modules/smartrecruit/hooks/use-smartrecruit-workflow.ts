// biome-ignore-all lint/suspicious/noExplicitAny: workflow API shapes are untyped from BE
import { toast } from '@seta/shared-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface UploadedCv {
  id: string;
  filename: string;
  name: string;
  email: string;
  phone: string;
  text: string;
  status: 'uploading' | 'extracting' | 'ready' | 'error';
  error?: string;
}

export interface CriteriaState {
  id: string;
  external_criteria_id?: string | null;
  jd_id?: string | null;
  job_title: string;
  jd_text: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  min_yoe: number;
  education_level: string;
  additional_requirements: string;
}

export interface CandidateState {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  status: string;
  applied_position?: string | null;
  fit_score: number | null;
  screening_report: {
    pros: string[];
    gaps: string[];
    yoeExplanation: string;
    overallJustification: string;
    piiMapping?: Record<string, string>;
    mustHaveMatches: Array<{
      jdSkill: string;
      cvSkill: string | null;
      matched: boolean;
      justification: string;
    }>;
    niceToHaveMatches: Array<{
      jdSkill: string;
      cvSkill: string | null;
      matched: boolean;
      justification: string;
    }>;
  } | null;
}

export interface DraftState {
  id: string;
  candidate_id: string;
  subject: string;
  body: string;
  status: 'draft' | 'approved' | 'sent' | 'failed';
  hallucination_check_status: 'pending' | 'passed' | 'failed';
  error_reason: string | null;
}

async function readJsonResponse<T = any>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 300));
  }
}

export function useSmartRecruitWorkflow() {
  // Navigation & Core State
  const [activeTab, setActiveTab] = useState<'new' | 'active'>('new');

  // Suggested candidates from PgVector (Phase 2 LTM)
  const [suggestedCandidates, setSuggestedCandidates] = useState<CandidateState[]>([]);
  const [selectedSuggestedIds, setSelectedSuggestedIds] = useState<Record<string, boolean>>({});
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'pass' | 'fail' | 'hallucination'>(
    'all',
  );

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [lastLoadedApprovalId, setLastLoadedApprovalId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Form inputs
  const [jobTitle, setJobTitle] = useState('AI Engineer');
  const [jdText, setJdText] =
    useState(`We are looking for an AI Engineer to build and deploy advanced AI solutions.
- At least 3 years of experience in AI/ML development.
- Strong knowledge of Python, PyTorch, LLMs, and prompt engineering.
- Nice to have: LangChain, Vector Databases, and cloud deployment (AWS/GCP).
- Bachelor's degree in Computer Science, Mathematics, or related fields.`);

  const [uploadedCvs, setUploadedCvs] = useState<UploadedCv[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [criteriaOptions, setCriteriaOptions] = useState<CriteriaState[]>([]);
  const [selectedCriteriaId, setSelectedCriteriaId] = useState('');
  const [isImportingMockData, setIsImportingMockData] = useState(false);
  const [isScreeningMockPool, setIsScreeningMockPool] = useState(false);
  const [mockDataSummary, setMockDataSummary] = useState<string | null>(null);

  // S3 Simulation States
  const [s3Logs, setS3Logs] = useState<string[]>([]);
  const [s3Progress, setS3Progress] = useState(0);

  // Phase 2 Live Simulation States
  const [showLiveSim, setShowLiveSim] = useState(false);
  const [liveSimLogs, setLiveSimLogs] = useState<string[]>([]);
  const [liveSimCandidates, setLiveSimCandidates] = useState<any[]>([]);

  const [ingestionMethod, setIngestionMethod] = useState<'s3' | 'manual'>('s3');

  // Workflow run poll states
  const [activeApproval, setActiveApproval] = useState<any | null>(null);

  const isGate1Active =
    activeApproval?.stepId === 'smartrecruit.parseJd' ||
    activeApproval?.proposedPayload?.meta?.toolId === 'smartrecruit_parseJd';

  const isGate2ActiveReal =
    activeApproval?.stepId === 'smartrecruit.draftOutreach' ||
    activeApproval?.proposedPayload?.meta?.toolId === 'smartrecruit_draftOutreach';

  const isGate2Active = isGate2ActiveReal && !showLiveSim;

  // Gate 1: Criteria State
  const [activeCriteria, setActiveCriteria] = useState<CriteriaState | null>(null);
  const [newMustHave, setNewMustHave] = useState('');
  const [newNiceToHave, setNewNiceToHave] = useState('');
  const [isSavingCriteria, setIsSavingCriteria] = useState(false);
  const [isConfirmingCriteria, setIsConfirmingCriteria] = useState(false);
  const [isApprovingOutreach, setIsApprovingOutreach] = useState(false);
  const [skillGaps, setSkillGaps] = useState<any | null>(null);

  // Gate 2: Candidate Scorecard & Email workspace
  const [candidatesList, setCandidatesList] = useState<CandidateState[]>([]);
  const [draftsList, setDraftsList] = useState<DraftState[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateState | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftState | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const isHallucinationFail = useCallback(
    (candidateId: string) => {
      const draft = draftsList.find((d) => d.candidate_id === candidateId);
      return draft?.hallucination_check_status === 'failed';
    },
    [draftsList],
  );

  const filteredCandidates = useMemo(() => {
    return candidatesList.filter((cand) => {
      if (candidateFilter === 'all') return true;
      if (candidateFilter === 'pass') return (cand.fit_score ?? 0) >= 70;
      if (candidateFilter === 'fail') return (cand.fit_score ?? 0) < 70;
      if (candidateFilter === 'hallucination') return isHallucinationFail(cand.id);
      return true;
    });
  }, [candidatesList, candidateFilter, isHallucinationFail]);

  const isAnyCvNotReady = useMemo(() => {
    return uploadedCvs.some((c) => c.status !== 'ready');
  }, [uploadedCvs]);

  const dataWarnings = useMemo(() => {
    const list: string[] = [];
    if (activeCriteria) {
      const jdId = activeCriteria.jd_id || activeCriteria.external_criteria_id;
      if (!jdId) {
        list.push('Cảnh báo: Không tìm thấy mã liên kết mô tả công việc (jd_id).');
      } else if (!/^[A-Z]{2,4}-[A-Z]{2,4}-[A-Z]{2,4}-\d{3}$/.test(jdId) && jdId.length <= 6) {
        list.push(
          `Cảnh báo: Mã JD liên kết (${jdId}) có thể bị lệch cấu trúc so với định dạng đầy đủ (Ví dụ: JD-AI-SR-001).`,
        );
      }
      if (!activeCriteria.must_have_skills || activeCriteria.must_have_skills.length === 0) {
        list.push('Cảnh báo: Chưa cấu hình kỹ năng bắt buộc (Must-Have Skills) cho đợt sàng lọc.');
      }
      if (activeCriteria.min_yoe === 0) {
        list.push('Cảnh báo: Số năm kinh nghiệm tối thiểu đang cấu hình bằng 0.');
      }
    }
    for (const cv of uploadedCvs) {
      if (cv.status === 'ready') {
        if (!cv.email) {
          list.push(`Cảnh báo: Ứng viên "${cv.name || cv.filename}" thiếu địa chỉ email.`);
        }
        if (!cv.phone) {
          list.push(`Cảnh báo: Ứng viên "${cv.name || cv.filename}" thiếu số điện thoại liên hệ.`);
        }
      }
    }
    return list;
  }, [activeCriteria, uploadedCvs]);

  const fetchCriteriaList = useCallback(async () => {
    try {
      const res = await fetch('/api/smartrecruit/v1/criteria');
      if (!res.ok) return;
      const data = await res.json();
      const rows = data.criteria ?? [];
      setCriteriaOptions(rows);
      setSelectedCriteriaId((current) => current || rows[0]?.id || '');
    } catch (_err) {}
  }, []);

  const fetchCriteriaDetails = useCallback(async (criteriaId: string) => {
    try {
      const res = await fetch(`/api/smartrecruit/v1/criteria/${criteriaId}`);
      const data = await res.json();
      setActiveCriteria(data);
      if (data.job_title) {
        const gapRes = await fetch(
          `/api/smartrecruit/v1/skill-gaps?jobTitle=${encodeURIComponent(data.job_title)}`,
        );
        if (gapRes.ok) {
          const gapData = await gapRes.json();
          setSkillGaps(gapData);
        }
      }
    } catch (_err) {}
  }, []);

  const fetchSuggestedCandidates = useCallback(async (criteriaId: string) => {
    setIsLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/smartrecruit/v1/criteria/${criteriaId}/suggest-candidates`);
      if (res.ok) {
        const data = await res.json();
        const list = data.candidates || [];
        setSuggestedCandidates(list);
        const sel: Record<string, boolean> = {};
        for (const c of list) {
          sel[c.id] = true;
        }
        setSelectedSuggestedIds(sel);
      }
    } catch (_err) {}
    setIsLoadingSuggestions(false);
  }, []);

  const fetchCandidatesAndDrafts = useCallback(async () => {
    try {
      const resCand = await fetch('/api/smartrecruit/v1/candidates');
      const dataCand = await resCand.json();
      const cands = dataCand.candidates || [];

      const resDraft = await fetch('/api/smartrecruit/v1/outreach/drafts');
      const dataDraft = await resDraft.json();
      const drafts = dataDraft.drafts || [];

      let currentCriteriaId = activeCriteria?.id || '';
      if (!currentCriteriaId && cands.length > 0) {
        const firstWithReport = cands.find((c: any) => c.screening_report?.criteriaId);
        if (firstWithReport) {
          currentCriteriaId = firstWithReport.screening_report.criteriaId;
          fetchCriteriaDetails(currentCriteriaId);
        }
      }

      const filteredCands = currentCriteriaId
        ? cands.filter((c: any) => c.screening_report?.criteriaId === currentCriteriaId)
        : cands;

      setCandidatesList(filteredCands);
      setDraftsList(drafts);

      if (filteredCands.length > 0 && !selectedCandidate) {
        setSelectedCandidate(filteredCands[0]);
        const matchedDraft = drafts.find((d: any) => d.candidate_id === filteredCands[0].id);
        setEditingDraft(matchedDraft || null);
      }
    } catch (_err) {}
  }, [selectedCandidate, activeCriteria, fetchCriteriaDetails]);

  const fetchPendingRuns = useCallback(async () => {
    try {
      const res = await fetch(
        '/api/agent/v1/workflows/runs?workflowId=smartrecruit.workflow&scope=self',
      );
      const data = await res.json();
      if (data.rows && data.rows.length > 0) {
        const running = data.rows.find((r: any) => r.status === 'paused' || r.status === 'running');
        if (running) {
          setActiveRunId(running.runId);
          setRunStatus(running.status);
          setActiveTab('active');
        }
      }
    } catch (_err) {}
  }, []);

  const pollRunStatus = useCallback(async () => {
    if (!activeRunId) return;
    try {
      const res = await fetch(`/api/agent/v1/workflows/runs/${activeRunId}`);
      if (res.status === 404) {
        setActiveRunId(null);
        setRunStatus(null);
        return;
      }
      const data = await res.json();
      setRunStatus(data.status);
      if (data.status === 'success') {
        fetchCandidatesAndDrafts();
      } else if (data.status === 'failed') {
        setRunError(data.errorSummary ?? 'Run failed.');
      }
    } catch (_err) {}
  }, [activeRunId, fetchCandidatesAndDrafts]);

  const fetchPendingApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/v1/workflows/my-pending-approvals');
      const data = await res.json();
      const app = data.find((a: any) => a.runId === activeRunId);
      setActiveApproval(app || null);
    } catch (_err) {}
  }, [activeRunId]);

  // Fetch pending runs and criteria list on mount
  useEffect(() => {
    fetchCriteriaList();
    fetchPendingRuns();
  }, [fetchPendingRuns, fetchCriteriaList]);

  // Poll active run and pending approvals if a run is running
  useEffect(() => {
    if (!activeRunId) return;

    const interval = setInterval(() => {
      pollRunStatus();
      fetchPendingApprovals();
    }, 2000);

    return () => clearInterval(interval);
  }, [activeRunId, pollRunStatus, fetchPendingApprovals]);

  // Trigger loading details when Gate 1 or Gate 2 is active
  useEffect(() => {
    if (!activeApproval) {
      setActiveCriteria(null);
      setSuggestedCandidates([]);
      setSelectedSuggestedIds({});
      setLastLoadedApprovalId(null);
      return;
    }

    const currentApprovalId = activeApproval.proposedPayload?.toolCallId
      ? `${activeApproval.proposedPayload.toolCallId}:${activeApproval.stepId || activeApproval.proposedPayload?.meta?.toolId}`
      : activeApproval.stepId;
    if (currentApprovalId === lastLoadedApprovalId) {
      return;
    }

    if (isGate1Active) {
      const criteriaId = activeApproval.proposedPayload?.primary?.argsPatch?.criteriaId;
      if (criteriaId) {
        setLastLoadedApprovalId(currentApprovalId);
        fetchCriteriaDetails(criteriaId);
        fetchSuggestedCandidates(criteriaId);
      }
    } else if (isGate2Active) {
      setLastLoadedApprovalId(currentApprovalId);
      fetchCandidatesAndDrafts();
    }
  }, [
    activeApproval,
    isGate1Active,
    isGate2Active,
    lastLoadedApprovalId,
    fetchCriteriaDetails,
    fetchSuggestedCandidates,
    fetchCandidatesAndDrafts,
  ]);

  const runLiveSimulation = useCallback(() => {
    setShowLiveSim(true);
    setLiveSimLogs([]);

    const candidates = [
      {
        id: '1',
        name: 'Nguyen_AI_Specialist.pdf',
        status: 'Scanning...',
        progress: 10,
        label: 'text_extract',
        fitScore: null,
      },
      {
        id: '2',
        name: 'Corrupted_Scan_Report.pdf',
        status: 'Scanning...',
        progress: 10,
        label: 'corrupted',
        fitScore: null,
      },
      {
        id: '3',
        name: 'Tuan_Frontend_Dev.pdf',
        status: 'Scanning...',
        progress: 10,
        label: 'hallucination_test',
        fitScore: null,
      },
      {
        id: '4',
        name: 'Nguyen_Thi_B.pdf',
        status: 'Scanning...',
        progress: 10,
        label: 'normal',
        fitScore: null,
      },
      {
        id: '5',
        name: 'Pham_Minh_C.pdf',
        status: 'Scanning...',
        progress: 10,
        label: 'normal',
        fitScore: null,
      },
    ];
    setLiveSimCandidates(candidates);

    const logs = [
      '[Planner] Intent recognized: Screen candidates against approved criteria.',
      '[Tool] Executing semantic_search_tool on Long-term Mem (S3)...',
      '[Feedback] Found 5 candidate files. Fetching PDF binaries...',
      '[Tool] Executing screen_cv_tool concurrently...',
    ];

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step === 1) {
        setLiveSimLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ${logs[0]}`,
          `[${new Date().toLocaleTimeString()}] ${logs[1]}`,
        ]);
        setLiveSimCandidates((prev) =>
          prev.map((c) => ({ ...c, status: 'Extracting text...', progress: 30 })),
        );
      } else if (step === 2) {
        setLiveSimLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ${logs[2]}`,
          `[${new Date().toLocaleTimeString()}] ${logs[3]}`,
        ]);
        setLiveSimCandidates((prev) =>
          prev.map((c) => {
            if (c.label === 'corrupted')
              return {
                ...c,
                status: 'Corrupted file detected! Triggering OCR Fallback...',
                progress: 40,
              };
            return { ...c, status: 'Scoring match...', progress: 60 };
          }),
        );
      } else if (step === 3) {
        setLiveSimLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] [ALT-ERROR] Corrupted file format for Corrupted_Scan_Report.pdf. Triggering OCR Fallback...`,
          `[${new Date().toLocaleTimeString()}] [Tool] Executing ocr_tool...`,
        ]);
        setLiveSimCandidates((prev) =>
          prev.map((c) => {
            if (c.label === 'corrupted') return { ...c, status: 'Running OCR...', progress: 70 };
            if (c.id === '1') return { ...c, status: 'Drafting email...', progress: 80 };
            return c;
          }),
        );
      } else if (step === 4) {
        setLiveSimLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] [Feedback] OCR successful. Extracted text from scanned PDF.`,
          `[${new Date().toLocaleTimeString()}] [Tool] Executing draft_outreach_tool for candidates...`,
        ]);
        setLiveSimCandidates((prev) =>
          prev.map((c) => {
            if (c.label === 'corrupted') return { ...c, status: 'Scoring match...', progress: 80 };
            if (c.label === 'hallucination_test')
              return { ...c, status: 'Checking draft for hallucinations...', progress: 80 };
            if (c.id === '1')
              return { ...c, status: 'Done (85% Match)', progress: 100, fitScore: 85 };
            return c;
          }),
        );
      } else if (step === 5) {
        setLiveSimLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] [ANTI-HALLUCINATION FILTER] Hallucination detected in draft for Tuan_Frontend_Dev.pdf!`,
          `[${new Date().toLocaleTimeString()}] [BDI Agent] Regenerating draft with Temperature=0...`,
        ]);
        setLiveSimCandidates((prev) =>
          prev.map((c) => {
            if (c.label === 'hallucination_test')
              return { ...c, status: 'Hallucination Alert! Regenerating...', progress: 90 };
            if (c.label === 'corrupted')
              return { ...c, status: 'Done (72% Match)', progress: 100, fitScore: 72 };
            if (c.label === 'normal')
              return {
                ...c,
                status: c.id === '4' ? 'Done (45% Match)' : 'Done (62% Match)',
                progress: 100,
                fitScore: c.id === '4' ? 45 : 62,
              };
            return c;
          }),
        );
      } else if (step === 6) {
        setLiveSimLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] [Feedback] Safe draft generated for Tuan_Frontend_Dev.pdf.`,
          `[${new Date().toLocaleTimeString()}] [BDI Agent] Phase 2 Complete. Saving drafts to Working Mem (Beliefs)...`,
        ]);
        setLiveSimCandidates((prev) =>
          prev.map((c) => {
            if (c.label === 'hallucination_test')
              return { ...c, status: 'Done (82% Match)', progress: 100, fitScore: 82 };
            return c;
          }),
        );
      } else if (step >= 7) {
        clearInterval(interval);
        setShowLiveSim(false);
      }
    }, 1200);
  }, []);

  // --- CV Upload Handler ---
  const handleCvUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setErrorMsg(null);
    const tempId = crypto.randomUUID();
    const newUpload: UploadedCv = {
      id: tempId,
      filename: file.name,
      name: '',
      email: '',
      phone: '',
      text: '',
      status: 'uploading',
    };
    setUploadedCvs((prev) => [...prev, newUpload]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/smartrecruit/v1/upload-cv', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload CV file failed.');
      }

      const data = await res.json();

      setUploadedCvs((prev) =>
        prev.map((c) => (c.id === tempId ? { ...c, text: data.text, status: 'extracting' } : c)),
      );

      // Extract candidate details via LLM
      const resInfo = await fetch('/api/smartrecruit/v1/extract-candidate-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: data.text }),
      });

      const dataInfo = await resInfo.json();
      setUploadedCvs((prev) =>
        prev.map((c) =>
          c.id === tempId
            ? {
                ...c,
                name: dataInfo.name || file.name.replace(/\.[^/.]+$/, ''),
                email: dataInfo.email || 'candidate@example.com',
                phone: dataInfo.phone || '',
                status: 'ready',
              }
            : c,
        ),
      );
    } catch (err) {
      setUploadedCvs((prev) =>
        prev.map((c) =>
          c.id === tempId ? { ...c, status: 'error', error: (err as Error).message } : c,
        ),
      );
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleRemoveCv = useCallback((id: string) => {
    setUploadedCvs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // --- Start Workflow Run ---
  const handleStartPipeline = useCallback(async () => {
    if (uploadedCvs.length === 0) {
      setErrorMsg('Please upload at least one candidate CV.');
      return;
    }
    const readyCvs = uploadedCvs.filter((c) => c.status === 'ready');
    if (readyCvs.length === 0) {
      setErrorMsg('No ready CVs to process. Please wait for upload to complete.');
      return;
    }

    try {
      const res = await fetch('/api/agent/v1/workflows/runs/smartrecruit/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle,
          jdText,
          cvs: readyCvs.map((c) => ({
            candidateName: c.name,
            candidateEmail: c.email,
            candidatePhone: c.phone,
            cvText: c.text,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to initiate recruitment agentic workflow');
      }

      const data = await readJsonResponse<{ runId?: string; error?: string; message?: string }>(
        res,
      );
      if (!data?.runId) {
        throw new Error(data?.message || data?.error || 'Workflow start returned no run ID.');
      }
      setActiveRunId(data.runId);
      setRunStatus('running');
      setRunError(null);
      setActiveTab('active');
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }, [jobTitle, jdText, uploadedCvs]);

  const handleImportMockData = useCallback(async () => {
    setIsImportingMockData(true);
    setErrorMsg(null);
    setMockDataSummary(null);
    setS3Logs([]);
    setS3Progress(0);

    // Simulate S3 Connection visually
    const addLog = (msg: string, progress: number, delay: number) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setS3Logs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
          setS3Progress(progress);
          resolve();
        }, delay);
      });
    };

    try {
      await addLog('[S3] Connecting to secure bucket s3://seta-ta4-resumes...', 10, 500);
      await addLog('[S3] Authentication successful. Scanning for candidate profiles...', 30, 800);

      const res = await fetch('/api/smartrecruit/v1/mock-data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      await addLog('[S3] Found raw candidate batch. Downloading PDF binaries...', 60, 600);

      const data = await readJsonResponse<{
        error?: string;
        message?: string;
        candidates?: { created: number; updated: number };
        criteria?: { created: number; updated: number };
        templates?: { created: number; updated: number };
      }>(res);

      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to import mock dataset.');
      }

      await addLog('[Vector DB] Extracting text and indexing candidate embeddings...', 80, 800);
      await addLog(
        `[Vector DB] Indexing complete. ${data?.candidates?.created || 0} candidates ready for retrieval.`,
        100,
        500,
      );

      if (!data?.candidates || !data.criteria || !data.templates) {
        throw new Error('Import mock dataset returned an empty or invalid response.');
      }

      setMockDataSummary(
        `Imported ${data.candidates.created} new and ${data.candidates.updated} updated candidates, ${data.criteria.created} new and ${data.criteria.updated} updated criteria, ${data.templates.created} new and ${data.templates.updated} updated templates.`,
      );
      await fetchCriteriaList();
      await fetchCandidatesAndDrafts();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setTimeout(() => setIsImportingMockData(false), 500);
    }
  }, [fetchCriteriaList, fetchCandidatesAndDrafts]);

  const handleScreenMockPool = useCallback(async () => {
    if (!selectedCriteriaId) {
      setErrorMsg('Please import mock data and select screening criteria first.');
      return;
    }

    setIsScreeningMockPool(true);
    setErrorMsg(null);
    setMockDataSummary(null);
    try {
      const res = await fetch(
        `/api/smartrecruit/v1/criteria/${selectedCriteriaId}/screen-candidates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 25, includeAlreadyScreened: true }),
        },
      );

      const data = await readJsonResponse<{
        error?: string;
        message?: string;
        screened?: number;
        skipped?: number;
      }>(res);
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to screen candidate pool.');
      }
      if (!data) {
        throw new Error('Candidate pool screening returned an empty response.');
      }

      setMockDataSummary(
        `Screened ${data.screened} candidates from the mock pool. ${data.skipped} candidates were skipped.`,
      );
      await fetchCandidatesAndDrafts();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsScreeningMockPool(false);
    }
  }, [selectedCriteriaId, fetchCandidatesAndDrafts]);

  // --- Gate 1 Action Handlers ---
  const handleSaveCriteria = useCallback(async () => {
    if (!activeCriteria) return;
    setIsSavingCriteria(true);
    try {
      const res = await fetch(`/api/smartrecruit/v1/criteria/${activeCriteria.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mustHaveSkills: activeCriteria.must_have_skills,
          niceToHaveSkills: activeCriteria.nice_to_have_skills,
          minYoe: activeCriteria.min_yoe,
          educationLevel: activeCriteria.education_level,
          additionalRequirements: activeCriteria.additional_requirements,
        }),
      });
      if (res.ok) {
        fetchCriteriaDetails(activeCriteria.id);
      }
    } catch (_err) {}
    setIsSavingCriteria(false);
  }, [activeCriteria, fetchCriteriaDetails]);

  const handleConfirmCriteria = useCallback(async () => {
    if (!activeApproval || isConfirmingCriteria) return;
    setIsConfirmingCriteria(true);
    setErrorMsg(null);
    try {
      // First save edits
      await handleSaveCriteria();

      const payload = activeApproval.proposedPayload?.primary?.argsPatch || {};
      const selectedIds = Object.entries(selectedSuggestedIds)
        .filter(([_, checked]) => checked)
        .map(([id]) => id);

      const res = await fetch(
        `/api/agent/v1/workflows/approvals/${activeApproval.approvalId}/decide`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'approve',
            ...payload,
            additionalCandidateIds: selectedIds,
          }),
        },
      );

      if (res.ok) {
        setActiveApproval(null);
        setRunStatus('running');
        runLiveSimulation();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.message || 'Failed to confirm criteria.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsConfirmingCriteria(false);
    }
  }, [
    activeApproval,
    isConfirmingCriteria,
    handleSaveCriteria,
    selectedSuggestedIds,
    runLiveSimulation,
  ]);

  const handleDeclineWorkflow = useCallback(async () => {
    if (!activeApproval) return;
    try {
      const res = await fetch(
        `/api/agent/v1/workflows/approvals/${activeApproval.approvalId}/decide`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'reject',
          }),
        },
      );
      if (res.ok) {
        setActiveApproval(null);
        setActiveRunId(null);
        setRunStatus(null);
        setActiveTab('new');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.message || 'Failed to decline workflow.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  }, [activeApproval]);

  const handleSaveDraft = useCallback(async () => {
    if (!editingDraft) return;
    setIsSavingDraft(true);
    try {
      const res = await fetch(`/api/smartrecruit/v1/outreach/drafts/${editingDraft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: editingDraft.subject,
          body: editingDraft.body,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDraftsList((prev) => prev.map((d) => (d.id === data.id ? data : d)));
      }
    } catch (_err) {}
    setIsSavingDraft(false);
  }, [editingDraft]);

  const handleApproveOutreachBulk = useCallback(async () => {
    if (!activeApproval || isApprovingOutreach) return;
    setIsApprovingOutreach(true);
    setErrorMsg(null);
    try {
      if (editingDraft) {
        await handleSaveDraft();
      }

      const payload = activeApproval.proposedPayload?.primary?.argsPatch || {};
      const res = await fetch(
        `/api/agent/v1/workflows/approvals/${activeApproval.approvalId}/decide`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'approve', ...payload }),
        },
      );
      if (res.ok) {
        setActiveApproval(null);
        setRunStatus('success');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.message || 'Failed to approve outreach.');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsApprovingOutreach(false);
    }
  }, [activeApproval, isApprovingOutreach, editingDraft, handleSaveDraft]);

  const resetPipeline = useCallback(() => {
    setActiveRunId(null);
    setRunStatus(null);
    setRunError(null);
    setUploadedCvs([]);
    setCandidatesList([]);
    setDraftsList([]);
    setSelectedCandidate(null);
    setEditingDraft(null);
    setActiveTab('new');
  }, []);

  const loadDemoScenario = useCallback((scenarioId: string) => {
    if (!scenarioId) return;
    if (scenarioId === 'ai_engineer') {
      setJobTitle('AI Engineer');
      setJdText(`We are looking for an AI Engineer to build and deploy advanced AI solutions.
- At least 3 years of experience in AI/ML development.
- Strong knowledge of Python, PyTorch, LLMs, and prompt engineering.
- Nice to have: LangChain, Vector Databases, and cloud deployment (AWS/GCP).`);
      setUploadedCvs([
        {
          id: 'mock_1',
          filename: 'Nguyen_AI_Specialist.pdf',
          name: 'Nguyen_AI_Specialist.pdf',
          email: 'nguyen.ai@example.com',
          phone: '+84909123456',
          status: 'ready',
          text: '5 YOE, PyTorch, Python, LLMs, LangChain, Vector Databases',
        },
        {
          id: 'mock_2',
          filename: 'Corrupted_Scan_Report.pdf',
          name: 'Corrupted_Scan_Report.pdf',
          email: 'corrupted@example.com',
          phone: '+84909123457',
          status: 'ready',
          text: 'ERROR_FILE_CORRUPTED_USE_OCR',
        },
      ]);
      setIngestionMethod('s3');
      toast.success('Loaded Scenario 1: AI Engineer (with OCR Fallback)');
    } else if (scenarioId === 'react_dev') {
      setJobTitle('React Developer');
      setJdText(`We are looking for a Senior Frontend Developer specializing in React.
- At least 5 years of experience in modern Javascript/TypeScript and React.
- Strong UI skills with TailwindCSS and Framer Motion.
- Nice to have: Next.js and state management.`);
      setUploadedCvs([
        {
          id: 'mock_3',
          filename: 'Tuan_Frontend_Dev.pdf',
          name: 'Tuan_Frontend_Dev.pdf',
          email: 'tuan.fe@example.com',
          phone: '+84909123458',
          status: 'ready',
          text: '5 years React, TypeScript, TailwindCSS, Next.js',
        },
      ]);
      setIngestionMethod('manual');
      toast.success('Loaded Scenario 2: React Developer (with Anti-Hallucination)');
    }
  }, []);

  return {
    activeTab,
    setActiveTab,
    suggestedCandidates,
    setSuggestedCandidates,
    selectedSuggestedIds,
    setSelectedSuggestedIds,
    isLoadingSuggestions,
    candidateFilter,
    setCandidateFilter,
    activeRunId,
    setActiveRunId,
    runStatus,
    setRunStatus,
    runError,
    setRunError,
    jobTitle,
    setJobTitle,
    jdText,
    setJdText,
    uploadedCvs,
    setUploadedCvs,
    isUploading,
    errorMsg,
    setErrorMsg,
    criteriaOptions,
    selectedCriteriaId,
    setSelectedCriteriaId,
    isImportingMockData,
    isScreeningMockPool,
    mockDataSummary,
    s3Logs,
    s3Progress,
    showLiveSim,
    setShowLiveSim,
    liveSimLogs,
    liveSimCandidates,
    ingestionMethod,
    setIngestionMethod,
    activeApproval,
    setActiveApproval,
    isGate1Active,
    isGate2ActiveReal,
    isGate2Active,
    activeCriteria,
    setActiveCriteria,
    newMustHave,
    setNewMustHave,
    newNiceToHave,
    setNewNiceToHave,
    isSavingCriteria,
    isConfirmingCriteria,
    isApprovingOutreach,
    skillGaps,
    candidatesList,
    setCandidatesList,
    draftsList,
    setDraftsList,
    selectedCandidate,
    setSelectedCandidate,
    editingDraft,
    setEditingDraft,
    isSavingDraft,
    filteredCandidates,
    isAnyCvNotReady,
    dataWarnings,
    isHallucinationFail,
    handleCvUpload,
    handleRemoveCv,
    handleStartPipeline,
    handleImportMockData,
    handleScreenMockPool,
    handleSaveCriteria,
    handleConfirmCriteria,
    handleDeclineWorkflow,
    handleSaveDraft,
    handleApproveOutreachBulk,
    resetPipeline,
    loadDemoScenario,
    runLiveSimulation,
  };
}
