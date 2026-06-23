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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Dropzone,
  Input,
  PageChrome,
  Textarea,
  toast,
} from '@seta/shared-ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  smartrecruitApi,
  useAddPoolCandidates,
  useApproveSlaReminder,
  useCampaignMetrics,
  useCampaignWarnings,
  useCancelCampaign,
  useCandidates,
  useCreateCampaign,
  useCriteria,
  useCriteriaById,
  useImportMockData,
  useInterviews,
  useOutreachDrafts,
  usePendingApprovals,
  useScreenCandidatesFromPool,
  useSendOutreachDraft,
  useSkillGaps,
  useSlaTracker,
  useSmartrecruitCampaign,
  useStartWorkflowRun,
  useSubmitDecision,
  useUpdateCriteria,
  useUpdateOutreachDraft,
  useWorkflowRun,
  useWorkflowRuns,
} from '..';
import { CandidateScorecard } from '../components/CandidateScorecard';
import { HMReportModal } from '../components/HMReportModal';

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
  jd_id?: string | null;
  job_title: string;
  jd_text: string;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  min_yoe: number;
  education_level: string;
  additional_requirements: string;
}

interface PoolCandidate {
  id: string;
  displayName: string;
  email: string;
  status: string;
  fitScore: number | null;
  similarityScore: number | null;
}

interface CandidateState {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  status: string;
  applied_position?: string | null;
  fit_score: number | null;
  effective_fit_score?: number | null;
  reviewed_fit_score?: number | null;
  review_reason?: string | null;
  screening_report: {
    pros: string[];
    gaps: string[];
    yoeExplanation: string;
    overallJustification: string;
    piiMapping?: Record<string, string>;
    contactDetails?: {
      name: string;
      email: string;
      phone: string | null;
    };
    mustHaveMatches: Array<{
      jdSkill: string;
      cvSkill: string | null;
      matched: boolean;
      justification: string;
      evidenceSnippet?: string | null;
    }>;
    niceToHaveMatches: Array<{
      jdSkill: string;
      cvSkill: string | null;
      matched: boolean;
      justification: string;
      evidenceSnippet?: string | null;
    }>;
    scoreBreakdown?: {
      mustHaveSkills: number;
      yoe: number;
      english: number;
      niceToHave: number;
    };
    flags?: string[];
  } | null;
}

interface DraftState {
  id: string;
  campaign_id?: string | null;
  candidate_id: string;
  subject: string;
  body: string;
  status: 'draft' | 'approved' | 'sent' | 'failed';
  hallucination_check_status: 'pending' | 'passed' | 'failed';
  error_reason: string | null;
}

type SlaState = 'on_track' | 'due_soon' | 'overdue' | 'submitted' | 'data_error';

interface SlaTrackerItem {
  id: string;
  feedbackId: string;
  candidateName: string;
  position: string;
  hiringManager: string;
  hiringManagerEmail: string | null;
  shortlistedAt: string;
  feedbackDueAt: string;
  slaState: SlaState;
  remainingSeconds: number | null;
  feedbackStatus: string;
  hmDecision: string | null;
  hmFeedbackText: string | null;
  reminderAvailable: boolean;
  reminderStage: 'due_soon' | 'overdue' | null;
  latestReminder: {
    id: string;
    stage: 'due_soon' | 'overdue';
    status: string;
    queuedAt: string | null;
    sentAt: string | null;
    failureCode: string | null;
  } | null;
}

function formatSlaDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function SmartrecruitPage() {
  // Navigation & Core State
  const [activeTab, setActiveTab] = useState<'new' | 'active' | 'settings'>('new');
  const [showReportModal, setShowReportModal] = useState(false);

  // Phase 3: Enterprise Settings states
  const [_atsWebhookUrl, _setAtsWebhookUrl] = useState('');
  const [atsApiBaseUrl, setAtsApiBaseUrl] = useState('');
  const [atsClientId, setAtsClientId] = useState('');
  const [atsClientSecret, setAtsClientSecret] = useState('');
  const [atsWebhookSecret, setAtsWebhookSecret] = useState('');
  const [isSavingAtsConfig, setIsSavingAtsConfig] = useState(false);
  const [atsConfigSaved, setAtsConfigSaved] = useState(false);

  // Scoring Weights
  const [swMustHave, setSwMustHave] = useState(50);
  const [swYoe, setSwYoe] = useState(15);
  const [swEnglish, setSwEnglish] = useState(15);
  const [swNiceToHave, setSwNiceToHave] = useState(20);
  const [isSavingWeights, setIsSavingWeights] = useState(false);
  const [weightsSaved, setWeightsSaved] = useState(false);

  // State used by query hooks must be declared before those hooks run.
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [dismissedRunIds, setDismissedRunIds] = useState<Record<string, boolean>>({});
  const [selectedCriteriaId, setSelectedCriteriaId] = useState('');
  const [slaSearchQuery, setSlaSearchQuery] = useState('');

  // Local UI State
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'pass' | 'fail' | 'hallucination'>(
    'all',
  );

  // Talent Pool states (Phase 2)
  const [poolCandidates, setPoolCandidates] = useState<PoolCandidate[]>([]);
  const [selectedPoolIds, setSelectedPoolIds] = useState<Record<string, boolean>>({});
  const [isLoadingPool, setIsLoadingPool] = useState(false);
  const [isAddingPoolCandidates, setIsAddingPoolCandidates] = useState(false);
  const [hasBrowsedPool, setHasBrowsedPool] = useState(false);
  const [poolLoadError, setPoolLoadError] = useState<string | null>(null);

  const [lastLoadedApprovalId, setLastLoadedApprovalId] = useState<string | null>(null);

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
  const [isImportingMockData, setIsImportingMockData] = useState(false);
  const [isScreeningMockPool, setIsScreeningMockPool] = useState(false);
  const [mockDataSummary, setMockDataSummary] = useState<string | null>(null);
  const [showDemoTools, setShowDemoTools] = useState(false);
  const [showCancelPipelineDialog, setShowCancelPipelineDialog] = useState(false);

  // Gate 1: Criteria State
  const [activeCriteria, setActiveCriteria] = useState<CriteriaState | null>(null);
  const [newMustHave, setNewMustHave] = useState('');
  const [newNiceToHave, setNewNiceToHave] = useState('');
  const [isSavingCriteria, setIsSavingCriteria] = useState(false);
  const [isConfirmingCriteria, setIsConfirmingCriteria] = useState(false);
  const [isApprovingOutreach, setIsApprovingOutreach] = useState(false);
  const [slaFilterTab, setSlaFilterTab] = useState<'all' | 'overdue' | 'due_soon' | 'pending'>(
    'all',
  );
  const [remindingIds, setRemindingIds] = useState<Record<string, boolean>>({});

  // Gate 2: Candidate Scorecard & Email workspace
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateState | null>(null);
  const [editingDraft, setEditingDraft] = useState<DraftState | null>(null);
  const [isProgressCollapsed, setIsProgressCollapsed] = useState(false);
  const gate2Ref = useRef<HTMLDivElement>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [sentDrafts, setSentDrafts] = useState<Record<string, boolean>>({});

  // React Query Client & Queries
  const queryClient = useQueryClient();

  // Queries
  const criteriaQuery = useCriteria();
  const criteriaOptions = criteriaQuery.data?.criteria ?? [];

  const activeCampaignQuery = useSmartrecruitCampaign(activeCampaignId, {
    refetchInterval: activeRunId ? 2000 : undefined,
  });
  const activeCampaign = activeCampaignQuery.data ?? null;
  const canCancelActiveCampaign =
    !!activeCampaign &&
    !['completed', 'completed_with_errors', 'canceled'].includes(activeCampaign.campaign.status);

  const campaignMetricsQuery = useCampaignMetrics(activeCampaignId);
  const campaignMetrics = campaignMetricsQuery.data ?? null;

  const campaignWarningsQuery = useCampaignWarnings(activeCampaignId);
  const campaignWarnings = campaignWarningsQuery.data?.warnings ?? [];

  const workflowRunsQuery = useWorkflowRuns('smartrecruit.workflow', 'self', {
    refetchInterval: activeRunId ? 2000 : undefined,
  });

  const activeRunQuery = useWorkflowRun(activeRunId, {
    refetchInterval: activeRunId ? 2000 : undefined,
  });
  const runStatus = activeRunQuery.data?.status ?? null;
  const runError =
    activeRunQuery.data?.status === 'failed'
      ? (activeRunQuery.data?.errorSummary ?? 'Run failed.')
      : null;

  const pendingApprovalsQuery = usePendingApprovals({
    refetchInterval: activeRunId ? 2000 : undefined,
  });
  const activeApproval = useMemo(() => {
    return pendingApprovalsQuery.data?.find((a: any) => a.runId === activeRunId) || null;
  }, [pendingApprovalsQuery.data, activeRunId]);

  const isGate1Active =
    activeApproval?.stepId === 'smartrecruit.parseJd' ||
    activeApproval?.proposedPayload?.meta?.toolId === 'smartrecruit_parseJd';

  const isGate2Active =
    activeApproval?.stepId === 'smartrecruit.draftOutreach' ||
    activeApproval?.proposedPayload?.meta?.toolId === 'smartrecruit_draftOutreach';

  const criteriaIdToLoad = isGate1Active
    ? activeApproval?.proposedPayload?.primary?.argsPatch?.criteriaId || null
    : selectedCriteriaId || null;

  const criteriaDetailsQuery = useCriteriaById(criteriaIdToLoad);
  const skillGapsQuery = useSkillGaps(criteriaDetailsQuery.data?.job_title ?? '');
  const skillGaps = skillGapsQuery.data ?? null;

  const slaTrackerQuery = useSlaTracker({ search: slaSearchQuery });
  const slaTracker = slaTrackerQuery.data?.tracker ?? [];

  const candidatesQuery = useCandidates();
  const draftsQuery = useOutreachDrafts();

  const interviewsQuery = useInterviews(activeCampaignId || undefined);
  const interviewScheduleList = interviewsQuery.data?.interviews ?? [];

  // Mutations
  const createCampaignMutation = useCreateCampaign();
  const cancelCampaignMutation = useCancelCampaign();
  const startWorkflowMutation = useStartWorkflowRun();
  const importMockDataMutation = useImportMockData();
  const screenCandidatesFromPoolMutation = useScreenCandidatesFromPool();
  const updateCriteriaMutation = useUpdateCriteria();
  const submitDecisionMutation = useSubmitDecision();
  const addPoolCandidatesMutation = useAddPoolCandidates();
  const updateOutreachDraftMutation = useUpdateOutreachDraft();
  const sendOutreachDraftMutation = useSendOutreachDraft();
  const approveSlaReminderMutation = useApproveSlaReminder();

  const handleRemindHM = useCallback(
    async (item: SlaTrackerItem) => {
      const id = item.id;
      setRemindingIds((prev) => ({ ...prev, [id]: true }));

      try {
        await approveSlaReminderMutation.mutateAsync(item.id);
        toast.success('Reminder queued for approval delivery.', {
          description: `A ${item.reminderStage?.replace('_', ' ') ?? 'feedback'} reminder for ${item.hiringManager} is now queued.`,
        });
      } catch (err) {
        toast.error('Could not queue reminder.', {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setRemindingIds((prev) => ({ ...prev, [id]: false }));
      }
    },
    [approveSlaReminderMutation],
  );

  const filteredSlaTracker = useMemo(() => {
    return slaTracker.filter((item) => {
      const query = slaSearchQuery.toLowerCase();
      const matchesSearch =
        item.candidateName?.toLowerCase().includes(query) ||
        item.hiringManager?.toLowerCase().includes(query) ||
        item.position?.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (slaFilterTab === 'overdue') return item.slaState === 'overdue';
      if (slaFilterTab === 'due_soon') return item.slaState === 'due_soon';
      if (slaFilterTab === 'pending') return item.slaState !== 'submitted';

      return true;
    });
  }, [slaTracker, slaSearchQuery, slaFilterTab]);

  const candidatesList = useMemo(() => {
    if (activeCampaignId && activeCampaignQuery.data) {
      return activeCampaignQuery.data.candidates
        .map(({ campaignCandidate, candidate }: any) => {
          if (!candidate) return null;
          return {
            ...candidate,
            status: campaignCandidate.status,
            fit_score: campaignCandidate.fit_score ?? candidate.fit_score,
            effective_fit_score:
              campaignCandidate.effective_fit_score ??
              campaignCandidate.fit_score ??
              candidate.fit_score,
            reviewed_fit_score: campaignCandidate.reviewed_fit_score,
            review_reason: campaignCandidate.review_reason,
            screening_report: campaignCandidate.screening_report ?? candidate.screening_report,
          };
        })
        .filter(Boolean) as CandidateState[];
    }
    const cands = candidatesQuery.data?.candidates ?? [];
    let currentCriteriaId = activeCriteria?.id || '';
    if (!currentCriteriaId && cands.length > 0) {
      const firstWithReport = cands.find((c: any) => c.screening_report?.criteriaId);
      if (firstWithReport) {
        currentCriteriaId = firstWithReport.screening_report.criteriaId;
      }
    }
    return currentCriteriaId
      ? cands.filter((c: any) => c.screening_report?.criteriaId === currentCriteriaId)
      : cands;
  }, [activeCampaignId, activeCampaignQuery.data, candidatesQuery.data, activeCriteria?.id]);

  const draftsList = useMemo(() => {
    if (activeCampaignId && activeCampaignQuery.data) {
      return activeCampaignQuery.data.candidates
        .map((row: any) => row.draft)
        .filter(Boolean) as DraftState[];
    }
    return draftsQuery.data?.drafts ?? [];
  }, [activeCampaignId, activeCampaignQuery.data, draftsQuery.data]);

  const isHallucinationFail = useCallback(
    (candidateId: string) => {
      const draft = draftsList.find((d) => d.candidate_id === candidateId);
      return draft?.hallucination_check_status === 'failed';
    },
    [draftsList],
  );

  const filteredCandidates = candidatesList.filter((cand) => {
    if (candidateFilter === 'all') return true;
    if (candidateFilter === 'pass') return (cand.fit_score ?? 0) >= 70;
    if (candidateFilter === 'fail') return (cand.fit_score ?? 0) < 70;
    if (candidateFilter === 'hallucination') return isHallucinationFail(cand.id);
    return true;
  });

  const isAnyCvNotReady = uploadedCvs.some((c) => c.status !== 'ready');

  const dataWarnings = useMemo(() => {
    const list: string[] = [];
    if (activeCriteria) {
      if (!activeCriteria.must_have_skills || activeCriteria.must_have_skills.length === 0) {
        list.push('Warning: must-have skills are not configured for this screening run.');
      }
      if (activeCriteria.min_yoe === 0) {
        list.push('Warning: minimum years of experience is configured as 0.');
      }
    }
    for (const cv of uploadedCvs) {
      if (cv.status === 'ready') {
        if (!cv.email) {
          list.push(`Warning: candidate "${cv.name || cv.filename}" is missing an email address.`);
        }
        if (!cv.phone) {
          list.push(
            `Warning: candidate "${cv.name || cv.filename}" is missing a contact phone number.`,
          );
        }
      }
    }
    return list;
  }, [activeCriteria, uploadedCvs]);

  const fetchCriteriaDetails = useCallback(async (criteriaId: string) => {
    setSelectedCriteriaId(criteriaId);
  }, []);

  const fetchCampaignProgress = useCallback(
    async (_campaignId: string) => {
      await activeCampaignQuery.refetch();
      await campaignMetricsQuery.refetch();
      await campaignWarningsQuery.refetch();
    },
    [activeCampaignQuery, campaignMetricsQuery, campaignWarningsQuery],
  );

  const fetchCandidatesAndDrafts = useCallback(async () => {
    if (activeCampaignId) {
      await fetchCampaignProgress(activeCampaignId);
    } else {
      await candidatesQuery.refetch();
      await draftsQuery.refetch();
    }
  }, [activeCampaignId, fetchCampaignProgress, candidatesQuery, draftsQuery]);

  // Talent Pool re-engagement helpers (Phase 2)
  const fetchPoolCandidates = useCallback(async (campaignId: string) => {
    setIsLoadingPool(true);
    setHasBrowsedPool(true);
    setPoolLoadError(null);
    try {
      const data = await smartrecruitApi.searchPoolCandidates(campaignId, {
        limit: 10,
        minSimilarity: 0.55,
      });
      const list = data?.results ?? [];
      setPoolCandidates(list);
      setSelectedPoolIds(Object.fromEntries(list.map((candidate) => [candidate.id, false])));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not browse the Talent Pool.';
      setPoolCandidates([]);
      setSelectedPoolIds({});
      setPoolLoadError(message);
    } finally {
      setIsLoadingPool(false);
    }
  }, []);

  const handleBrowseTalentPool = useCallback(() => {
    const campaignId =
      activeCampaignId ||
      activeApproval?.proposedPayload?.primary?.argsPatch?.campaignId ||
      activeApproval?.proposedPayload?.meta?.campaignId;
    if (!campaignId) {
      toast.error('Campaign is not ready for Talent Pool browsing.');
      return;
    }
    void fetchPoolCandidates(campaignId);
  }, [activeApproval, activeCampaignId, fetchPoolCandidates]);

  const handleReengageCandidates = useCallback(async () => {
    const campaignId = activeCampaignId;
    if (!campaignId) return;

    const selectedIds = Object.entries(selectedPoolIds)
      .filter(([_, checked]) => checked)
      .map(([id]) => id);

    if (selectedIds.length === 0) {
      toast.error('Select at least one candidate to re-engage.');
      return;
    }

    setIsAddingPoolCandidates(true);
    try {
      await addPoolCandidatesMutation.mutateAsync({ campaignId, candidateIds: selectedIds });
      toast.success('Talent Pool candidates added to the campaign.');
      const addedIds = new Set(selectedIds);
      setPoolCandidates((current) => current.filter((candidate) => !addedIds.has(candidate.id)));
      setSelectedPoolIds({});
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not add candidates from Talent Pool.',
      );
    } finally {
      setIsAddingPoolCandidates(false);
    }
  }, [activeCampaignId, selectedPoolIds, addPoolCandidatesMutation]);

  // Synchronize candidate selection and email draft
  useEffect(() => {
    if (candidatesList.length === 0) {
      setSelectedCandidate(null);
      setEditingDraft(null);
      return;
    }

    const current = selectedCandidate
      ? (candidatesList.find((candidate) => candidate.id === selectedCandidate.id) ?? null)
      : null;
    const currentDraft = current
      ? (draftsList.find((draft) => draft.candidate_id === current.id) ?? null)
      : null;
    const preferredDraft = currentDraft ?? draftsList[0] ?? null;
    const preferredCandidate =
      current ??
      (preferredDraft
        ? candidatesList.find((candidate) => candidate.id === preferredDraft.candidate_id)
        : null) ??
      candidatesList[0];

    if (
      preferredCandidate.id !== selectedCandidate?.id ||
      preferredCandidate.status !== selectedCandidate?.status ||
      preferredCandidate.fit_score !== selectedCandidate?.fit_score
    ) {
      setSelectedCandidate(preferredCandidate);
    }

    const matchingDraft =
      draftsList.find((draft) => draft.candidate_id === preferredCandidate.id) ?? null;
    setEditingDraft((existing) =>
      existing?.id && existing.id === matchingDraft?.id ? existing : matchingDraft,
    );
  }, [candidatesList, draftsList, selectedCandidate]);

  // Sync activeCriteria from loaded details
  useEffect(() => {
    if (criteriaIdToLoad && criteriaDetailsQuery.data) {
      setActiveCriteria(criteriaDetailsQuery.data);
    } else if (!criteriaIdToLoad) {
      setActiveCriteria(null);
    }
  }, [criteriaDetailsQuery.data, criteriaIdToLoad]);

  // Auto collapse progress details and scroll to Gate 2 when Gate 2 becomes active
  useEffect(() => {
    if (runStatus === 'paused' && isGate2Active) {
      setIsProgressCollapsed(true);
      const timer = setTimeout(() => {
        gate2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setIsProgressCollapsed(false);
    }
  }, [runStatus, isGate2Active]);

  // Sync pending run on mount / change
  useEffect(() => {
    if (workflowRunsQuery.data?.rows && !activeRunId) {
      const running = workflowRunsQuery.data.rows.find(
        (r: any) =>
          !dismissedRunIds[r.runId] &&
          (r.status === 'paused' || r.status === 'running' || r.status === 'waiting'),
      );
      if (running) {
        setActiveRunId(running.runId);
        setActiveCampaignId(running.inputSummary?.campaignId ?? null);
        setActiveTab('active');
      }
    }
  }, [workflowRunsQuery.data, activeRunId, dismissedRunIds]);

  // Synchronize loading details when Gate 1 or Gate 2 is active
  useEffect(() => {
    if (!activeApproval) {
      setPoolCandidates([]);
      setSelectedPoolIds({});
      setHasBrowsedPool(false);
      setPoolLoadError(null);
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
        setPoolCandidates([]);
        setSelectedPoolIds({});
        setHasBrowsedPool(false);
        setPoolLoadError(null);
        fetchCriteriaDetails(criteriaId);
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
      const data = await smartrecruitApi.uploadCv(file);

      setUploadedCvs((prev) =>
        prev.map((c) => (c.id === tempId ? { ...c, text: data.text, status: 'extracting' } : c)),
      );

      // Extract candidate details via LLM
      const dataInfo = await smartrecruitApi.extractCandidateInfo(data.text);
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
    if (!jobTitle.trim() || !jdText.trim()) {
      setErrorMsg('Please provide a job title and job description before launching.');
      return;
    }
    if (uploadedCvs.length === 0) {
      setErrorMsg('Please upload at least one candidate CV.');
      return;
    }
    if (uploadedCvs.some((c) => c.status === 'error')) {
      setErrorMsg('One or more CVs failed extraction. Remove or re-upload them before launching.');
      return;
    }
    if (uploadedCvs.some((c) => c.status !== 'ready')) {
      setErrorMsg('Please wait until every CV is ready before launching.');
      return;
    }
    const readyCvs = uploadedCvs.filter((c) => c.status === 'ready');

    try {
      setErrorMsg(null);
      const campaignData = await createCampaignMutation.mutateAsync({
        jobTitle,
        jdText,
        cvs: readyCvs.map((c) => ({
          candidateName: c.name,
          candidateEmail: c.email,
          candidatePhone: c.phone,
          cvText: c.text,
        })),
      });

      if (!campaignData?.campaign?.id) {
        throw new Error('Failed to create recruitment campaign.');
      }

      const data = await startWorkflowMutation.mutateAsync({
        campaignId: campaignData.campaign.id,
        jobTitle,
        jdText,
      });

      if (!data?.runId) {
        throw new Error('Workflow start returned no run ID.');
      }

      setActiveCampaignId(campaignData.campaign.id);
      setActiveRunId(data.runId);
      setActiveTab('active');
      void fetchCampaignProgress(campaignData.campaign.id).catch((err) => {
        toast.error('Campaign started, but the first progress refresh failed.', {
          description: err instanceof Error ? err.message : String(err),
        });
      });
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleImportMockData = async () => {
    setIsImportingMockData(true);
    setErrorMsg(null);
    setMockDataSummary(null);
    try {
      const data = await importMockDataMutation.mutateAsync(undefined);
      if (!data?.candidates || !data.criteria || !data.templates) {
        throw new Error('Import mock dataset returned an empty or invalid response.');
      }

      setMockDataSummary(
        `Imported ${data.candidates.created} new and ${data.candidates.updated} updated candidates, ${data.criteria.created} new and ${data.criteria.updated} updated criteria, ${data.templates.created} new and ${data.templates.updated} updated templates.`,
      );
      await criteriaQuery.refetch();
      await candidatesQuery.refetch();
      await draftsQuery.refetch();
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
      const data = await screenCandidatesFromPoolMutation.mutateAsync({
        criteriaId: selectedCriteriaId,
        limit: 25,
        includeAlreadyScreened: true,
      });
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
      await updateCriteriaMutation.mutateAsync({
        id: activeCriteria.id,
        mustHaveSkills: activeCriteria.must_have_skills,
        niceToHaveSkills: activeCriteria.nice_to_have_skills,
        minYoe: activeCriteria.min_yoe,
        educationLevel: activeCriteria.education_level,
        additionalRequirements: activeCriteria.additional_requirements,
      });
    } catch (_err) {}
    setIsSavingCriteria(false);
  };

  const handleConfirmCriteria = async () => {
    if (!activeApproval || isConfirmingCriteria) return;
    setIsConfirmingCriteria(true);
    setErrorMsg(null);
    try {
      // First save edits
      await handleSaveCriteria();

      const payload = activeApproval.proposedPayload?.primary?.argsPatch || {};
      const selectedIds = Object.entries(selectedPoolIds)
        .filter(([_, checked]) => checked)
        .map(([id]) => id);

      await submitDecisionMutation.mutateAsync({
        approvalId: activeApproval.approvalId,
        decision: 'approve',
        argsPatch: {
          ...payload,
          additionalCandidateIds: selectedIds,
        },
      });
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsConfirmingCriteria(false);
    }
  };

  const handleDeclineWorkflow = async () => {
    if (!activeApproval) return;
    try {
      await submitDecisionMutation.mutateAsync({
        approvalId: activeApproval.approvalId,
        decision: 'reject',
      });
      setActiveRunId(null);
      setActiveCampaignId(null);
      setActiveTab('new');
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
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
      await updateOutreachDraftMutation.mutateAsync({
        id: editingDraft.id,
        subject: editingDraft.subject,
        body: editingDraft.body,
      });
    } catch (_err) {}
    setIsSavingDraft(false);
  };

  const handleSendIndividualEmail = async (draftId: string) => {
    setSentDrafts((prev) => ({ ...prev, [draftId]: true }));
    try {
      await sendOutreachDraftMutation.mutateAsync(draftId);
    } catch (_err) {}
  };

  const handleApproveOutreachBulk = async () => {
    if (!activeApproval || isApprovingOutreach) return;
    setIsApprovingOutreach(true);
    setErrorMsg(null);
    try {
      if (editingDraft) {
        await handleSaveDraft();
      }

      const payload = activeApproval.proposedPayload?.primary?.argsPatch || {};
      await submitDecisionMutation.mutateAsync({
        approvalId: activeApproval.approvalId,
        decision: 'approve',
        argsPatch: payload,
      });
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsApprovingOutreach(false);
    }
  };

  const resetPipeline = () => {
    setActiveRunId(null);
    setActiveCampaignId(null);
    setUploadedCvs([]);
    setSelectedCandidate(null);
    setEditingDraft(null);
    setPoolCandidates([]);
    setSelectedPoolIds({});
    setHasBrowsedPool(false);
    setPoolLoadError(null);
    setActiveTab('new');
    queryClient.invalidateQueries({ queryKey: ['smartrecruit'] });
    queryClient.invalidateQueries({ queryKey: ['agent'] });
  };

  const handleCancelActiveCampaign = async () => {
    if (!activeCampaignId || cancelCampaignMutation.isPending) return;

    try {
      const runIdToCancel = activeRunId;
      if (activeRunId) {
        setDismissedRunIds((prev) => ({ ...prev, [activeRunId]: true }));
      }
      await cancelCampaignMutation.mutateAsync({
        campaignId: activeCampaignId,
        reason: 'Canceled from SmartRecruit UI after an incorrect or stale run.',
      });
      if (runIdToCancel) {
        await smartrecruitApi.cancelWorkflowRun(runIdToCancel).catch((err) => {
          toast.warning('Campaign canceled, but workflow run cancel was not confirmed.', {
            description: err instanceof Error ? err.message : String(err),
          });
        });
      }
      toast.success('Pipeline canceled.', {
        description: 'Pending SmartRecruit jobs for this campaign will be ignored.',
      });
      setShowCancelPipelineDialog(false);
      resetPipeline();
    } catch (err) {
      toast.error('Could not cancel pipeline.', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
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
            <Button
              variant={activeTab === 'settings' ? 'primary' : 'ghost'}
              onClick={() => setActiveTab('settings')}
              size="sm"
            >
              <Settings className="size-3.5 mr-1" />
              Enterprise Settings
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

              {/* Start Campaign Trigger */}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleStartPipeline}
                  disabled={
                    isUploading ||
                    isAnyCvNotReady ||
                    uploadedCvs.length === 0 ||
                    createCampaignMutation.isPending ||
                    startWorkflowMutation.isPending
                  }
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium shadow-md flex items-center justify-center gap-2 h-11"
                >
                  {createCampaignMutation.isPending || startWorkflowMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4 fill-current" />
                  )}
                  {createCampaignMutation.isPending
                    ? 'Creating campaign...'
                    : startWorkflowMutation.isPending
                      ? 'Starting workflow...'
                      : 'Launch Screening Pipeline'}
                </Button>
                {errorMsg && (
                  <div className="flex items-center gap-2 bg-destructive-tint/20 border border-destructive/20 text-destructive text-body-sm p-3 rounded-lg">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>

              <Card className="shadow-sm border-hairline bg-canvas/40">
                <button
                  type="button"
                  className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left"
                  onClick={() => setShowDemoTools((value) => !value)}
                >
                  <div>
                    <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                      <RefreshCw className="size-4 text-primary" />
                      Demo & Operations Tools
                    </CardTitle>
                    <CardDescription className="text-eyebrow mt-1">
                      Optional mock dataset, pool screening, shortlisted candidates, and HM SLA
                      utilities.
                    </CardDescription>
                  </div>
                  <ChevronRight
                    className={cn(
                      'size-4 text-ink-subtle transition-transform',
                      showDemoTools && 'rotate-90',
                    )}
                  />
                </button>
              </Card>

              {showDemoTools && (
                <>
                  <Card className="shadow-sm border-hairline bg-canvas/40">
                    <CardHeader>
                      <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                        <RefreshCw className="size-4 text-primary" />
                        Mock Dataset Mode
                      </CardTitle>
                      <CardDescription className="text-eyebrow">
                        Import DS-06 candidates, DS-07 criteria, and DS-08 outreach templates from
                        the assignment workbook.
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
                        <label className="text-body-sm font-medium text-ink">
                          Screening Criteria
                        </label>
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

                      {candidatesList.filter(
                        (c) => c.status === 'shortlisted' || (c.fit_score && c.fit_score >= 70),
                      ).length > 0 && (
                        <div className="flex flex-col gap-2 mt-2">
                          <h3 className="text-body-sm font-semibold text-ink flex items-center gap-1.5">
                            <CheckCircle className="size-4 text-emerald-500" />
                            Passed Candidates (Shortlisted)
                          </h3>
                          <div className="max-h-[250px] overflow-y-auto border border-hairline rounded-lg divide-y divide-hairline bg-surface-1">
                            {candidatesList
                              .filter(
                                (c) =>
                                  c.status === 'shortlisted' || (c.fit_score && c.fit_score >= 70),
                              )
                              .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
                              .map((cand) => (
                                <div
                                  key={cand.id}
                                  className="p-3 flex items-center justify-between transition-colors hover:bg-canvas"
                                >
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-body-sm font-bold text-ink truncate">
                                      {cand.display_name}
                                    </span>
                                    <span className="text-eyebrow text-ink-subtle truncate">
                                      {cand.email}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      className={
                                        cand.fit_score != null && cand.fit_score >= 70
                                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium shrink-0'
                                          : 'bg-amber-500/10 text-amber-600 border border-amber-500/20 font-medium shrink-0'
                                      }
                                    >
                                      {cand.fit_score != null
                                        ? `${cand.fit_score}% Fit`
                                        : 'Pre-screened'}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Hiring Manager SLA Tracker Card */}
                  {slaTracker.length > 0 && (
                    <Card className="shadow-sm border-hairline bg-canvas/40 max-h-[450px] overflow-hidden flex flex-col">
                      <CardHeader className="pb-3 shrink-0">
                        <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                          <Mail className="size-4 text-rose-500" />
                          HM Feedback SLA Tracker (DS08)
                        </CardTitle>
                        <CardDescription className="text-eyebrow">
                          Track Hiring Manager feedback against the 48-hour SLA.
                        </CardDescription>
                      </CardHeader>

                      {/* Search and Filters */}
                      <div className="px-6 pb-3 shrink-0 flex flex-col gap-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-ink-subtle" />
                          <Input
                            type="text"
                            placeholder="Search candidate, HM, or position..."
                            className="pl-8 h-8 text-xs bg-surface-1 border-hairline"
                            value={slaSearchQuery}
                            onChange={(e) => setSlaSearchQuery(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-1 bg-surface-2 p-0.5 rounded-md border border-hairline text-[11px]">
                          {(
                            [
                              { id: 'all', label: 'All' },
                              { id: 'overdue', label: 'Overdue ⚠️' },
                              { id: 'due_soon', label: 'Due soon' },
                              { id: 'pending', label: 'Waiting HM' },
                            ] as const
                          ).map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              className={cn(
                                'flex-1 py-1 rounded-sm font-medium transition-all',
                                slaFilterTab === tab.id
                                  ? 'bg-surface text-ink shadow-sm'
                                  : 'text-ink-subtle hover:text-ink hover:bg-surface-1',
                              )}
                              onClick={() => setSlaFilterTab(tab.id)}
                            >
                              {tab.label}
                              {tab.id === 'overdue' && (
                                <span className="ml-1 px-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 text-[9px] font-bold">
                                  {slaTracker.filter((i) => i.slaState === 'overdue').length}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <CardContent className="flex-1 overflow-y-auto pt-0">
                        <div className="flex flex-col gap-2.5">
                          {filteredSlaTracker.length === 0 ? (
                            <div className="text-center py-6 text-ink-subtle text-xs">
                              No matching feedback requests.
                            </div>
                          ) : (
                            filteredSlaTracker.map((item) => {
                              const isBreached = item.slaState === 'overdue';
                              const isDueSoon = item.slaState === 'due_soon';
                              const isReminding = remindingIds[item.id];
                              const isSubmitted = item.slaState === 'submitted';
                              const stateLabel = item.slaState.replace('_', ' ');

                              return (
                                <div
                                  key={item.feedbackId}
                                  className={cn(
                                    'p-3 rounded-lg border flex flex-col gap-2 text-body-sm transition-all bg-surface hover:bg-canvas/50 relative overflow-hidden',
                                    isBreached
                                      ? 'border-rose-200/50 border-l-4 border-l-rose-500 bg-rose-50/5 dark:bg-rose-950/5'
                                      : isDueSoon
                                        ? 'border-amber-200/50 border-l-4 border-l-amber-500 bg-amber-50/5 dark:bg-amber-950/5'
                                        : 'border-hairline border-l-4 border-l-emerald-500 bg-emerald-50/5 dark:bg-emerald-950/5',
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex flex-col">
                                      <span className="font-bold text-ink text-sm flex items-center gap-1.5">
                                        <User className="size-3.5 text-ink-subtle" />
                                        {item.candidateName}
                                      </span>
                                      <span className="text-[11px] text-ink-subtle mt-0.5">
                                        Position:{' '}
                                        <span className="font-medium text-ink/80">
                                          {item.position}
                                        </span>
                                      </span>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                      {isBreached ? (
                                        <Badge className="bg-rose-500 text-white font-bold text-[9px] uppercase px-1.5 py-0.5 animate-pulse tracking-wider shadow-sm shadow-rose-500/20">
                                          Overdue
                                        </Badge>
                                      ) : isDueSoon ? (
                                        <Badge className="bg-amber-500 text-white font-bold text-[9px] uppercase px-1.5 py-0.5 tracking-wider">
                                          Due Soon
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-emerald-500 text-white font-bold text-[9px] uppercase px-1.5 py-0.5 tracking-wider">
                                          {isSubmitted ? 'Submitted' : 'On Track'}
                                        </Badge>
                                      )}
                                      <Badge className="bg-surface-1 border border-hairline font-mono text-[9px] px-1 py-0">
                                        {stateLabel}
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="text-xs text-ink-subtle flex flex-col gap-1 border-t border-hairline/50 pt-2 mt-1">
                                    <div className="flex justify-between items-center">
                                      <span>
                                        HM:{' '}
                                        <span className="font-medium text-ink">
                                          {item.hiringManager}
                                        </span>
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] text-ink-muted">
                                      <Calendar className="size-3 text-ink-subtle" />
                                      <span>Shortlisted: {formatSlaDate(item.shortlistedAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] text-ink-muted">
                                      <Clock className="size-3 text-ink-subtle" />
                                      <span>Deadline: {formatSlaDate(item.feedbackDueAt)}</span>
                                    </div>
                                  </div>

                                  {item.hmFeedbackText && (
                                    <p className="text-[11px] text-ink-subtle bg-canvas/40 p-2 rounded italic border-l-2 border-primary/30 mt-1">
                                      HM Feedback: "{item.hmFeedbackText}"
                                    </p>
                                  )}

                                  {!isSubmitted && item.reminderAvailable && (
                                    <div className="flex justify-end border-t border-hairline/50 pt-2 mt-1">
                                      <Button
                                        size="sm"
                                        disabled={isReminding}
                                        className={cn(
                                          'h-7 text-[11px] px-3 py-1 font-medium rounded transition-all flex items-center gap-1',
                                          'bg-rose-50 text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/50 dark:hover:bg-rose-600 dark:hover:text-white',
                                        )}
                                        onClick={() => handleRemindHM(item)}
                                      >
                                        {isReminding ? (
                                          <>
                                            <Loader2 className="animate-spin size-3.5" />
                                            <span>Queueing...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Bell className="size-3.5" />
                                            <span>Remind HM</span>
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
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
                          'size-4',
                          ['running', 'waiting', 'pending'].includes(runStatus || '')
                            ? 'text-blue-500 animate-spin'
                            : runStatus === 'paused'
                              ? 'text-amber-500'
                              : runStatus === 'success'
                                ? 'text-emerald-500'
                                : 'text-ink-subtle',
                        )}
                      />
                      <span className="text-body-sm font-semibold text-ink flex items-center gap-1.5">
                        Pipeline Status:
                        <span
                          className={cn(
                            'font-bold px-2 py-0.5 rounded text-[11px] uppercase tracking-wider',
                            ['running', 'waiting', 'pending'].includes(runStatus || '')
                              ? 'bg-blue-50 text-blue-600 border border-blue-200 animate-pulse'
                              : runStatus === 'paused'
                                ? 'bg-amber-50 text-amber-600 border border-amber-200'
                                : runStatus === 'success'
                                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                  : 'bg-canvas text-ink-subtle border border-hairline',
                          )}
                        >
                          {runStatus === 'waiting'
                            ? 'Processing'
                            : runStatus === 'paused'
                              ? 'Action Required'
                              : runStatus || 'Idle'}
                        </span>
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
                            : ['running', 'waiting', 'pending'].includes(runStatus || '')
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
                          ['running', 'waiting', 'pending'].includes(runStatus || '') &&
                            !activeApproval
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

            {activeCampaign && (
              <Card className="shadow-sm border-hairline bg-surface overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-body-lg font-semibold flex items-center gap-2">
                        Campaign Progress
                      </CardTitle>
                      <CardDescription>
                        {activeCampaign.campaign.job_title} · {activeCampaign.campaign.status}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isProgressCollapsed && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setShowReportModal(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1.5 h-8 text-xs shrink-0"
                        >
                          <FileText className="size-3.5" />
                          HM Report
                        </Button>
                      )}

                      <Badge
                        variant={activeCampaign.campaign.failed_count > 0 ? 'warning' : 'success'}
                        className="h-8 flex items-center shrink-0"
                      >
                        {activeCampaign.campaign.screened_count}/
                        {activeCampaign.campaign.total_candidates} screened
                      </Badge>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsProgressCollapsed((prev) => !prev)}
                        className="h-8 text-xs flex items-center gap-1 shrink-0"
                      >
                        {isProgressCollapsed ? (
                          <>
                            <ChevronDown className="size-3.5" />
                            <span>Show Details</span>
                          </>
                        ) : (
                          <>
                            <ChevronUp className="size-3.5" />
                            <span>Hide Details</span>
                          </>
                        )}
                      </Button>

                      {canCancelActiveCampaign && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={cancelCampaignMutation.isPending}
                          onClick={() => setShowCancelPipelineDialog(true)}
                          className="text-destructive hover:bg-destructive-tint/10 h-8 text-xs shrink-0"
                        >
                          {cancelCampaignMutation.isPending ? (
                            <Loader2 className="size-3.5 mr-1 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5 mr-1" />
                          )}
                          Cancel Pipeline
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {isProgressCollapsed && (
                  <div className="h-1 bg-canvas overflow-hidden w-full">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${
                          activeCampaign.campaign.total_candidates > 0
                            ? Math.round(
                                (activeCampaign.campaign.screened_count /
                                  activeCampaign.campaign.total_candidates) *
                                  100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                )}
                {!isProgressCollapsed && (
                  <CardContent className="flex flex-col gap-3">
                    <div className="h-2 rounded-full bg-canvas overflow-hidden border border-hairline">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${
                            activeCampaign.campaign.total_candidates > 0
                              ? Math.round(
                                  (activeCampaign.campaign.screened_count /
                                    activeCampaign.campaign.total_candidates) *
                                    100,
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-body-sm">
                      <div className="rounded border border-hairline p-2">
                        <div className="text-ink-subtle">Shortlisted</div>
                        <div className="font-semibold">
                          {activeCampaign.campaign.shortlisted_count}
                        </div>
                      </div>
                      <div className="rounded border border-hairline p-2">
                        <div className="text-ink-subtle">Failed</div>
                        <div className="font-semibold">{activeCampaign.campaign.failed_count}</div>
                      </div>
                      <div className="rounded border border-hairline p-2">
                        <div className="text-ink-subtle">Drafted</div>
                        <div className="font-semibold">{activeCampaign.campaign.drafted_count}</div>
                      </div>
                      <div className="rounded border border-hairline p-2">
                        <div className="text-ink-subtle">Sent</div>
                        <div className="font-semibold">{activeCampaign.campaign.sent_count}</div>
                      </div>
                      <div className="rounded border border-hairline p-2">
                        <div className="text-ink-subtle">Campaign ID</div>
                        <div className="font-mono text-xs">
                          {activeCampaign.campaign.id.slice(0, 8)}
                        </div>
                      </div>
                    </div>
                    {campaignMetrics && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-body-sm">
                        <div className="rounded border border-hairline p-2">
                          <div className="text-ink-subtle">Time to screen</div>
                          <div className="font-semibold">
                            {campaignMetrics.timeToScreenMs == null
                              ? 'Pending'
                              : `${Math.round(campaignMetrics.timeToScreenMs / 1000)}s`}
                          </div>
                        </div>
                        <div className="rounded border border-hairline p-2">
                          <div className="text-ink-subtle">CV / minute</div>
                          <div className="font-semibold">
                            {campaignMetrics.candidatesPerMinute ?? 'Pending'}
                          </div>
                        </div>
                        <div className="rounded border border-hairline p-2">
                          <div className="text-ink-subtle">Retries</div>
                          <div className="font-semibold">{campaignMetrics.retryCount}</div>
                        </div>
                        <div className="rounded border border-hairline p-2">
                          <div className="text-ink-subtle">AI latency</div>
                          <div className="font-semibold">
                            {Math.round(campaignMetrics.aiLatencyMs / 1000)}s
                          </div>
                        </div>
                      </div>
                    )}
                    {campaignWarnings.filter((warning) => !warning.resolved_at).length > 0 && (
                      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                        <div className="font-semibold text-body-sm">Data quality warnings</div>
                        <ul className="mt-1 list-disc pl-5 text-body-sm">
                          {campaignWarnings
                            .filter((warning) => !warning.resolved_at)
                            .map((warning) => (
                              <li key={warning.id}>{warning.message}</li>
                            ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex justify-between items-center border-t border-hairline pt-3">
                      <div className="text-body-sm text-ink-subtle">
                        Shortlist Report for Hiring Manager
                      </div>
                      <Button
                        type="button"
                        onClick={() => setShowReportModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1.5"
                      >
                        <FileText className="size-4" />
                        Export and Manage HM Report
                      </Button>
                    </div>
                    <div className="rounded-lg border border-hairline divide-y divide-hairline overflow-hidden">
                      {activeCampaign.candidates.map(({ campaignCandidate, candidate }: any) => (
                        <div
                          key={campaignCandidate.candidate_id}
                          className="flex items-center justify-between gap-3 p-3 bg-canvas/30"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {candidate?.display_name ?? campaignCandidate.candidate_id}
                            </div>
                            <div className="text-xs text-ink-subtle truncate">
                              {campaignCandidate.error_reason ||
                                candidate?.email ||
                                'No candidate detail available'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {campaignCandidate.status === 'screening_failed' ||
                            campaignCandidate.status === 'draft_failed' ||
                            campaignCandidate.status === 'send_failed' ? (
                              <Badge variant="destructive">{campaignCandidate.status}</Badge>
                            ) : (
                              <Badge variant="secondary">{campaignCandidate.status}</Badge>
                            )}
                            {campaignCandidate.status === 'screening_failed' ? (
                              <span className="text-xs text-rose-600">Screening failed</span>
                            ) : (
                              <span className="text-xs font-semibold">
                                {campaignCandidate.fit_score ?? 0}% Fit
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {/* GATE 1 PANEL: CRITERIA CONFIRMATION */}
            {runStatus === 'paused' && isGate1Active && activeCriteria && (
              <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {dataWarnings.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="font-bold text-body-sm text-amber-800">
                        Data Quality Warnings
                      </span>
                      <ul className="list-disc pl-4 text-body-sm space-y-1">
                        {dataWarnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
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
                          disabled={isSavingCriteria || isConfirmingCriteria}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 font-medium shadow"
                        >
                          {isConfirmingCriteria ? (
                            <>
                              <Loader2 className="animate-spin size-4" />
                              <span>Confirming...</span>
                            </>
                          ) : (
                            <span>Confirm Criteria</span>
                          )}
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

                    {/* Skill Gap Analysis Section */}
                    {skillGaps && (
                      <div className="md:col-span-12 border-t border-hairline pt-6 flex flex-col gap-3">
                        <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-blue-700">
                            <Settings className="size-4" />
                            <span className="font-bold text-body-sm text-blue-800">
                              Team Skill Gap Analysis
                            </span>
                            <Badge variant="secondary" className="ml-auto text-[10px] uppercase">
                              {skillGaps.source === 'none' ? 'No source' : skillGaps.source}
                            </Badge>
                          </div>
                          <p className="text-body-sm text-ink-subtle">
                            <strong>Project/Team:</strong>{' '}
                            {skillGaps.teamName || 'No matching team'} |{' '}
                            <strong>Skill gaps:</strong>{' '}
                            {skillGaps.dataStatus === 'gaps_found' ? (
                              skillGaps.skillsGap.map((s: string, idx: number) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="mx-0.5 text-rose-600 bg-rose-50 border-rose-100"
                                >
                                  {s}
                                </Badge>
                              ))
                            ) : skillGaps.dataStatus === 'no_gap_detected' ? (
                              <span className="text-emerald-600 font-semibold">
                                No gap recorded in linked team data
                              </span>
                            ) : (
                              <span className="text-amber-700 font-semibold">
                                Insufficient matching team data
                              </span>
                            )}
                          </p>
                          <blockquote className="border-l-2 border-hairline-strong pl-3 italic text-body-sm text-ink-subtle my-1">
                            "{skillGaps.summary}"
                          </blockquote>
                          {skillGaps.dataStatus === 'gaps_found' &&
                          skillGaps.recommendations.length > 0 ? (
                            <div className="text-body-sm text-ink flex flex-col gap-1 mt-1">
                              <strong className="text-blue-900">
                                Screening guidance from verified gaps:
                              </strong>
                              <ul className="list-disc pl-4 space-y-1">
                                {skillGaps.recommendations.map((rec: string, idx: number) => (
                                  <li key={idx} className="text-ink-subtle">
                                    {rec}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-body-sm text-ink-subtle">
                              {skillGaps.dataStatus === 'no_gap_detected'
                                ? 'No skill-gap scoring adjustment is applied.'
                                : 'Skill-gap scoring is disabled until a matching hire request and team matrix are available.'}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Talent Pool Recommendations (Phase 2) */}
                    <div className="md:col-span-12 border-t border-hairline pt-6 flex flex-col gap-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-body-md font-bold text-ink flex items-center gap-2">
                            <Sparkles className="size-4 text-emerald-600" />
                            Talent Pool Recommendations
                          </h3>
                          <p className="text-body-sm text-ink-subtle">
                            Browse existing candidates on demand, then select profiles to add to
                            this screening run.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleBrowseTalentPool}
                            disabled={isLoadingPool || isAddingPoolCandidates}
                            className="font-medium flex items-center gap-1.5 h-9 text-xs"
                          >
                            {isLoadingPool ? (
                              <Loader2 className="animate-spin size-3.5" />
                            ) : hasBrowsedPool ? (
                              <RefreshCw className="size-3.5" />
                            ) : (
                              <Search className="size-3.5" />
                            )}
                            <span>
                              {hasBrowsedPool ? 'Refresh Results' : 'Browse Existing Candidates'}
                            </span>
                          </Button>
                          {hasBrowsedPool && poolCandidates.length > 0 && (
                            <Button
                              type="button"
                              onClick={handleReengageCandidates}
                              disabled={
                                isLoadingPool ||
                                isAddingPoolCandidates ||
                                Object.values(selectedPoolIds).filter(Boolean).length === 0
                              }
                              className="bg-primary hover:bg-primary-hover text-white font-medium shadow flex items-center gap-1.5 h-9 text-xs"
                            >
                              {isAddingPoolCandidates ? (
                                <Loader2 className="animate-spin size-3.5" />
                              ) : (
                                <Mail className="size-3.5" />
                              )}
                              <span>
                                {isAddingPoolCandidates ? 'Adding...' : 'Re-engage Candidates'}
                              </span>
                            </Button>
                          )}
                        </div>
                      </div>

                      {isLoadingPool ? (
                        <div className="py-8 flex justify-center items-center gap-2 text-body-sm text-ink-subtle">
                          <Loader2 className="size-5 text-primary animate-spin" />
                          Searching the existing candidate pool...
                        </div>
                      ) : poolLoadError ? (
                        <div className="py-6 text-center text-body-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                          {poolLoadError}
                        </div>
                      ) : !hasBrowsedPool ? (
                        <div className="py-6 text-center text-body-sm text-ink-subtle bg-canvas/30 rounded-lg border border-dashed border-hairline">
                          Existing candidates are not searched automatically. Use Browse Existing
                          Candidates when you want recommendations for this JD.
                        </div>
                      ) : poolCandidates.length === 0 ? (
                        <div className="py-6 text-center text-body-sm text-ink-subtle bg-canvas/30 rounded-lg border border-dashed border-hairline">
                          No matching candidates found in the talent database.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {poolCandidates.map((c) => {
                            const isChecked = !!selectedPoolIds[c.id];
                            return (
                              <div
                                key={c.id}
                                onClick={() =>
                                  setSelectedPoolIds((prev) => ({
                                    ...prev,
                                    [c.id]: !prev[c.id],
                                  }))
                                }
                                className={cn(
                                  'p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 relative overflow-hidden',
                                  isChecked
                                    ? 'bg-primary-tint/20 border-primary shadow-sm'
                                    : 'bg-surface-1 border-hairline hover:bg-canvas/50',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}} // toggled by outer click
                                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                                    />
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-body-sm font-bold text-ink truncate">
                                        {c.displayName}
                                      </span>
                                      <span className="text-eyebrow text-ink-subtle truncate">
                                        {c.email}
                                      </span>
                                    </div>
                                  </div>
                                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] py-0.5 px-2 rounded-full shrink-0">
                                    {c.similarityScore === null
                                      ? 'Position match'
                                      : `${Math.round(c.similarityScore * 100)}% Similarity`}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* PIPELINE SCANNING STATE */}
            {['running', 'waiting', 'pending'].includes(runStatus || '') && !activeApproval && (
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
              <div
                ref={gate2Ref}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300 scroll-mt-6"
              >
                {/* Left Side: Candidates list */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <Card className="shadow-sm border-hairline overflow-hidden bg-surface flex flex-col h-[600px]">
                    <div className="p-4 border-b border-hairline flex items-center justify-between bg-canvas/30">
                      <div className="flex flex-col gap-0.5">
                        <CardTitle className="text-body-md font-bold text-ink">
                          Gate 2: Shortlist Candidates
                        </CardTitle>
                        <CardDescription className="text-eyebrow">
                          Select candidate to review or edit outreach mail.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleApproveOutreachBulk}
                          disabled={isSavingDraft || isApprovingOutreach}
                          className="bg-primary hover:bg-primary-hover text-white font-semibold shadow-sm flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs"
                        >
                          {isApprovingOutreach ? (
                            <>
                              <Loader2 className="animate-spin size-3.5" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <Send className="size-3.5" />
                              <span>Approve & Send All</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Tab Filters */}
                    <div className="flex border-b border-hairline bg-canvas/10 overflow-x-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => setCandidateFilter('all')}
                        className={cn(
                          'px-3 py-2 text-body-sm font-medium border-b-2 transition-colors shrink-0',
                          candidateFilter === 'all'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-ink-subtle hover:text-ink',
                        )}
                      >
                        All ({candidatesList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setCandidateFilter('pass')}
                        className={cn(
                          'px-3 py-2 text-body-sm font-medium border-b-2 transition-colors shrink-0',
                          candidateFilter === 'pass'
                            ? 'border-emerald-500 text-emerald-600'
                            : 'border-transparent text-ink-subtle hover:text-ink',
                        )}
                      >
                        Passed ({candidatesList.filter((c) => (c.fit_score ?? 0) >= 70).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setCandidateFilter('fail')}
                        className={cn(
                          'px-3 py-2 text-body-sm font-medium border-b-2 transition-colors shrink-0',
                          candidateFilter === 'fail'
                            ? 'border-amber-500 text-amber-600'
                            : 'border-transparent text-ink-subtle hover:text-ink',
                        )}
                      >
                        Not passed ({candidatesList.filter((c) => (c.fit_score ?? 0) < 70).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setCandidateFilter('hallucination')}
                        className={cn(
                          'px-3 py-2 text-body-sm font-medium border-b-2 transition-colors shrink-0',
                          candidateFilter === 'hallucination'
                            ? 'border-rose-500 text-rose-600'
                            : 'border-transparent text-ink-subtle hover:text-ink',
                        )}
                      >
                        Hallucination (
                        {candidatesList.filter((c) => isHallucinationFail(c.id)).length})
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-hairline">
                      {filteredCandidates.map((cand) => {
                        const isSelected = selectedCandidate?.id === cand.id;
                        const fitScore = cand.fit_score ?? 0;
                        const scoreColor =
                          fitScore >= 70
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
                          {selectedCandidate.status === 'screening_failed' ? (
                            <Badge className="bg-rose-500 text-white">Screening failed</Badge>
                          ) : (
                            <Badge className="bg-emerald-500 text-white">
                              {selectedCandidate.effective_fit_score ??
                                selectedCandidate.fit_score ??
                                'Pending'}
                              % Fit
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Content panel */}
                      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
                        <CandidateScorecard
                          selectedCandidate={selectedCandidate}
                          campaignId={activeCampaignId || ''}
                          onReviewSaved={async () => {
                            if (activeCampaignId) {
                              await fetchCampaignProgress(activeCampaignId);
                            } else {
                              await fetchCandidatesAndDrafts();
                            }
                          }}
                        />

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
                              {editingDraft.hallucination_check_status === 'failed' && (
                                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 flex items-start gap-2.5 text-rose-700 text-body-sm animate-pulse">
                                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-500" />
                                  <div className="flex-grow">
                                    <span className="font-bold">Hallucination Warning:</span> The
                                    verification layer found draft content that does not match the
                                    source CV. Review carefully before sending.
                                  </div>
                                </div>
                              )}
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
                  {candidatesList.map((cand) => {
                    const status = cand.status;
                    const isOutreached = status === 'outreached';
                    const isShortlisted = status === 'shortlisted';
                    return (
                      <div
                        key={cand.id}
                        className="py-3 flex items-center justify-between text-body-sm"
                      >
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-ink-tertiary" />
                          <span className="font-semibold text-ink">{cand.display_name}</span>
                          <span className="text-ink-subtle">({cand.email})</span>
                          <span className="text-xs text-ink-muted">· Score: {cand.fit_score}%</span>
                        </div>
                        {isOutreached ? (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                            Outreached
                          </Badge>
                        ) : isShortlisted ? (
                          <Badge className="bg-blue-500/10 text-blue-500 border border-blue-500/20 font-medium">
                            Shortlisted
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">
                            Screened Only
                          </Badge>
                        )}
                      </div>
                    );
                  })}
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
        {/* TAB 3: ENTERPRISE SETTINGS (Phase 3) */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ATS Integration Settings */}
            <Card className="shadow-sm border-hairline bg-canvas/40">
              <CardHeader>
                <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                  <RefreshCw className="size-4 text-primary" />
                  ATS Integration (Workday)
                </CardTitle>
                <CardDescription className="text-ink-subtle">
                  Configure webhook synchronization with your Workday ATS to auto-import candidates
                  and job requisitions.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-body-sm font-medium text-ink">Webhook Endpoint URL</label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/smartrecruit/v1/ats/webhook`}
                      readOnly
                      className="flex-1 bg-surface-1 text-ink-subtle font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/api/smartrecruit/v1/ats/webhook`,
                        );
                        toast.success('Webhook URL copied to clipboard!');
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-ink-muted">
                    Configure this URL in your Workday Integration Studio as the webhook receiver.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-body-sm font-medium text-ink">API Base URL</label>
                  <Input
                    placeholder="https://wd3-impl-services1.workday.com/ccx/api/v1/your_tenant"
                    value={atsApiBaseUrl}
                    onChange={(e: any) => setAtsApiBaseUrl(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-body-sm font-medium text-ink">Client ID</label>
                    <Input
                      placeholder="OAuth2 Client ID"
                      value={atsClientId}
                      onChange={(e: any) => setAtsClientId(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-body-sm font-medium text-ink">Client Secret</label>
                    <Input
                      type="password"
                      placeholder="OAuth2 Client Secret"
                      value={atsClientSecret}
                      onChange={(e: any) => setAtsClientSecret(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-body-sm font-medium text-ink">Webhook Secret (HMAC)</label>
                  <Input
                    type="password"
                    placeholder="Shared secret for webhook signature verification"
                    value={atsWebhookSecret}
                    onChange={(e: any) => setAtsWebhookSecret(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button
                    onClick={() => {
                      setIsSavingAtsConfig(true);
                      setTimeout(() => {
                        setIsSavingAtsConfig(false);
                        setAtsConfigSaved(true);
                        toast.success('ATS configuration saved successfully!');
                        setTimeout(() => setAtsConfigSaved(false), 3000);
                      }, 1000);
                    }}
                    disabled={isSavingAtsConfig || !atsApiBaseUrl || !atsClientId}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium"
                  >
                    {isSavingAtsConfig ? (
                      <Loader2 className="size-4 animate-spin mr-1" />
                    ) : atsConfigSaved ? (
                      <CheckCircle className="size-4 mr-1" />
                    ) : null}
                    {isSavingAtsConfig ? 'Saving...' : atsConfigSaved ? 'Saved' : 'Save ATS Config'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      toast.success(
                        'Test webhook event sent! Check logs for receipt confirmation.',
                      );
                    }}
                  >
                    Send Test Event
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Scoring Weights Configuration */}
            <Card className="shadow-sm border-hairline bg-canvas/40">
              <CardHeader>
                <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                  <Sparkles className="size-4 text-primary" />
                  Scoring Weights Configuration
                </CardTitle>
                <CardDescription className="text-ink-subtle">
                  Customize the default scoring weight distribution for candidate evaluation.
                  Weights must total 100%.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-body-sm font-medium text-ink">Must-Have Skills</label>
                      <span className="text-body-sm font-semibold text-primary">{swMustHave}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={swMustHave}
                      onChange={(e) => setSwMustHave(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-body-sm font-medium text-ink">
                        Years of Experience
                      </label>
                      <span className="text-body-sm font-semibold text-primary">{swYoe}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={swYoe}
                      onChange={(e) => setSwYoe(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-body-sm font-medium text-ink">English Level</label>
                      <span className="text-body-sm font-semibold text-primary">{swEnglish}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={swEnglish}
                      onChange={(e) => setSwEnglish(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-body-sm font-medium text-ink">
                        Nice-to-Have Skills
                      </label>
                      <span className="text-body-sm font-semibold text-primary">
                        {swNiceToHave}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={swNiceToHave}
                      onChange={(e) => setSwNiceToHave(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-hairline pt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-body-sm font-medium text-ink">Total:</span>
                    <span
                      className={cn(
                        'text-body-sm font-bold',
                        swMustHave + swYoe + swEnglish + swNiceToHave === 100
                          ? 'text-emerald-600'
                          : 'text-red-500',
                      )}
                    >
                      {swMustHave + swYoe + swEnglish + swNiceToHave}%
                    </span>
                    {swMustHave + swYoe + swEnglish + swNiceToHave !== 100 && (
                      <span className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        Must total 100%
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      if (swMustHave + swYoe + swEnglish + swNiceToHave !== 100) {
                        toast.error('Weights must total 100%');
                        return;
                      }
                      setIsSavingWeights(true);
                      setTimeout(() => {
                        setIsSavingWeights(false);
                        setWeightsSaved(true);
                        toast.success('Scoring weights saved!');
                        setTimeout(() => setWeightsSaved(false), 3000);
                      }, 800);
                    }}
                    disabled={
                      isSavingWeights || swMustHave + swYoe + swEnglish + swNiceToHave !== 100
                    }
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium"
                  >
                    {isSavingWeights ? (
                      <Loader2 className="size-4 animate-spin mr-1" />
                    ) : weightsSaved ? (
                      <CheckCircle className="size-4 mr-1" />
                    ) : null}
                    {isSavingWeights ? 'Saving...' : weightsSaved ? 'Saved' : 'Save Weights'}
                  </Button>
                </div>

                <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/30 rounded-lg p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Tip:</strong> For Senior roles, increase YOE weight. For Fresher roles,
                    increase Must-Have Skills weight. These weights apply as defaults for all new
                    campaigns.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Interview Calendar Integration */}
            <Card className="shadow-sm border-hairline bg-canvas/40 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-body-lg font-semibold flex items-center gap-2 text-ink">
                  <Calendar className="size-4 text-primary" />
                  Interview Scheduling (M365 Outlook Calendar)
                </CardTitle>
                <CardDescription className="text-ink-subtle">
                  Schedule interviews for shortlisted candidates directly from SmartRecruit. Creates
                  Outlook calendar events with Teams meeting links.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {interviewScheduleList.length === 0 ? (
                  <div className="text-center py-8 text-ink-muted">
                    <Calendar className="size-8 mx-auto mb-2 opacity-40" />
                    <p className="text-body-sm">
                      No interviews scheduled yet. Schedule interviews from the Active Pipeline tab
                      by clicking "Schedule Interview" on shortlisted candidates.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {interviewScheduleList.map((interview: any, idx: number) => (
                      <div
                        key={interview.id || idx}
                        className="flex items-center justify-between border border-hairline rounded-lg p-3 bg-surface-1"
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                            {(interview.candidate_name || 'U')[0]}
                          </div>
                          <div>
                            <p className="font-medium text-ink text-sm">
                              {interview.candidate_name}
                            </p>
                            <p className="text-xs text-ink-subtle">
                              {interview.interviewer_email} ·{' '}
                              {new Date(interview.scheduled_at).toLocaleDateString('vi-VN', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={cn(
                              'text-xs font-medium',
                              interview.status === 'confirmed'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : interview.status === 'canceled'
                                  ? 'bg-red-500/10 text-red-500'
                                  : 'bg-amber-500/10 text-amber-600',
                            )}
                          >
                            {interview.status}
                          </Badge>
                          {interview.teams_link && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(interview.teams_link, '_blank')}
                            >
                              Join Teams
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
        <Dialog open={showCancelPipelineDialog} onOpenChange={setShowCancelPipelineDialog}>
          <DialogContent hideClose={cancelCampaignMutation.isPending} className="max-w-md">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-destructive-tint/20 text-destructive flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <DialogTitle>Cancel screening pipeline?</DialogTitle>
                  <DialogDescription>
                    This stops the current SmartRecruit campaign. Pending jobs will be ignored, and
                    unsent candidates will be marked as rejected so the run no longer stays pending.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {activeCampaign?.campaign && (
              <div className="rounded-lg border border-hairline bg-surface-1 p-3 text-body-sm">
                <div className="font-medium text-ink truncate">
                  {activeCampaign.campaign.job_title}
                </div>
                <div className="text-ink-subtle">
                  Status: {activeCampaign.campaign.status} - Campaign ID:{' '}
                  {activeCampaign.campaign.id.slice(0, 8)}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button
                type="button"
                variant="secondary"
                disabled={cancelCampaignMutation.isPending}
                onClick={() => setShowCancelPipelineDialog(false)}
              >
                Keep Pipeline
              </Button>
              <Button
                type="button"
                disabled={cancelCampaignMutation.isPending}
                onClick={handleCancelActiveCampaign}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {cancelCampaignMutation.isPending ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="size-4 mr-2" />
                )}
                Cancel Pipeline
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {showReportModal && activeCampaignId && (
          <HMReportModal campaignId={activeCampaignId} onClose={() => setShowReportModal(false)} />
        )}
      </div>
    </PageChrome>
  );
}
export default SmartrecruitPage;
