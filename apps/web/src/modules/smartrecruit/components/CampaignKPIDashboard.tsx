// biome-ignore-all lint/a11y/noLabelWithoutControl: ignore form labels association
// biome-ignore-all lint/correctness/useExhaustiveDependencies: ignore hook dependency warnings
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
    } catch (_err) {
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
    <Card className="mb-6 shadow-sm border border-neutral-200">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-base font-bold">Campaign Performance KPIs</CardTitle>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-2 flex items-center gap-1.5 text-xs"
          onClick={() => setShowConfig(!showConfig)}
        >
          <Settings className="w-3.5 h-3.5" />
          {showConfig ? 'Close settings' : 'Token pricing'}
        </Button>
      </CardHeader>
      <CardContent>
        {showConfig && (
          <div className="mb-4 p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-3">
            <h4 className="font-semibold text-neutral-700">
              API token pricing ($ per 1 million tokens):
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-500 mb-1 font-medium">
                  Input Tokens (Prompt)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={inputPrice}
                  onChange={(e) => setInputPrice(Number(e.target.value))}
                  className="w-full px-2.5 py-1 border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-1 font-medium">
                  Output Tokens (Completion)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={outputPrice}
                  onChange={(e) => setOutputPrice(Number(e.target.value))}
                  className="w-full px-2.5 py-1 border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {isLoading && !kpis ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-md text-blue-600">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-xs text-neutral-500 font-medium">Time-to-Screen</span>
                <span className="text-sm font-bold text-neutral-800">
                  {kpis ? formatDuration(kpis.timeToScreenSec) : 'N/A'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 flex items-start gap-3">
              <div className="p-2 bg-emerald-100 rounded-md text-emerald-600">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-xs text-neutral-500 font-medium">Shortlist rate</span>
                <span className="text-sm font-bold text-neutral-800">
                  {kpis ? `${kpis.shortlistRate}%` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-100 flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-md text-purple-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-xs text-neutral-500 font-medium">
                  Estimated API cost
                </span>
                <span className="text-sm font-bold text-neutral-800">
                  {kpis ? `$${kpis.estimatedCostUsd.toFixed(4)}` : 'N/A'}
                </span>
                <span className="block text-[10px] text-neutral-400">
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
