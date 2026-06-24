import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Input,
  toast,
} from '@seta/shared-ui';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  useApproveSlaReminder,
  useImportSlaTracker,
  useRetrySlaReminder,
  useSlaTracker,
  useUpdateSlaContact,
} from '..';

type SlaState = 'on_track' | 'due_soon' | 'overdue' | 'submitted' | 'data_error';
type SlaFilter = 'all' | SlaState;

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
  feedbackStatus: string;
  hmDecision: string | null;
  hmFeedbackText: string | null;
  reminderAvailable: boolean;
  reminderStage: 'due_soon' | 'overdue' | null;
  latestReminder: {
    id: string;
    stage: 'due_soon' | 'overdue';
    status: string;
    failureCode: string | null;
  } | null;
}

const FILTERS: Array<{ id: SlaFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'due_soon', label: 'Due soon' },
  { id: 'on_track', label: 'On track' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'data_error', label: 'Data issues' },
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function stateClass(state: SlaState): string {
  if (state === 'overdue') return 'border-rose-300 bg-rose-50 text-rose-700';
  if (state === 'due_soon') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (state === 'submitted') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  if (state === 'data_error') return 'border-rose-300 bg-rose-50 text-rose-700';
  return 'border-blue-300 bg-blue-50 text-blue-700';
}

export function SlaMonitoringSection() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<SlaFilter>('all');
  const [pendingReminderId, setPendingReminderId] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const trackerQuery = useSlaTracker(
    { search: debouncedSearch || undefined },
    { refetchInterval: 10_000 },
  );
  const importMutation = useImportSlaTracker();
  const approveMutation = useApproveSlaReminder();
  const retryMutation = useRetrySlaReminder();
  const updateContactMutation = useUpdateSlaContact();
  const tracker = (trackerQuery.data?.tracker ?? []) as SlaTrackerItem[];

  const counts = useMemo(() => {
    const result: Record<SlaFilter, number> = {
      all: tracker.length,
      overdue: 0,
      due_soon: 0,
      on_track: 0,
      submitted: 0,
      data_error: 0,
    };
    for (const item of tracker) result[item.slaState]++;
    return result;
  }, [tracker]);

  const filteredTracker = useMemo(
    () => (filter === 'all' ? tracker : tracker.filter((item) => item.slaState === filter)),
    [filter, tracker],
  );

  const importDataset = async () => {
    try {
      const result = await importMutation.mutateAsync(undefined);
      toast.success('HM feedback dataset imported.', {
        description: `${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.invalid?.length ?? 0} invalid rows.`,
      });
    } catch (error) {
      toast.error('Could not import HM feedback dataset.', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const sendReminder = async (item: SlaTrackerItem) => {
    setPendingReminderId(item.id);
    try {
      await approveMutation.mutateAsync(item.id);
      toast.success('Reminder queued.', {
        description: `Feedback reminder for ${item.candidateName} was queued for delivery.`,
      });
    } catch (error) {
      toast.error('Could not queue reminder.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingReminderId(null);
    }
  };

  const retryReminder = async (item: SlaTrackerItem) => {
    if (!item.latestReminder) return;
    setPendingReminderId(item.id);
    try {
      await retryMutation.mutateAsync(item.latestReminder.id);
      toast.success('Reminder queued for retry.');
    } catch (error) {
      toast.error('Could not retry reminder.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingReminderId(null);
    }
  };

  const saveHmEmail = async (item: SlaTrackerItem) => {
    const hiringManagerEmail = emailDrafts[item.id]?.trim() ?? '';
    if (!hiringManagerEmail) {
      toast.error('Enter a valid Hiring Manager email address.');
      return;
    }
    setPendingReminderId(item.id);
    try {
      await updateContactMutation.mutateAsync({
        feedbackRequestId: item.id,
        hiringManagerEmail,
      });
      toast.success('Hiring Manager email saved.');
      setEmailDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (error) {
      toast.error('Could not save Hiring Manager email.', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingReminderId(null);
    }
  };

  return (
    <Card className="border-hairline shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-body-lg">
              <Mail className="size-5 text-rose-600" />
              HM Feedback SLA Tracker (DS08)
            </CardTitle>
            <CardDescription className="mt-1">
              Monitor hiring manager feedback against the 48-hour SLA and send reminders.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={trackerQuery.isFetching}
              onClick={() => trackerQuery.refetch()}
            >
              <RefreshCw className={cn('mr-2 size-4', trackerQuery.isFetching && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={importMutation.isPending}
              onClick={importDataset}
            >
              {importMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              Import DS08
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search candidate, hiring manager, or position..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="SLA status filter">
          {FILTERS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={filter === item.id ? 'default' : 'secondary'}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="ml-2 text-xs opacity-75">{counts[item.id]}</span>
            </Button>
          ))}
        </div>

        {trackerQuery.isError ? (
          <div className="flex items-start gap-3 rounded-md border border-rose-300 bg-rose-50 p-4 text-body-sm text-rose-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-semibold">Could not load SLA tracker</div>
              <div className="mt-1">{trackerQuery.error.message}</div>
            </div>
          </div>
        ) : trackerQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : filteredTracker.length === 0 ? (
          <div className="rounded-md border border-dashed border-hairline px-4 py-10 text-center">
            <Mail className="mx-auto size-6 text-ink-subtle" />
            <div className="mt-3 text-body-sm font-semibold text-ink">
              {tracker.length === 0 ? 'No HM feedback records yet' : 'No records match this view'}
            </div>
            <p className="mt-1 text-xs text-ink-subtle">
              {tracker.length === 0
                ? 'Import DS08 to initialize SLA monitoring.'
                : 'Change the status filter or search query.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[520px] divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
            {filteredTracker.map((item) => {
              const reminderStatus = item.latestReminder?.status;
              const hasHmEmail = Boolean(item.hiringManagerEmail);
              const canSend = hasHmEmail && (item.reminderAvailable || reminderStatus === 'draft');
              const canRetry = hasHmEmail && reminderStatus === 'failed';
              const isPending = pendingReminderId === item.id;

              return (
                <div key={item.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{item.candidateName}</span>
                      <Badge className={cn('border capitalize', stateClass(item.slaState))}>
                        {item.slaState.replaceAll('_', ' ')}
                      </Badge>
                      {reminderStatus && (
                        <Badge variant="secondary" className="capitalize">
                          Reminder {reminderStatus.replaceAll('_', ' ')}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-body-sm text-ink-subtle">{item.position}</div>
                    <div className="mt-3 grid gap-2 text-xs text-ink-subtle sm:grid-cols-3">
                      <span>HM: {item.hiringManager}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" /> {formatDate(item.shortlistedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" /> Due {formatDate(item.feedbackDueAt)}
                      </span>
                    </div>
                    {item.hmFeedbackText && (
                      <div className="mt-3 rounded-sm border-l-2 border-primary/40 bg-surface-1 px-3 py-2 text-xs italic text-ink-subtle">
                        {item.hmFeedbackText}
                      </div>
                    )}
                    {item.latestReminder?.failureCode && (
                      <div className="mt-2 text-xs text-rose-700">
                        Reminder failure: {item.latestReminder.failureCode}
                      </div>
                    )}
                    {!hasHmEmail && item.slaState !== 'submitted' && (
                      <div className="mt-3 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor={`hm-email-${item.id}`}
                            className="text-xs font-semibold text-amber-900"
                          >
                            Hiring Manager email required
                          </label>
                          <Input
                            id={`hm-email-${item.id}`}
                            type="email"
                            value={emailDrafts[item.id] ?? ''}
                            onChange={(event) =>
                              setEmailDrafts((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="hiring.manager@company.com"
                            className="mt-1 bg-surface"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onClick={() => saveHmEmail(item)}
                        >
                          {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                          Save email
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end">
                    {item.slaState === 'submitted' ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle className="size-4" /> Feedback received
                      </span>
                    ) : !hasHmEmail ? (
                      <span className="text-xs font-medium text-amber-700">Email required</span>
                    ) : canRetry ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => retryReminder(item)}
                      >
                        {isPending ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 size-4" />
                        )}
                        Retry reminder
                      </Button>
                    ) : canSend ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={isPending}
                        onClick={() => sendReminder(item)}
                      >
                        {isPending ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Bell className="mr-2 size-4" />
                        )}
                        Send reminder
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
