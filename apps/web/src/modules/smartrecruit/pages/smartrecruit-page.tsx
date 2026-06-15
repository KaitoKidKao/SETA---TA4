// biome-ignore-all lint/suspicious/noExplicitAny: ignore explicit any type check
// biome-ignore-all lint/a11y/noLabelWithoutControl: ignore form label validation
// biome-ignore-all lint/a11y/noStaticElementInteractions: ignore static div onClick interactions
// biome-ignore-all lint/a11y/useKeyWithClickEvents: ignore keyboard event warnings on click
// biome-ignore-all lint/suspicious/noArrayIndexKey: ignore array index as key in loop
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-empty */
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Dropzone,
  Input,
  PageChrome,
  Textarea,
} from '@seta/shared-ui';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronRight,
  FileText,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
  User,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface UploadedCv {
  id: string;
  filename: string;
  name: string;
  email: string;
  phone: string;
  text: string;
  status: 'uploading' | 'extracting' | 'ready' | 'error';
  error?: string;
}

interface CriteriaState {
  id: string;
  external_criteria_id?: string | null;
  job_title: string;
  jd_text: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  min_yoe: number;
  education_level: string;
  additional_requirements: string;
}

interface CandidateState {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  status: string;
  fit_score: number | null;
  screening_report: {
    pros: string[];
    gaps: string[];
    yoeExplanation: string;
    overallJustification: string;
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

interface DraftState {
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

export function SmartrecruitPage() {
  // Navigation & Core State
  const [activeTab, setActiveTab] = useState<'new' | 'active'>('new');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
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

  // Workflow run poll states
  const [activeApproval, setActiveApproval] = useState<any | null>(null);

  const isGate1Active =
    activeApproval?.stepId === 'smartrecruit.parseJd' ||
    activeApproval?.proposedPayload?.meta?.toolId === 'smartrecruit_parseJd';

  const isGate2Active =
    activeApproval?.stepId === 'smartrecruit.draftOutreach' ||
    activeApproval?.proposedPayload?.meta?.toolId === 'smartrecruit_draftOutreach';

  // Gate 1: Criteria State
  const [activeCriteria, setActiveCriteria] = useState<CriteriaState | null>(null);
  const [newMustHave, setNewMustHave] = useState('');
  const [newNiceToHave, setNewNiceToHave] = useState('');
  const [isSavingCriteria, setIsSavingCriteria] = useState(false);

  // Gate 2: Candidate Scorecard & Email workspace
  const [candidatesList, setCandidatesList] = useState<CandidateState[]>([]);
  const [draftsList, setDraftsList] = useState<DraftState[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateState | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftState | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [sentDrafts, setSentDrafts] = useState<Record<string, boolean>>({});

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
    } catch (_err) {}
  }, []);

  const fetchCandidatesAndDrafts = useCallback(async () => {
    try {
      const resCand = await fetch('/api/smartrecruit/v1/candidates');
      const dataCand = await resCand.json();
      setCandidatesList(dataCand.candidates);

      const resDraft = await fetch('/api/smartrecruit/v1/outreach/drafts');
      const dataDraft = await resDraft.json();
      setDraftsList(dataDraft.drafts);

      if (dataCand.candidates.length > 0 && !selectedCandidate) {
        setSelectedCandidate(dataCand.candidates[0]);
        const matchedDraft = dataDraft.drafts.find(
          (d: any) => d.candidate_id === dataCand.candidates[0].id,
        );
        setEditingDraft(matchedDraft || null);
      }
    } catch (_err) {}
  }, [selectedCandidate]);

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
      return;
    }

    if (isGate1Active) {
      const criteriaId = activeApproval.proposedPayload?.primary?.argsPatch?.criteriaId;
      if (criteriaId) {
        fetchCriteriaDetails(criteriaId);
      }
    } else if (isGate2Active) {
      fetchCandidatesAndDrafts();
    }
  }, [
    activeApproval,
    isGate1Active,
    isGate2Active,
    fetchCriteriaDetails,
    fetchCandidatesAndDrafts,
  ]);

  // --- CV Upload Handler ---
  const handleCvUpload = async (file: File) => {
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
  };

  const handleRemoveCv = (id: string) => {
    setUploadedCvs((prev) => prev.filter((c) => c.id !== id));
  };

  const handleUpdateCvInfo = (id: string, field: 'name' | 'email', value: string) => {
    setUploadedCvs((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  // --- Start Workflow Run ---
  const handleStartPipeline = async () => {
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
  };

  const handleImportMockData = async () => {
    setIsImportingMockData(true);
    setErrorMsg(null);
    setMockDataSummary(null);
    try {
      const res = await fetch('/api/smartrecruit/v1/mock-data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

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
      setIsImportingMockData(false);
    }
  };

  const handleScreenMockPool = async () => {
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
  };

  // --- Gate 1 Action Handlers ---
  const handleSaveCriteria = async () => {
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
  };

  const handleConfirmCriteria = async () => {
    if (!activeApproval) return;
    try {
      // First save edits
      await handleSaveCriteria();

      const res = await fetch(
        `/api/agent/v1/workflows/approvals/${activeApproval.approvalId}/decide`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'approve',
          }),
        },
      );
      if (res.ok) {
        setActiveApproval(null);
        setRunStatus('running');
      }
    } catch (_err) {}
  };

  const handleDeclineWorkflow = async () => {
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
      }
    } catch (_err) {}
  };

  const addMustHave = () => {
    if (!newMustHave.trim() || !activeCriteria) return;
    setActiveCriteria({
      ...activeCriteria,
      must_have_skills: [...activeCriteria.must_have_skills, newMustHave.trim()],
    });
    setNewMustHave('');
  };

  const addNiceToHave = () => {
    if (!newNiceToHave.trim() || !activeCriteria) return;
    setActiveCriteria({
      ...activeCriteria,
      nice_to_have_skills: [...activeCriteria.nice_to_have_skills, newNiceToHave.trim()],
    });
    setNewNiceToHave('');
  };

  const removeMustHave = (idx: number) => {
    if (!activeCriteria) return;
    setActiveCriteria({
      ...activeCriteria,
      must_have_skills: activeCriteria.must_have_skills.filter((_, i) => i !== idx),
    });
  };

  const removeNiceToHave = (idx: number) => {
    if (!activeCriteria) return;
    setActiveCriteria({
      ...activeCriteria,
      nice_to_have_skills: activeCriteria.nice_to_have_skills.filter((_, i) => i !== idx),
    });
  };

  // --- Gate 2 Action Handlers ---
  const handleSelectCandidate = (cand: CandidateState) => {
    setSelectedCandidate(cand);
    const draft = draftsList.find((d) => d.candidate_id === cand.id);
    setEditingDraft(draft || null);
  };

  const handleSaveDraft = async () => {
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
  };

  const handleSendIndividualEmail = async (draftId: string) => {
    setSentDrafts((prev) => ({ ...prev, [draftId]: true }));
    try {
      const res = await fetch(`/api/smartrecruit/v1/outreach/drafts/${draftId}/send`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchCandidatesAndDrafts();
      }
    } catch (_err) {}
  };

  const handleApproveOutreachBulk = async () => {
    if (!activeApproval) return;
    try {
      // Save active editing draft first
      await handleSaveDraft();

      const res = await fetch(
        `/api/agent/v1/workflows/approvals/${activeApproval.approvalId}/decide`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: 'approve',
          }),
        },
      );
      if (res.ok) {
        setActiveApproval(null);
        setRunStatus('success');
      }
    } catch (_err) {}
  };

  const resetPipeline = () => {
    setActiveRunId(null);
    setRunStatus(null);
    setRunError(null);
    setUploadedCvs([]);
    setCandidatesList([]);
    setDraftsList([]);
    setSelectedCandidate(null);
    setEditingDraft(null);
    setActiveTab('new');
  };

  return (
    <PageChrome title="SmartRecruit Screening & Outreach">
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full px-4 py-2">
        {/* Header Tab Navigator */}
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-display-sm font-bold tracking-tight text-ink">
              Recruitment Shortlist Agent
            </h1>
            <p className="text-body-sm text-ink-subtle">
              Analyze job descriptions, screen CVs semantically with YOE duration checks, and draft
              personalized outreach emails.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-surface-1 border border-hairline rounded-lg p-1">
            <Button
              variant={activeTab === 'new' ? 'primary' : 'ghost'}
              onClick={() => setActiveTab('new')}
              size="sm"
            >
              New Campaign
            </Button>
            <Button
              variant={activeTab === 'active' ? 'primary' : 'ghost'}
              onClick={() => setActiveTab('active')}
              size="sm"
              disabled={!activeRunId}
            >
              Active Pipeline{' '}
              {activeRunId && (
                <span className="inline-block size-2 rounded-full bg-emerald-500 animate-ping ml-1" />
              )}
            </Button>
          </div>
        </div>

        {/* TAB 1: NEW CAMPAIGN */}
        {activeTab === 'new' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Side: JD Configuration Form */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <Card className="shadow-sm border-hairline bg-canvas/40">
                <CardHeader>
                  <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                    <Settings className="size-4 text-primary" />
                    Configure Job Description
                  </CardTitle>
                  <CardDescription className="text-eyebrow">
                    Provide the job title and requirements to generate screening criteria.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-body-sm font-medium text-ink">Job Title</label>
                    <Input
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Senior Backend Engineer"
                      className="border-hairline"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-body-sm font-medium text-ink">
                      Job Description Text
                    </label>
                    <Textarea
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      placeholder="Paste the raw job description requirements here..."
                      rows={8}
                      className="border-hairline resize-none"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-hairline bg-canvas/40">
                <CardHeader>
                  <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                    <RefreshCw className="size-4 text-primary" />
                    Mock Dataset Mode
                  </CardTitle>
                  <CardDescription className="text-eyebrow">
                    Import DS-06 candidates, DS-07 criteria, and DS-08 outreach templates from the
                    assignment workbook.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={handleImportMockData}
                      disabled={isImportingMockData || isScreeningMockPool}
                      variant="secondary"
                      className="w-full justify-center gap-2"
                    >
                      <Upload className="size-4" />
                      {isImportingMockData ? 'Importing dataset...' : 'Import Mock Dataset'}
                    </Button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-body-sm font-medium text-ink">Screening Criteria</label>
                    <select
                      value={selectedCriteriaId}
                      onChange={(e) => setSelectedCriteriaId(e.target.value)}
                      className="h-10 rounded-md border border-hairline bg-surface px-3 text-body-sm text-ink"
                    >
                      <option value="">Select criteria</option>
                      {criteriaOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.external_criteria_id ? `${item.external_criteria_id} - ` : ''}
                          {item.job_title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    onClick={handleScreenMockPool}
                    disabled={!selectedCriteriaId || isImportingMockData || isScreeningMockPool}
                    className="w-full justify-center gap-2"
                  >
                    <Play className="size-4 fill-current" />
                    {isScreeningMockPool ? 'Screening candidate pool...' : 'Run Pool Screening'}
                  </Button>

                  {mockDataSummary && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-body-sm text-emerald-700">
                      {mockDataSummary}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Start Campaign Trigger */}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleStartPipeline}
                  disabled={isUploading || uploadedCvs.length === 0}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-md flex items-center justify-center gap-2 h-11"
                >
                  <Play className="size-4 fill-current" />
                  Launch Screening Pipeline
                </Button>
                {errorMsg && (
                  <div className="flex items-center gap-2 bg-destructive-tint/20 border border-destructive/20 text-destructive text-body-sm p-3 rounded-lg">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: CV Uploader Center */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <Card className="shadow-sm border-hairline bg-canvas/40 flex-1">
                <CardHeader>
                  <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                    <Upload className="size-4 text-primary" />
                    Candidate CV Storage
                  </CardTitle>
                  <CardDescription className="text-eyebrow">
                    Drag and drop candidate CVs (PDF files) to extract details.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Dropzone
                    accept="application/pdf"
                    onFile={handleCvUpload}
                    isPending={isUploading}
                    pendingLabel="Extracting CV Text..."
                    label="Drag & drop CV PDFs here or click to browse"
                    hint="Only PDF files supported"
                    className="border-hairline"
                  />

                  {/* Upload Queue List */}
                  {uploadedCvs.length > 0 && (
                    <div className="flex flex-col gap-2.5 mt-4">
                      <h3 className="text-body-sm font-semibold text-ink">
                        Uploaded Candidate Profiles ({uploadedCvs.length})
                      </h3>
                      <div className="max-h-[300px] overflow-y-auto border border-hairline rounded-lg divide-y divide-hairline bg-surface-1">
                        {uploadedCvs.map((cv) => (
                          <div
                            key={cv.id}
                            className="p-3.5 flex flex-col gap-3 transition-colors hover:bg-canvas"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <FileText className="size-5 text-ink-tertiary shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-body-sm font-medium text-ink truncate max-w-[240px]">
                                    {cv.filename}
                                  </p>
                                  {cv.status === 'uploading' && (
                                    <span className="text-eyebrow text-blue-500 animate-pulse">
                                      Uploading...
                                    </span>
                                  )}
                                  {cv.status === 'extracting' && (
                                    <span className="text-eyebrow text-amber-500 animate-pulse">
                                      Extracting info...
                                    </span>
                                  )}
                                  {cv.status === 'ready' && (
                                    <span className="text-eyebrow text-emerald-500 font-medium flex items-center gap-1">
                                      <Check className="size-3" /> Ready
                                    </span>
                                  )}
                                  {cv.status === 'error' && (
                                    <span className="text-eyebrow text-rose-500">
                                      Error: {cv.error}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveCv(cv.id)}
                                className="h-8 w-8 p-0 text-ink-subtle hover:text-rose-500 rounded-full"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>

                            {/* Editable Fields when Ready */}
                            {cv.status === 'ready' && (
                              <div className="grid grid-cols-2 gap-2.5 bg-canvas p-2.5 rounded-lg border border-hairline">
                                <div className="flex flex-col gap-1">
                                  <label className="text-eyebrow text-ink-subtle">
                                    Candidate Name
                                  </label>
                                  <Input
                                    value={cv.name}
                                    onChange={(e) =>
                                      handleUpdateCvInfo(cv.id, 'name', e.target.value)
                                    }
                                    size="sm"
                                    className="h-8 text-body-sm bg-surface border-hairline"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-eyebrow text-ink-subtle">
                                    Email Address
                                  </label>
                                  <Input
                                    value={cv.email}
                                    onChange={(e) =>
                                      handleUpdateCvInfo(cv.id, 'email', e.target.value)
                                    }
                                    size="sm"
                                    className="h-8 text-body-sm bg-surface border-hairline"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE PIPELINE STREAM */}
        {activeTab === 'active' && activeRunId && (
          <div className="flex flex-col gap-6">
            {/* Pipeline Stepper / Progress Bar */}
            <Card className="shadow-sm border-hairline bg-canvas/20">
              <CardContent className="py-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RefreshCw
                        className={cn(
                          'size-4 text-primary',
                          runStatus === 'running' && 'animate-spin',
                        )}
                      />
                      <span className="text-body-sm font-semibold text-ink">
                        Pipeline Status:{' '}
                        <span className="capitalize text-primary font-bold">{runStatus}</span>
                      </span>
                    </div>
                    <span className="text-eyebrow text-ink-subtle font-mono">
                      Run ID: {activeRunId.slice(0, 8)}...
                    </span>
                  </div>

                  {/* Visual Stepper */}
                  <div className="grid grid-cols-4 gap-2 pt-2 relative">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-hairline -translate-y-1/2 z-0" />

                    {/* Step 1 */}
                    <div className="flex flex-col items-center gap-1.5 z-10">
                      <div
                        className={cn(
                          'size-7 rounded-full flex items-center justify-center text-body-sm font-bold border-2',
                          runStatus === 'paused' && isGate1Active
                            ? 'bg-amber-500 border-amber-600 text-white'
                            : runStatus === 'running'
                              ? 'bg-primary border-primary text-white'
                              : 'bg-surface-1 border-hairline-strong text-ink-subtle',
                        )}
                      >
                        1
                      </div>
                      <span className="text-eyebrow text-center font-medium">Extract JD</span>
                    </div>

                    {/* Step 2 */}
                    <div className="flex flex-col items-center gap-1.5 z-10">
                      <div
                        className={cn(
                          'size-7 rounded-full flex items-center justify-center text-body-sm font-bold border-2',
                          runStatus === 'running' && !activeApproval
                            ? 'bg-amber-500 border-amber-600 text-white'
                            : 'bg-surface-1 border-hairline-strong text-ink-subtle',
                        )}
                      >
                        2
                      </div>
                      <span className="text-eyebrow text-center font-medium">Screen CVs</span>
                    </div>

                    {/* Step 3 */}
                    <div className="flex flex-col items-center gap-1.5 z-10">
                      <div
                        className={cn(
                          'size-7 rounded-full flex items-center justify-center text-body-sm font-bold border-2',
                          runStatus === 'paused' && isGate2Active
                            ? 'bg-amber-500 border-amber-600 text-white'
                            : 'bg-surface-1 border-hairline-strong text-ink-subtle',
                        )}
                      >
                        3
                      </div>
                      <span className="text-eyebrow text-center font-medium">Draft outreach</span>
                    </div>

                    {/* Step 4 */}
                    <div className="flex flex-col items-center gap-1.5 z-10">
                      <div
                        className={cn(
                          'size-7 rounded-full flex items-center justify-center text-body-sm font-bold border-2',
                          runStatus === 'success'
                            ? 'bg-emerald-500 border-emerald-600 text-white'
                            : 'bg-surface-1 border-hairline-strong text-ink-subtle',
                        )}
                      >
                        4
                      </div>
                      <span className="text-eyebrow text-center font-medium">Dispatch Mail</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Run error layout */}
            {runError && (
              <div className="bg-destructive-tint/20 border border-destructive/20 text-destructive p-4 rounded-xl flex items-start gap-3">
                <AlertCircle className="size-5 shrink-0 mt-0.5" />
                <div className="flex-1 flex flex-col gap-1">
                  <span className="font-semibold text-body-sm">Pipeline Execution Halted</span>
                  <p className="text-body-sm">{runError}</p>
                  <Button
                    onClick={resetPipeline}
                    variant="ghost"
                    size="sm"
                    className="w-fit text-destructive hover:bg-destructive-tint/10 mt-1"
                  >
                    Start Fresh Campaign
                  </Button>
                </div>
              </div>
            )}

            {/* GATE 1 PANEL: CRITERIA CONFIRMATION */}
            {runStatus === 'paused' && isGate1Active && activeCriteria && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Card className="shadow-md border-hairline-strong bg-surface">
                  <CardHeader className="border-b border-hairline">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <CardTitle className="text-body-xl font-bold text-ink">
                          Gate 1: Confirm Screening Criteria
                        </CardTitle>
                        <CardDescription className="text-body-sm text-ink-subtle">
                          Edit the technical skills and experience levels parsed by the AI before
                          screening profiles.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDeclineWorkflow}
                          className="text-ink-subtle hover:text-rose-500"
                        >
                          Decline Campaign
                        </Button>
                        <Button
                          onClick={handleConfirmCriteria}
                          disabled={isSavingCriteria}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 font-medium shadow"
                        >
                          <CheckCircle className="size-4" />
                          Confirm & Run Screener
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-6">
                    {/* Left: General Criteria */}
                    <div className="md:col-span-5 flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-body-sm font-semibold text-ink">
                          Job Position Title
                        </label>
                        <Input
                          value={activeCriteria.job_title}
                          onChange={(e) =>
                            setActiveCriteria({ ...activeCriteria, job_title: e.target.value })
                          }
                          className="border-hairline"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-body-sm font-semibold text-ink">
                          Minimum Years of Experience
                        </label>
                        <Input
                          type="number"
                          value={activeCriteria.min_yoe}
                          onChange={(e) =>
                            setActiveCriteria({
                              ...activeCriteria,
                              min_yoe: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="border-hairline"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-body-sm font-semibold text-ink">
                          Required Education Level
                        </label>
                        <Input
                          value={activeCriteria.education_level || ''}
                          onChange={(e) =>
                            setActiveCriteria({
                              ...activeCriteria,
                              education_level: e.target.value,
                            })
                          }
                          placeholder="e.g. Bachelor in Computer Science"
                          className="border-hairline"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-body-sm font-semibold text-ink">
                          Additional Requirements / Notes
                        </label>
                        <Textarea
                          value={activeCriteria.additional_requirements || ''}
                          onChange={(e) =>
                            setActiveCriteria({
                              ...activeCriteria,
                              additional_requirements: e.target.value,
                            })
                          }
                          rows={4}
                          className="border-hairline resize-none"
                        />
                      </div>
                    </div>

                    {/* Right: Technical Skills Lists */}
                    <div className="md:col-span-7 flex flex-col gap-6">
                      {/* Must-have */}
                      <div className="flex flex-col gap-2 bg-canvas/30 p-4 rounded-xl border border-hairline">
                        <label className="text-body-sm font-bold text-ink flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-rose-500" />
                          Must-Have Technical Skills
                        </label>
                        <p className="text-eyebrow text-ink-subtle">
                          Candidates without these skills are heavily penalized.
                        </p>

                        <div className="flex flex-wrap gap-2.5 py-2">
                          {activeCriteria.must_have_skills.map((skill, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="pl-3.5 pr-2 py-1 gap-1 border-hairline font-medium text-body-sm bg-surface"
                            >
                              {skill}
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-5 w-5 p-0 text-ink-subtle hover:text-rose-500 hover:bg-canvas rounded-full"
                                onClick={() => removeMustHave(idx)}
                              >
                                &times;
                              </Button>
                            </Badge>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <Input
                            value={newMustHave}
                            onChange={(e) => setNewMustHave(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addMustHave()}
                            placeholder="Add must-have skill..."
                            size="sm"
                            className="bg-surface border-hairline"
                          />
                          <Button
                            onClick={addMustHave}
                            size="sm"
                            variant="secondary"
                            className="flex items-center gap-1 shrink-0"
                          >
                            <Plus className="size-4" /> Add
                          </Button>
                        </div>
                      </div>

                      {/* Nice-to-have */}
                      <div className="flex flex-col gap-2 bg-canvas/30 p-4 rounded-xl border border-hairline">
                        <label className="text-body-sm font-bold text-ink flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-blue-500" />
                          Nice-To-Have Skills
                        </label>
                        <p className="text-eyebrow text-ink-subtle">
                          Preferred skills that boost candidate scorecard.
                        </p>

                        <div className="flex flex-wrap gap-2.5 py-2">
                          {activeCriteria.nice_to_have_skills.map((skill, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="pl-3.5 pr-2 py-1 gap-1 border-hairline font-medium text-body-sm bg-surface"
                            >
                              {skill}
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-5 w-5 p-0 text-ink-subtle hover:text-rose-500 hover:bg-canvas rounded-full"
                                onClick={() => removeNiceToHave(idx)}
                              >
                                &times;
                              </Button>
                            </Badge>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <Input
                            value={newNiceToHave}
                            onChange={(e) => setNewNiceToHave(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addNiceToHave()}
                            placeholder="Add nice-to-have skill..."
                            size="sm"
                            className="bg-surface border-hairline"
                          />
                          <Button
                            onClick={addNiceToHave}
                            size="sm"
                            variant="secondary"
                            className="flex items-center gap-1 shrink-0"
                          >
                            <Plus className="size-4" /> Add
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* PIPELINE SCANNING STATE */}
            {runStatus === 'running' && !activeApproval && (
              <Card className="shadow-sm border-hairline bg-canvas/40 py-12 flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="size-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <FileText className="size-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <h2 className="text-body-lg font-bold text-ink">Analyzing candidate CVs...</h2>
                  <p className="text-body-sm text-ink-subtle max-w-md">
                    Our AI agent is matching candidates against the criteria, calculating work
                    duration, and checking for hallucination-free outreach.
                  </p>
                </div>
              </Card>
            )}

            {/* GATE 2 PANEL: SCORECARD & EMAIL WORKSPACE */}
            {runStatus === 'paused' && isGate2Active && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
                {/* Left Side: Candidates list */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <Card className="shadow-sm border-hairline overflow-hidden bg-surface flex flex-col h-[600px]">
                    <div className="p-4 border-b border-hairline flex items-center justify-between bg-canvas/30">
                      <div className="flex flex-col gap-0.5">
                        <CardTitle className="text-body-md font-bold text-ink">
                          Gate 2: Shortlist Candidates ({candidatesList.length})
                        </CardTitle>
                        <CardDescription className="text-eyebrow">
                          Select candidate to review or edit outreach mail.
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleApproveOutreachBulk}
                        className="bg-primary hover:bg-primary-hover text-white font-medium shadow"
                      >
                        Approve & Send All
                      </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-hairline">
                      {candidatesList.map((cand) => {
                        const isSelected = selectedCandidate?.id === cand.id;
                        const fitScore = cand.fit_score ?? 0;
                        const scoreColor =
                          fitScore >= 80
                            ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-amber-500 bg-amber-500/10 border-amber-500/20';
                        const draft = draftsList.find((d) => d.candidate_id === cand.id);

                        return (
                          <div
                            key={cand.id}
                            onClick={() => handleSelectCandidate(cand)}
                            className={cn(
                              'p-3.5 flex items-center justify-between cursor-pointer transition-colors',
                              isSelected
                                ? 'bg-primary-tint/30 border-l-4 border-l-primary'
                                : 'hover:bg-canvas',
                            )}
                          >
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="text-body-sm font-bold text-ink truncate">
                                {cand.display_name}
                              </span>
                              <span className="text-eyebrow text-ink-subtle truncate">
                                {cand.email}
                              </span>
                              {draft && (
                                <span
                                  className={cn(
                                    'text-eyebrow font-medium w-fit mt-1 px-1.5 py-0.5 rounded border',
                                    draft.hallucination_check_status === 'passed'
                                      ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20'
                                      : 'bg-rose-500/15 text-rose-600 border-rose-500/20 animate-pulse',
                                  )}
                                >
                                  Adoption Filter:{' '}
                                  {draft.hallucination_check_status === 'passed'
                                    ? 'Passed (0 Hallucinations)'
                                    : 'Failed'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  'size-10 rounded-full border-2 flex items-center justify-center font-bold text-body-sm shrink-0',
                                  scoreColor,
                                )}
                              >
                                {fitScore}%
                              </div>
                              <ChevronRight className="size-4 text-ink-tertiary" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>

                {/* Right Side: Scorecard & Draft Editor */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                  {selectedCandidate && (
                    <Card className="shadow-sm border-hairline bg-surface flex flex-col h-[600px] overflow-hidden">
                      {/* Tabs selector */}
                      <div className="flex items-center justify-between border-b border-hairline bg-canvas/30 px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <User className="size-4 text-ink-tertiary" />
                          <span className="text-body-sm font-bold text-ink">
                            {selectedCandidate.display_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-eyebrow text-ink-subtle">Fit Score:</span>
                          <Badge className="bg-emerald-500 text-white">
                            {selectedCandidate.fit_score ?? 0}% Fit
                          </Badge>
                        </div>
                      </div>

                      {/* Content panel */}
                      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
                        {/* Scorecard block */}
                        <div className="flex flex-col gap-3.5 bg-canvas p-4 rounded-xl border border-hairline">
                          <h4 className="text-body-sm font-bold text-ink flex items-center gap-2">
                            <FileText className="size-4 text-primary" /> Candidate Suitability
                            Scorecard
                          </h4>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                              <span className="text-eyebrow text-ink-subtle uppercase">
                                Pros / Strengths
                              </span>
                              <ul className="flex flex-col gap-1">
                                {candidateReport(selectedCandidate).pros.length === 0 && (
                                  <li className="text-body-sm text-ink-subtle">
                                    No strengths recorded yet.
                                  </li>
                                )}
                                {candidateReport(selectedCandidate).pros.map((pro, idx) => (
                                  <li
                                    key={idx}
                                    className="text-body-sm text-ink flex items-start gap-1.5"
                                  >
                                    <Check className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                                    <span>{pro}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-eyebrow text-ink-subtle uppercase">
                                Gaps / Deficiencies
                              </span>
                              <ul className="flex flex-col gap-1">
                                {candidateReport(selectedCandidate).gaps.length === 0 && (
                                  <li className="text-body-sm text-ink-subtle">
                                    No gaps recorded yet.
                                  </li>
                                )}
                                {candidateReport(selectedCandidate).gaps.map((gap, idx) => (
                                  <li
                                    key={idx}
                                    className="text-body-sm text-ink flex items-start gap-1.5"
                                  >
                                    <XCircle className="size-4 text-rose-500 shrink-0 mt-0.5" />
                                    <span>{gap}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          <div className="border-t border-hairline pt-3 flex flex-col gap-1">
                            <span className="text-eyebrow text-ink-subtle uppercase">
                              Experience Calculation
                            </span>
                            <p className="text-body-sm text-ink italic font-medium">
                              {candidateReport(selectedCandidate).yoeExplanation}
                            </p>
                          </div>
                        </div>

                        {/* Email draft editor */}
                        {editingDraft && (
                          <div className="flex flex-col gap-3.5">
                            <div className="flex items-center justify-between">
                              <h4 className="text-body-sm font-bold text-ink flex items-center gap-2">
                                <Mail className="size-4 text-primary" /> Personalized Outreach Email
                              </h4>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={handleSaveDraft}
                                  disabled={isSavingDraft}
                                  className="h-8"
                                >
                                  {isSavingDraft ? 'Saving...' : 'Save Draft'}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSendIndividualEmail(editingDraft.id)}
                                  disabled={sentDrafts[editingDraft.id]}
                                  className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                                >
                                  {sentDrafts[editingDraft.id] ? 'Sent!' : 'Send Now'}
                                </Button>
                              </div>
                            </div>

                            <div className="flex flex-col gap-3 border border-hairline rounded-xl p-3.5 bg-canvas/30">
                              <div className="flex flex-col gap-1">
                                <label className="text-eyebrow text-ink-subtle uppercase">
                                  Email Subject
                                </label>
                                <Input
                                  value={editingDraft.subject}
                                  onChange={(e) =>
                                    setEditingDraft({ ...editingDraft, subject: e.target.value })
                                  }
                                  className="bg-surface border-hairline font-semibold text-body-sm h-9"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-eyebrow text-ink-subtle uppercase">
                                  Email Body
                                </label>
                                <Textarea
                                  value={editingDraft.body}
                                  onChange={(e) =>
                                    setEditingDraft({ ...editingDraft, body: e.target.value })
                                  }
                                  rows={12}
                                  className="bg-surface border-hairline text-body-sm font-mono p-3.5 resize-none leading-relaxed"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {/* PIPELINE SUCCESS PANEL */}
            {runStatus === 'success' && (
              <Card className="shadow-md border-hairline-strong bg-surface py-12 flex flex-col items-center justify-center gap-6 animate-in zoom-in-95 duration-300 max-w-2xl mx-auto w-full">
                <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/25">
                  <CheckCircle className="size-10 fill-current bg-surface rounded-full" />
                </div>
                <div className="flex flex-col items-center gap-1.5 text-center px-6">
                  <h2 className="text-body-xl font-bold text-ink">Campaign Dispatch Complete!</h2>
                  <p className="text-body-sm text-ink-subtle">
                    Personalized outreach emails have been delivered to all shortlisted candidates
                    via SMTP.
                  </p>
                </div>

                {/* Candidate sent results */}
                <div className="w-full px-6 max-h-[240px] overflow-y-auto border border-hairline rounded-xl divide-y divide-hairline bg-canvas/10">
                  {candidatesList.map((cand) => (
                    <div
                      key={cand.id}
                      className="py-3 flex items-center justify-between text-body-sm"
                    >
                      <div className="flex items-center gap-2">
                        <User className="size-4 text-ink-tertiary" />
                        <span className="font-semibold text-ink">{cand.display_name}</span>
                        <span className="text-ink-subtle">({cand.email})</span>
                      </div>
                      <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                        Outreached
                      </Badge>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={resetPipeline}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium px-6 py-2 shadow-md flex items-center gap-1.5"
                >
                  Start New Campaign
                  <ArrowRight className="size-4" />
                </Button>
              </Card>
            )}
          </div>
        )}
      </div>
    </PageChrome>
  );
}
export default SmartrecruitPage;
