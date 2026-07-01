export class SmartrecruitClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: Record<string, unknown>;

  constructor(status: number, code: string, body: Record<string, unknown>, message?: string) {
    super(message ?? `${status} ${code}`);
    this.name = 'SmartrecruitClientError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined as any;
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : `HTTP_${res.status}`;
    throw new SmartrecruitClientError(
      res.status,
      code,
      body,
      typeof body.message === 'string' ? body.message : undefined,
    );
  }
  return body as T;
}

export const smartrecruitApi = {
  async getCampaigns(scope: 'self' | 'tenant' = 'self'): Promise<{ campaigns: any[] }> {
    return request<{ campaigns: any[] }>(`/api/smartrecruit/v1/campaigns?scope=${scope}`);
  },

  async getCampaign(id: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/campaigns/${id}`);
  },

  async cancelCampaign(campaignId: string, reason?: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/campaigns/${campaignId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async cancelWorkflowRun(runId: string): Promise<any> {
    return request<any>(`/api/agent/v1/workflows/runs/${runId}/cancel`, {
      method: 'POST',
    });
  },

  async createCampaign(input: {
    jobTitle: string;
    jdText: string;
    templateId?: string;
    cvs: Array<{
      candidateName: string;
      candidateEmail: string;
      candidatePhone?: string;
      cvPath?: string;
      cvText: string;
      security?: any;
    }>;
  }): Promise<any> {
    return request<any>('/api/smartrecruit/v1/campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async searchPoolCandidates(
    campaignId: string,
    filters: { limit?: number; minSimilarity?: number } = {},
  ): Promise<{ criteriaId: string; matched: number; results: any[] }> {
    return request<{ criteriaId: string; matched: number; results: any[] }>(
      `/api/smartrecruit/v1/campaigns/${campaignId}/pool-search`,
      {
        method: 'POST',
        body: JSON.stringify(filters),
      },
    );
  },

  async addPoolCandidates(
    campaignId: string,
    candidateIds: string[],
  ): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(
      `/api/smartrecruit/v1/campaigns/${campaignId}/add-pool-candidates`,
      {
        method: 'POST',
        body: JSON.stringify({ candidateIds }),
      },
    );
  },

  async reviewCandidate(
    campaignId: string,
    candidateId: string,
    input: { fitScore: number; reason: string },
  ): Promise<{ campaignCandidate: any; effectiveFitScore: number }> {
    return request<{ campaignCandidate: any; effectiveFitScore: number }>(
      `/api/smartrecruit/v1/campaigns/${campaignId}/candidates/${candidateId}/review`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );
  },

  async getCampaignMetrics(campaignId: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/campaigns/${campaignId}/metrics`);
  },

  async getCampaignKPIs(
    campaignId: string,
    pricing?: { inputPrice?: number; outputPrice?: number },
  ): Promise<any> {
    const q = new URLSearchParams();
    if (pricing?.inputPrice !== undefined) q.set('inputPrice', String(pricing.inputPrice));
    if (pricing?.outputPrice !== undefined) q.set('outputPrice', String(pricing.outputPrice));
    const qs = q.toString();
    return request<any>(`/api/smartrecruit/v1/campaigns/${campaignId}/kpis${qs ? `?${qs}` : ''}`);
  },

  async getCampaignWarnings(campaignId: string): Promise<{ warnings: any[] }> {
    return request<{ warnings: any[] }>(`/api/smartrecruit/v1/campaigns/${campaignId}/warnings`);
  },

  async resolveWarning(
    campaignId: string,
    warningId: string,
    note?: string,
  ): Promise<{ warning: any }> {
    return request<{ warning: any }>(
      `/api/smartrecruit/v1/campaigns/${campaignId}/warnings/${warningId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      },
    );
  },

  async createReport(campaignId: string, recruiterNote?: string): Promise<{ report: any }> {
    return request<{ report: any }>(`/api/smartrecruit/v1/campaigns/${campaignId}/reports`, {
      method: 'POST',
      body: JSON.stringify({ recruiterNote }),
    });
  },

  async listReports(campaignId: string): Promise<{ reports: any[] }> {
    return request<{ reports: any[] }>(`/api/smartrecruit/v1/campaigns/${campaignId}/reports`);
  },

  async importMockData(filePath?: string): Promise<any> {
    return request<any>('/api/smartrecruit/v1/mock-data/import', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    });
  },

  async uploadCv(file: File): Promise<{
    filename: string;
    text: string;
    security?: {
      riskLevel?: 'low' | 'medium' | 'high';
      requiresHumanReview?: boolean;
      ocrComparisonAvailable?: boolean;
      flags?: Array<{
        code?: string;
        severity?: 'warning' | 'error';
        message?: string;
        snippet?: string;
      }>;
    };
  }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/smartrecruit/v1/upload-cv', {
      method: 'POST',
      credentials: 'include',
      body: formData, // fetch sets boundary automatically for FormData
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(body.message || body.error || `Failed to upload CV: ${res.status}`);
    }
    return res.json() as Promise<{
      filename: string;
      text: string;
      security?: {
        riskLevel?: 'low' | 'medium' | 'high';
        requiresHumanReview?: boolean;
        ocrComparisonAvailable?: boolean;
        flags?: Array<{
          code?: string;
          severity?: 'warning' | 'error';
          message?: string;
          snippet?: string;
        }>;
      };
    }>;
  },

  async uploadJd(file: File): Promise<{ filename: string; text: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/smartrecruit/v1/upload-jd', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(body.message || body.error || `Failed to upload JD: ${res.status}`);
    }
    return res.json() as Promise<{ filename: string; text: string }>;
  },

  async extractCandidateInfo(
    cvText: string,
  ): Promise<{ name: string; email: string; phone: string | null }> {
    return request<{ name: string; email: string; phone: string | null }>(
      '/api/smartrecruit/v1/extract-candidate-info',
      {
        method: 'POST',
        body: JSON.stringify({ cvText }),
      },
    );
  },

  async getCriteria(): Promise<{ criteria: any[] }> {
    return request<{ criteria: any[] }>('/api/smartrecruit/v1/criteria');
  },

  async getCriteriaById(id: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/criteria/${id}`);
  },

  async updateCriteria(
    id: string,
    input: {
      mustHaveSkills: string[];
      niceToHaveSkills: string[];
      minYoe: number;
      educationLevel: string | null;
      additionalRequirements: string | null;
    },
  ): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/criteria/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async screenCandidatesFromPool(
    criteriaId: string,
    filters: { limit?: number; includeAlreadyScreened?: boolean } = {},
  ): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/criteria/${criteriaId}/screen-candidates`, {
      method: 'POST',
      body: JSON.stringify(filters),
    });
  },

  async suggestCandidates(criteriaId: string): Promise<{ candidates: any[] }> {
    return request<{ candidates: any[] }>(
      `/api/smartrecruit/v1/criteria/${criteriaId}/suggest-candidates`,
    );
  },

  async screenCv(input: {
    candidateName: string;
    candidateEmail: string;
    candidatePhone?: string;
    cvPath?: string;
    cvText: string;
    criteriaId: string;
  }): Promise<any> {
    return request<any>('/api/smartrecruit/v1/candidates/screen-cv', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getCandidates(): Promise<{ candidates: any[] }> {
    return request<{ candidates: any[] }>('/api/smartrecruit/v1/candidates');
  },

  async getCandidate(id: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/candidates/${id}`);
  },

  async getTemplates(): Promise<{ templates: any[] }> {
    return request<{ templates: any[] }>('/api/smartrecruit/v1/templates');
  },

  async draftOutreach(input: { candidateId: string; templateId?: string }): Promise<any> {
    return request<any>('/api/smartrecruit/v1/outreach/draft', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getOutreachDrafts(): Promise<{ drafts: any[] }> {
    return request<{ drafts: any[] }>('/api/smartrecruit/v1/outreach/drafts');
  },

  async getOutreachDraft(id: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/outreach/drafts/${id}`);
  },

  async updateOutreachDraft(id: string, input: { subject: string; body: string }): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/outreach/drafts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async sendOutreachDraft(id: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/outreach/drafts/${id}/send`, {
      method: 'POST',
    });
  },

  async getSkillGaps(jobTitle: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/skill-gaps?jobTitle=${encodeURIComponent(jobTitle)}`);
  },

  async scheduleInterview(input: {
    campaignCandidateId: string;
    candidateId: string;
    campaignId: string;
    interviewerEmail: string;
    interviewerName?: string;
    candidateEmail: string;
    candidateName: string;
    scheduledAt: string;
    durationMinutes?: number;
    notes?: string;
  }): Promise<any> {
    return request<any>('/api/smartrecruit/v1/interviews/schedule', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getInterviews(campaignId?: string): Promise<{ interviews: any[] }> {
    const qs = campaignId ? `?campaignId=${campaignId}` : '';
    return request<{ interviews: any[] }>(`/api/smartrecruit/v1/interviews${qs}`);
  },

  async cancelInterview(id: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/interviews/${id}/cancel`, {
      method: 'POST',
    });
  },

  async updateScoringWeights(
    criteriaId: string,
    weights: {
      weightMustHaveSkills: number;
      weightYoe: number;
      weightEnglish: number;
      weightNiceToHave: number;
    },
  ): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/criteria/${criteriaId}/scoring-weights`, {
      method: 'PUT',
      body: JSON.stringify(weights),
    });
  },

  async getSlaTracker(
    filters: { status?: string; search?: string } = {},
  ): Promise<{ tracker: any[] }> {
    const q = new URLSearchParams();
    if (filters.status) q.set('status', filters.status);
    if (filters.search) q.set('search', filters.search);
    const qs = q.toString();
    return request<{ tracker: any[] }>(`/api/smartrecruit/v1/sla-tracker${qs ? `?${qs}` : ''}`);
  },

  async importSlaTracker(filePath?: string): Promise<any> {
    return request<any>('/api/smartrecruit/v1/sla-tracker/import', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    });
  },

  async updateSlaContact(
    feedbackRequestId: string,
    hiringManagerEmail: string,
  ): Promise<{ request: any }> {
    return request<{ request: any }>(
      `/api/smartrecruit/v1/sla-tracker/${feedbackRequestId}/contact`,
      {
        method: 'PATCH',
        body: JSON.stringify({ hiringManagerEmail }),
      },
    );
  },

  async createSlaReminderDraft(feedbackRequestId: string): Promise<{ draft: any }> {
    return request<{ draft: any }>(
      `/api/smartrecruit/v1/sla-tracker/${feedbackRequestId}/reminder-draft`,
      {
        method: 'POST',
      },
    );
  },

  async getSlaReminder(attemptId: string): Promise<{ attempt: any }> {
    return request<{ attempt: any }>(`/api/smartrecruit/v1/sla-tracker/reminders/${attemptId}`);
  },

  async updateSlaReminder(
    attemptId: string,
    input: { subject: string; body: string },
  ): Promise<{ attempt: any }> {
    return request<{ attempt: any }>(`/api/smartrecruit/v1/sla-tracker/reminders/${attemptId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async approveSlaReminder(feedbackRequestId: string): Promise<{ attempt: any }> {
    return request<{ attempt: any }>(
      `/api/smartrecruit/v1/sla-tracker/${feedbackRequestId}/reminders/approve`,
      {
        method: 'POST',
      },
    );
  },

  async retrySlaReminder(attemptId: string): Promise<any> {
    return request<any>(`/api/smartrecruit/v1/sla-tracker/reminders/${attemptId}/retry`, {
      method: 'POST',
    });
  },

  async getWorkflowRuns(workflowId: string, scope = 'self'): Promise<{ rows: any[] }> {
    return request<{ rows: any[] }>(
      `/api/agent/v1/workflows/runs?workflowId=${workflowId}&scope=${scope}`,
    );
  },

  async getWorkflowRun(runId: string): Promise<any> {
    return request<any>(`/api/agent/v1/workflows/runs/${runId}`);
  },

  async getMyPendingApprovals(): Promise<any[]> {
    return request<any[]>('/api/agent/v1/workflows/my-pending-approvals');
  },

  async decideApproval(
    approvalId: string,
    body: {
      decision: 'approve' | 'reject' | 'modify';
      argsPatch?: Record<string, unknown>;
      note?: string;
    },
  ): Promise<any> {
    return request<any>(`/api/agent/v1/workflows/approvals/${approvalId}/decide`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async startWorkflowRun(
    campaignId: string,
    jobTitle: string,
    jdText: string,
  ): Promise<{ runId: string }> {
    return request<{ runId: string }>('/api/agent/v1/workflows/runs/smartrecruit/start', {
      method: 'POST',
      body: JSON.stringify({ campaignId, jobTitle, jdText, cvs: [] }),
    });
  },
};
