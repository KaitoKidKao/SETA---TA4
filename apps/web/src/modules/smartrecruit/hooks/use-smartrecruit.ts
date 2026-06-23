import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { smartrecruitApi } from '../api/smartrecruit-client';

export const smartrecruitQueryKeys = {
  campaigns: (scope: 'self' | 'tenant') => ['smartrecruit', 'campaigns', scope] as const,
  campaign: (id: string) => ['smartrecruit', 'campaign', id] as const,
  campaignMetrics: (campaignId: string) =>
    ['smartrecruit', 'campaign', campaignId, 'metrics'] as const,
  campaignKPIs: (campaignId: string, pricing?: { inputPrice?: number; outputPrice?: number }) =>
    ['smartrecruit', 'campaign', campaignId, 'kpis', pricing] as const,
  campaignWarnings: (campaignId: string) =>
    ['smartrecruit', 'campaign', campaignId, 'warnings'] as const,
  reports: (campaignId: string) => ['smartrecruit', 'campaign', campaignId, 'reports'] as const,
  criteria: () => ['smartrecruit', 'criteria'] as const,
  criteriaDetails: (id: string) => ['smartrecruit', 'criteria', id] as const,
  candidates: () => ['smartrecruit', 'candidates'] as const,
  candidate: (id: string) => ['smartrecruit', 'candidate', id] as const,
  templates: () => ['smartrecruit', 'templates'] as const,
  drafts: () => ['smartrecruit', 'drafts'] as const,
  draft: (id: string) => ['smartrecruit', 'draft', id] as const,
  interviews: (campaignId?: string) => ['smartrecruit', 'interviews', campaignId] as const,
  slaTracker: (filters: { status?: string; search?: string }) =>
    ['smartrecruit', 'slaTracker', filters] as const,
  workflowRuns: (workflowId: string, scope: string) =>
    ['agent', 'workflows', 'runs', workflowId, scope] as const,
  workflowRun: (runId: string) => ['agent', 'workflows', 'run', runId] as const,
  pendingApprovals: () => ['agent', 'workflows', 'pendingApprovals'] as const,
};

export function useSmartrecruitCampaigns(scope: 'self' | 'tenant' = 'self') {
  return useQuery({
    queryKey: smartrecruitQueryKeys.campaigns(scope),
    queryFn: () => smartrecruitApi.getCampaigns(scope),
  });
}

export function useSmartrecruitCampaign(
  id: string | null,
  options: { refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.campaign(id || ''),
    queryFn: () => smartrecruitApi.getCampaign(id!),
    enabled: !!id,
    refetchInterval: options.refetchInterval,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof smartrecruitApi.createCampaign>[0]) =>
      smartrecruitApi.createCampaign(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.campaigns('self') });
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.campaigns('tenant') });
    },
  });
}

export function useCancelCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { campaignId: string; reason?: string }) =>
      smartrecruitApi.cancelCampaign(input.campaignId, input.reason),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.campaign(variables.campaignId) });
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.campaigns('self') });
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.campaigns('tenant') });
    },
  });
}

export function useSearchPoolCandidates(
  campaignId: string,
  filters: { limit?: number; minSimilarity?: number },
) {
  return useQuery({
    queryKey: ['smartrecruit', 'pool-search', campaignId, filters],
    queryFn: () => smartrecruitApi.searchPoolCandidates(campaignId, filters),
    enabled: !!campaignId,
  });
}

export function useAddPoolCandidates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { campaignId: string; candidateIds: string[] }) =>
      smartrecruitApi.addPoolCandidates(input.campaignId, input.candidateIds),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.campaign(variables.campaignId) });
      qc.invalidateQueries({
        queryKey: smartrecruitQueryKeys.campaignMetrics(variables.campaignId),
      });
    },
  });
}

export function useReviewCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      campaignId: string;
      candidateId: string;
      fitScore: number;
      reason: string;
    }) =>
      smartrecruitApi.reviewCandidate(input.campaignId, input.candidateId, {
        fitScore: input.fitScore,
        reason: input.reason,
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.campaign(variables.campaignId) });
      qc.invalidateQueries({
        queryKey: smartrecruitQueryKeys.campaignMetrics(variables.campaignId),
      });
    },
  });
}

export function useCampaignMetrics(campaignId: string | null) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.campaignMetrics(campaignId || ''),
    queryFn: () => smartrecruitApi.getCampaignMetrics(campaignId!),
    enabled: !!campaignId,
  });
}

export function useCampaignKPIs(
  campaignId: string | null,
  pricing?: { inputPrice?: number; outputPrice?: number },
) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.campaignKPIs(campaignId || '', pricing),
    queryFn: () => smartrecruitApi.getCampaignKPIs(campaignId!, pricing),
    enabled: !!campaignId,
  });
}

export function useCampaignWarnings(campaignId: string | null) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.campaignWarnings(campaignId || ''),
    queryFn: () => smartrecruitApi.getCampaignWarnings(campaignId!),
    enabled: !!campaignId,
  });
}

export function useResolveWarning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { campaignId: string; warningId: string; note?: string }) =>
      smartrecruitApi.resolveWarning(input.campaignId, input.warningId, input.note),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: smartrecruitQueryKeys.campaignWarnings(variables.campaignId),
      });
    },
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { campaignId: string; recruiterNote?: string }) =>
      smartrecruitApi.createReport(input.campaignId, input.recruiterNote),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.reports(variables.campaignId) });
    },
  });
}

export function useListReports(campaignId: string | null) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.reports(campaignId || ''),
    queryFn: () => smartrecruitApi.listReports(campaignId!),
    enabled: !!campaignId,
  });
}

export function useImportMockData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath?: string) => smartrecruitApi.importMockData(filePath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.candidates() });
    },
  });
}

export function useCriteria() {
  return useQuery({
    queryKey: smartrecruitQueryKeys.criteria(),
    queryFn: () => smartrecruitApi.getCriteria(),
  });
}

export function useCriteriaById(id: string | null) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.criteriaDetails(id || ''),
    queryFn: () => smartrecruitApi.getCriteriaById(id!),
    enabled: !!id,
  });
}

export function useUpdateCriteria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      mustHaveSkills: string[];
      niceToHaveSkills: string[];
      minYoe: number;
      educationLevel: string | null;
      additionalRequirements: string | null;
    }) => smartrecruitApi.updateCriteria(input.id, input),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.criteriaDetails(variables.id) });
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.criteria() });
    },
  });
}

export function useScreenCandidatesFromPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { criteriaId: string; limit?: number; includeAlreadyScreened?: boolean }) =>
      smartrecruitApi.screenCandidatesFromPool(input.criteriaId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.candidates() });
    },
  });
}

export function useSuggestCandidates(criteriaId: string | null) {
  return useQuery({
    queryKey: ['smartrecruit', 'suggest-candidates', criteriaId],
    queryFn: () => smartrecruitApi.suggestCandidates(criteriaId!),
    enabled: !!criteriaId,
  });
}

export function useScreenCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof smartrecruitApi.screenCv>[0]) =>
      smartrecruitApi.screenCv(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.candidates() });
    },
  });
}

export function useCandidates() {
  return useQuery({
    queryKey: smartrecruitQueryKeys.candidates(),
    queryFn: () => smartrecruitApi.getCandidates(),
  });
}

export function useCandidate(id: string | null) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.candidate(id || ''),
    queryFn: () => smartrecruitApi.getCandidate(id!),
    enabled: !!id,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: smartrecruitQueryKeys.templates(),
    queryFn: () => smartrecruitApi.getTemplates(),
  });
}

export function useDraftOutreach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { candidateId: string; templateId?: string }) =>
      smartrecruitApi.draftOutreach(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.drafts() });
    },
  });
}

export function useOutreachDrafts() {
  return useQuery({
    queryKey: smartrecruitQueryKeys.drafts(),
    queryFn: () => smartrecruitApi.getOutreachDrafts(),
  });
}

export function useOutreachDraft(id: string | null) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.draft(id || ''),
    queryFn: () => smartrecruitApi.getOutreachDraft(id!),
    enabled: !!id,
  });
}

export function useUpdateOutreachDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; subject: string; body: string }) =>
      smartrecruitApi.updateOutreachDraft(input.id, { subject: input.subject, body: input.body }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.draft(variables.id) });
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.drafts() });
    },
  });
}

export function useSendOutreachDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => smartrecruitApi.sendOutreachDraft(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.draft(id) });
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.drafts() });
    },
  });
}

export function useSkillGaps(jobTitle: string) {
  return useQuery({
    queryKey: ['smartrecruit', 'skill-gaps', jobTitle],
    queryFn: () => smartrecruitApi.getSkillGaps(jobTitle),
    enabled: !!jobTitle,
  });
}

export function useScheduleInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof smartrecruitApi.scheduleInterview>[0]) =>
      smartrecruitApi.scheduleInterview(input),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.interviews(variables.campaignId) });
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.interviews() });
    },
  });
}

export function useInterviews(campaignId?: string) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.interviews(campaignId),
    queryFn: () => smartrecruitApi.getInterviews(campaignId),
  });
}

export function useCancelInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => smartrecruitApi.cancelInterview(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.interviews() });
    },
  });
}

export function useUpdateScoringWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      criteriaId: string;
      weightMustHaveSkills: number;
      weightYoe: number;
      weightEnglish: number;
      weightNiceToHave: number;
    }) =>
      smartrecruitApi.updateScoringWeights(input.criteriaId, {
        weightMustHaveSkills: input.weightMustHaveSkills,
        weightYoe: input.weightYoe,
        weightEnglish: input.weightEnglish,
        weightNiceToHave: input.weightNiceToHave,
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: smartrecruitQueryKeys.criteriaDetails(variables.criteriaId),
      });
    },
  });
}

export function useSlaTracker(filters: { status?: string; search?: string }) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.slaTracker(filters),
    queryFn: () => smartrecruitApi.getSlaTracker(filters),
  });
}

export function useImportSlaTracker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath?: string) => smartrecruitApi.importSlaTracker(filePath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smartrecruit', 'slaTracker'] });
    },
  });
}

export function useCreateSlaReminderDraft() {
  return useMutation({
    mutationFn: (feedbackRequestId: string) =>
      smartrecruitApi.createSlaReminderDraft(feedbackRequestId),
  });
}

export function useSlaReminder(attemptId: string | null) {
  return useQuery({
    queryKey: ['smartrecruit', 'slaReminder', attemptId],
    queryFn: () => smartrecruitApi.getSlaReminder(attemptId!),
    enabled: !!attemptId,
  });
}

export function useUpdateSlaReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { attemptId: string; subject: string; body: string }) =>
      smartrecruitApi.updateSlaReminder(input.attemptId, {
        subject: input.subject,
        body: input.body,
      }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['smartrecruit', 'slaReminder', variables.attemptId] });
    },
  });
}

export function useApproveSlaReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feedbackRequestId: string) =>
      smartrecruitApi.approveSlaReminder(feedbackRequestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smartrecruit', 'slaTracker'] });
    },
  });
}

export function useRetrySlaReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) => smartrecruitApi.retrySlaReminder(attemptId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['smartrecruit', 'slaTracker'] });
    },
  });
}

export function useWorkflowRuns(
  workflowId: string,
  scope = 'self',
  options: { refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.workflowRuns(workflowId, scope),
    queryFn: () => smartrecruitApi.getWorkflowRuns(workflowId, scope),
    refetchInterval: options.refetchInterval,
  });
}

export function useWorkflowRun(runId: string | null, options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.workflowRun(runId || ''),
    queryFn: () => smartrecruitApi.getWorkflowRun(runId!),
    enabled: !!runId,
    refetchInterval: options.refetchInterval,
  });
}

export function usePendingApprovals(options: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: smartrecruitQueryKeys.pendingApprovals(),
    queryFn: () => smartrecruitApi.getMyPendingApprovals(),
    refetchInterval: options.refetchInterval,
  });
}

export function useSubmitDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      approvalId: string;
      decision: 'approve' | 'reject' | 'modify';
      argsPatch?: Record<string, unknown>;
      note?: string;
    }) =>
      smartrecruitApi.decideApproval(input.approvalId, {
        decision: input.decision,
        argsPatch: input.argsPatch,
        note: input.note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: smartrecruitQueryKeys.pendingApprovals() });
      qc.invalidateQueries({ queryKey: ['agent'] });
      qc.invalidateQueries({ queryKey: ['smartrecruit'] });
    },
  });
}

export function useStartWorkflowRun() {
  return useMutation({
    mutationFn: (input: { campaignId: string; jobTitle: string; jdText: string }) =>
      smartrecruitApi.startWorkflowRun(input.campaignId, input.jobTitle, input.jdText),
  });
}
