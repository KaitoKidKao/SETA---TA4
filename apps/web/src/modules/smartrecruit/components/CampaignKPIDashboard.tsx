// biome-ignore-all lint/a11y/noLabelWithoutControl: ignore form labels association
// biome-ignore-all lint/correctness/useExhaustiveDependencies: ignore hook dependency warnings
/* eslint-disable react-hooks/set-state-in-effect */
import { Button, Card, CardContent, CardHeader, CardTitle, toast } from '@seta/shared-ui';
import { Clock, DollarSign, Loader2, Settings, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

interface CampaignKPIDashboardProps {
  campaignId: string;
}

interface KPIState {
  timeToScreenSec: number | null;
  shortlistRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export function CampaignKPIDashboard({ campaignId }: CampaignKPIDashboardProps) {
  const [kpis, setKpis] = useState<KPIState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Pricing inputs (default to GPT-4o-mini rates: $0.15 input, $0.60 output per 1M tokens)
  const [inputPrice, setInputPrice] = useState<number>(0.15);
  const [outputPrice, setOutputPrice] = useState<number>(0.6);

  const fetchKPIs = async () => {
    setIsLoading(true);
    try {
      const query = `inputPrice=${inputPrice}&outputPrice=${outputPrice}`;
      const res = await fetch(`/api/smartrecruit/v1/campaigns/${campaignId}/kpis?${query}`);
      if (res.ok) {
        const data = await res.json();
        setKpis(data);
      }
    } catch {
      toast.error('Could not load campaign KPI data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKPIs();
  }, [campaignId, inputPrice, outputPrice]);

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return 'N/A';
    if (seconds < 60) return `${seconds} seconds`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} minutes ${secs} seconds`;
  };

  return (
    <Card className="border-hairline shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-body-base font-semibold">Performance</CardTitle>
          <p className="mt-1 text-xs text-ink-subtle">Operational speed and AI usage.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 flex items-center gap-1.5 text-xs text-ink-subtle"
          onClick={() => setShowConfig(!showConfig)}
        >
          <Settings className="w-3.5 h-3.5" />
          {showConfig ? 'Close' : 'Pricing'}
        </Button>
      </CardHeader>
      <CardContent>
        {showConfig && (
          <div className="mb-4 space-y-3 rounded-md border border-hairline bg-surface-1 p-3 text-xs">
            <h4 className="font-semibold text-ink">API token pricing ($ per 1 million tokens):</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block font-medium text-ink-subtle">
                  Input Tokens (Prompt)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={inputPrice}
                  onChange={(e) => setInputPrice(Number(e.target.value))}
                  className="w-full rounded border border-hairline bg-surface px-2.5 py-1 text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1 block font-medium text-ink-subtle">
                  Output Tokens (Completion)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={outputPrice}
                  onChange={(e) => setOutputPrice(Number(e.target.value))}
                  className="w-full rounded border border-hairline bg-surface px-2.5 py-1 text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        )}

        {isLoading && !kpis ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-ink-subtle" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="flex items-start gap-3 rounded-md border border-hairline p-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-xs font-medium text-ink-subtle">Time-to-Screen</span>
                <span className="text-body-sm font-semibold text-ink">
                  {kpis ? formatDuration(kpis.timeToScreenSec) : 'N/A'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border border-hairline p-3">
              <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-600">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-xs font-medium text-ink-subtle">Shortlist rate</span>
                <span className="text-body-sm font-semibold text-ink">
                  {kpis ? `${kpis.shortlistRate}%` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border border-hairline p-3">
              <div className="rounded-md bg-surface-2 p-2 text-ink-subtle">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-xs font-medium text-ink-subtle">
                  Estimated API cost
                </span>
                <span className="text-body-sm font-semibold text-ink">
                  {kpis ? `$${kpis.estimatedCostUsd.toFixed(4)}` : 'N/A'}
                </span>
                <span className="block text-[10px] text-ink-subtle">
                  {kpis ? `${kpis.totalInputTokens + kpis.totalOutputTokens} tokens` : ''}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
