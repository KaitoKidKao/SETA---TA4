import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  PageChrome,
} from '@seta/shared-ui';
import { Activity, AlertTriangle, CheckCircle, Loader2, RefreshCw, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCampaignWarnings, useSmartrecruitCampaign, useSmartrecruitCampaigns } from '..';
import { CampaignKPIDashboard } from '../components/CampaignKPIDashboard';
import { SlaMonitoringSection } from '../components/SlaMonitoringSection';

interface CampaignSummary {
  id: string;
  job_title: string;
  status: string;
  total_candidates: number;
  screened_count: number;
  shortlisted_count: number;
  failed_count: number;
  drafted_count: number;
  sent_count: number;
  created_at: string;
}

const ACTIVE_STATUSES = new Set([
  'queued',
  'awaiting_criteria',
  'screening',
  'screening_completed',
  'drafting',
  'awaiting_outreach_approval',
  'sending',
]);

function statusClass(status: string): string {
  if (status === 'completed') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
  if (status === 'completed_with_errors' || status === 'failed') {
    return 'bg-rose-500/10 text-rose-700 border-rose-500/20';
  }
  if (status === 'canceled') return 'bg-surface-2 text-ink-subtle border-hairline';
  return 'bg-blue-500/10 text-blue-700 border-blue-500/20';
}

export function SmartrecruitMonitoringPage() {
  const campaignsQuery = useSmartrecruitCampaigns('self');
  const campaigns = (campaignsQuery.data?.campaigns ?? []) as CampaignSummary[];
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedCampaignId || campaigns.length === 0) return;
    const preferred = campaigns.find((campaign) => ACTIVE_STATUSES.has(campaign.status));
    const initialCampaign = preferred ?? campaigns[0];
    if (initialCampaign) setSelectedCampaignId(initialCampaign.id);
  }, [campaigns, selectedCampaignId]);

  const campaignQuery = useSmartrecruitCampaign(selectedCampaignId, {
    refetchInterval: selectedCampaignId ? 5000 : undefined,
  });
  const warningsQuery = useCampaignWarnings(selectedCampaignId);
  const campaign = campaignQuery.data?.campaign as CampaignSummary | undefined;
  const campaignCandidates = campaignQuery.data?.candidates ?? [];
  const unresolvedWarnings = (warningsQuery.data?.warnings ?? []).filter(
    (warning: { resolved_at?: string | null }) => !warning.resolved_at,
  );

  const progress = useMemo(() => {
    if (!campaign?.total_candidates) return 0;
    return Math.min(100, Math.round((campaign.screened_count / campaign.total_candidates) * 100));
  }, [campaign]);

  const refresh = async () => {
    await Promise.all([campaignsQuery.refetch(), campaignQuery.refetch(), warningsQuery.refetch()]);
  };

  return (
    <PageChrome title="SmartRecruit Monitoring">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
          <div>
            <h1 className="text-body-xl font-semibold text-ink">Campaign Monitoring</h1>
            <p className="mt-1 text-body-sm text-ink-subtle">
              Track campaign progress, screening outcomes, warnings, and AI usage.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={campaignsQuery.isFetching || campaignQuery.isFetching}
            onClick={refresh}
          >
            <RefreshCw
              className={cn(
                'mr-2 size-4',
                (campaignsQuery.isFetching || campaignQuery.isFetching) && 'animate-spin',
              )}
            />
            Refresh
          </Button>
        </div>

        <SlaMonitoringSection />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit border-hairline shadow-sm lg:sticky lg:top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-body-base">Campaigns</CardTitle>
              <CardDescription>Select a run to inspect.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto">
              {campaignsQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-ink-subtle" />
                </div>
              ) : campaigns.length === 0 ? (
                <p className="py-6 text-center text-body-sm text-ink-subtle">No campaigns yet.</p>
              ) : (
                campaigns.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedCampaignId(item.id)}
                    className={cn(
                      'w-full rounded-md border p-3 text-left transition-colors',
                      selectedCampaignId === item.id
                        ? 'border-primary bg-primary/5'
                        : 'border-hairline bg-surface hover:bg-surface-1',
                    )}
                  >
                    <div className="truncate text-body-sm font-semibold text-ink">
                      {item.job_title}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Badge className={cn('border text-[10px]', statusClass(item.status))}>
                        {item.status.replaceAll('_', ' ')}
                      </Badge>
                      <span className="font-mono text-[10px] text-ink-subtle">
                        {item.id.slice(0, 8)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-5">
            {!selectedCampaignId ? (
              <Card className="border-hairline shadow-sm">
                <CardContent className="py-16 text-center text-body-sm text-ink-subtle">
                  Select a campaign to view monitoring data.
                </CardContent>
              </Card>
            ) : campaignQuery.isLoading || !campaign ? (
              <Card className="border-hairline shadow-sm">
                <CardContent className="flex justify-center py-16">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-hairline shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-body-lg">{campaign.job_title}</CardTitle>
                        <CardDescription className="mt-1">
                          Campaign {campaign.id.slice(0, 8)}
                        </CardDescription>
                      </div>
                      <Badge className={cn('border capitalize', statusClass(campaign.status))}>
                        {campaign.status.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="mb-2 flex justify-between text-body-sm">
                        <span className="text-ink-subtle">Screening progress</span>
                        <span className="font-semibold text-ink">{progress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-md border border-hairline p-3">
                        <Users className="mb-2 size-4 text-primary" />
                        <div className="text-body-lg font-semibold">
                          {campaign.total_candidates}
                        </div>
                        <div className="text-xs text-ink-subtle">Candidates</div>
                      </div>
                      <div className="rounded-md border border-hairline p-3">
                        <CheckCircle className="mb-2 size-4 text-emerald-600" />
                        <div className="text-body-lg font-semibold">
                          {campaign.shortlisted_count}
                        </div>
                        <div className="text-xs text-ink-subtle">Shortlisted</div>
                      </div>
                      <div className="rounded-md border border-hairline p-3">
                        <Activity className="mb-2 size-4 text-blue-600" />
                        <div className="text-body-lg font-semibold">{campaign.drafted_count}</div>
                        <div className="text-xs text-ink-subtle">Drafted</div>
                      </div>
                      <div className="rounded-md border border-hairline p-3">
                        <AlertTriangle className="mb-2 size-4 text-rose-600" />
                        <div className="text-body-lg font-semibold">{campaign.failed_count}</div>
                        <div className="text-xs text-ink-subtle">Failed</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <CampaignKPIDashboard campaignId={campaign.id} />

                {unresolvedWarnings.length > 0 && (
                  <Card className="border-amber-300 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-body-base text-amber-800">
                        <AlertTriangle className="size-4" />
                        Data quality warnings
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-body-sm text-amber-900">
                        {unresolvedWarnings.map((warning: { id: string; message: string }) => (
                          <li key={warning.id} className="rounded-md bg-amber-50 p-2">
                            {warning.message}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-hairline shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-body-base">Candidate status</CardTitle>
                    <CardDescription>
                      {campaignCandidates.length} candidates in this campaign.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="divide-y divide-hairline rounded-md border border-hairline p-0">
                    {campaignCandidates.map(
                      ({
                        campaignCandidate,
                        candidate,
                      }: {
                        campaignCandidate: {
                          candidate_id: string;
                          status: string;
                          fit_score: number | null;
                          error_reason: string | null;
                        };
                        candidate: { display_name: string; email: string } | null;
                      }) => (
                        <div
                          key={campaignCandidate.candidate_id}
                          className="flex items-center justify-between gap-3 p-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-body-sm font-medium text-ink">
                              {candidate?.display_name ?? campaignCandidate.candidate_id}
                            </div>
                            <div className="truncate text-xs text-ink-subtle">
                              {campaignCandidate.error_reason ?? candidate?.email ?? 'No details'}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {campaignCandidate.fit_score != null && (
                              <span className="text-xs font-semibold">
                                {campaignCandidate.fit_score}%
                              </span>
                            )}
                            <Badge variant="secondary">
                              {campaignCandidate.status.replaceAll('_', ' ')}
                            </Badge>
                          </div>
                        </div>
                      ),
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </PageChrome>
  );
}

export default SmartrecruitMonitoringPage;
