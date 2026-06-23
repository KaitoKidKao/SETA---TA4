// biome-ignore-all lint/a11y/noStaticElementInteractions: ignore static interactions
// biome-ignore-all lint/a11y/useKeyWithClickEvents: ignore keyboard events
// biome-ignore-all lint/correctness/useExhaustiveDependencies: ignore exhaustive deps
// biome-ignore-all lint/a11y/useButtonType: ignore button type
/* eslint-disable react-hooks/set-state-in-effect */
import { Button, toast } from '@seta/shared-ui';
import { Copy, Download, FileText, Loader2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface HMReportModalProps {
  campaignId: string;
  onClose: () => void;
}

interface ReportItem {
  id: string;
  version: number;
  markdown: string;
  recruiter_note: string | null;
  created_at: string;
}

export function HMReportModal({ campaignId, onClose }: HMReportModalProps) {
  const [recruiterNote, setRecruiterNote] = useState('');
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');

  const fetchReportsList = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch(`/api/smartrecruit/v1/campaigns/${campaignId}/reports`);
      if (res.ok) {
        const data = await res.json();
        const list = data.reports ?? [];
        setReports(list);
        if (list.length > 0) {
          setSelectedReport(list[0]);
        }
      }
    } catch {
      toast.error('Could not load report list');
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchReportsList();
  }, [campaignId]);

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/smartrecruit/v1/campaigns/${campaignId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruiterNote }),
      });
      if (res.ok) {
        toast.success('Shortlist report generated successfully!');
        setRecruiterNote('');
        await fetchReportsList();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Error exporting');
      }
    } catch (err) {
      toast.error(`Report export failed: ${(err as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Markdown report copied to clipboard!');
  };

  const handleDownloadReport = (report: ReportItem) => {
    const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `shortlist-report-v${report.version}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Markdown report downloaded');
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-neutral-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-800">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold">
              Export and Manage Shortlist Reports (Hiring Manager)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 focus:outline-none text-xl p-1"
          >
            &times;
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
          {/* Left panel: Generate & History */}
          <div className="md:col-span-4 flex flex-col gap-4">
            {/* Generate Report Form */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
              <h4 className="text-xs font-bold text-neutral-700 mb-2 uppercase tracking-wide">
                Create New Report
              </h4>
              <textarea
                value={recruiterNote}
                onChange={(e) => setRecruiterNote(e.target.value)}
                placeholder="Optional recruiter note for the Hiring Manager..."
                className="w-full h-24 p-2 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2 resize-none"
              />
              <Button
                onClick={handleGenerateReport}
                disabled={isGenerating}
                className="w-full text-xs h-9 flex items-center justify-center gap-1.5"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Export Report (Markdown)
                  </>
                )}
              </Button>
            </div>

            {/* Reports Version History */}
            <div className="flex-1 flex flex-col">
              <h4 className="text-xs font-bold text-neutral-700 mb-2 uppercase tracking-wide">
                Report History
              </h4>
              {isLoadingList && reports.length === 0 ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : reports.length === 0 ? (
                <div className="text-center py-6 text-xs text-neutral-400 italic">
                  No reports have been exported yet.
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1">
                  {reports.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedReport(r)}
                      className={`p-2.5 rounded border text-xs cursor-pointer transition ${
                        selectedReport?.id === r.id
                          ? 'border-blue-500 bg-blue-50/30'
                          : 'border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex justify-between font-semibold text-neutral-700 mb-1">
                        <span>Version v{r.version}</span>
                        <span className="text-[10px] text-neutral-400 font-normal">
                          {new Date(r.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 line-clamp-1 italic">
                        {r.recruiter_note || 'No note.'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel: View selected report */}
          <div className="md:col-span-8 flex flex-col min-h-0 border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50">
            {selectedReport ? (
              <>
                <div className="px-4 py-2 border-b border-neutral-200 bg-white flex justify-between items-center text-xs gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-neutral-700">
                      Version v{selectedReport.version}
                    </span>
                    <div className="flex items-center gap-1 bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
                      <button
                        onClick={() => setViewMode('preview')}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                          viewMode === 'preview'
                            ? 'bg-white text-neutral-800 shadow-sm border border-neutral-200/50'
                            : 'text-neutral-500 hover:text-neutral-700 border border-transparent'
                        }`}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => setViewMode('raw')}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer ${
                          viewMode === 'raw'
                            ? 'bg-white text-neutral-800 shadow-sm border border-neutral-200/50'
                            : 'text-neutral-500 hover:text-neutral-700 border border-transparent'
                        }`}
                      >
                        Source
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2 flex items-center gap-1 text-[11px]"
                      onClick={() => handleCopyToClipboard(selectedReport.markdown)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Markdown
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2 flex items-center gap-1 text-[11px]"
                      onClick={() => handleDownloadReport(selectedReport)}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download .md
                    </Button>
                  </div>
                </div>
                {viewMode === 'preview' ? (
                  <div className="flex-1 p-6 bg-white overflow-y-auto border-t border-neutral-100 selection:bg-blue-100 prose prose-neutral max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ node: _node, ...props }) => (
                          <h1
                            className="text-lg font-bold text-neutral-900 mb-4 border-b border-neutral-200 pb-2 flex items-center gap-2"
                            {...props}
                          />
                        ),
                        h2: ({ node: _node, ...props }) => (
                          <h2
                            className="text-xs font-bold uppercase tracking-wider text-neutral-500 mt-6 mb-3 border-b border-neutral-200 pb-1"
                            {...props}
                          />
                        ),
                        h3: ({ node: _node, ...props }) => (
                          <h3
                            className="text-xs font-bold text-neutral-800 mt-5 mb-2.5 bg-neutral-50 px-3 py-1.5 rounded-lg border border-neutral-200/60 flex justify-between items-center"
                            {...props}
                          />
                        ),
                        p: ({ node: _node, ...props }) => (
                          <p className="text-xs text-neutral-600 mb-3 leading-relaxed" {...props} />
                        ),
                        ul: ({ node: _node, ...props }) => (
                          <ul
                            className="list-disc pl-5 mb-4 text-xs text-neutral-600 space-y-1.5"
                            {...props}
                          />
                        ),
                        ol: ({ node: _node, ...props }) => (
                          <ol
                            className="list-decimal pl-5 mb-4 text-xs text-neutral-600 space-y-1.5"
                            {...props}
                          />
                        ),
                        blockquote: ({ node: _node, ...props }) => (
                          <blockquote
                            className="border-l-4 border-blue-500 pl-4 py-2.5 italic text-neutral-700 bg-blue-50/30 rounded-r my-4 text-xs leading-relaxed"
                            {...props}
                          />
                        ),
                        hr: ({ node: _node, ...props }) => (
                          <hr className="border-neutral-200 my-4" {...props} />
                        ),
                        code: ({ node: _node, children, ...props }) => (
                          <code
                            className="bg-neutral-100 px-1 py-0.5 rounded text-[11px] font-mono text-neutral-800"
                            {...props}
                          >
                            {children}
                          </code>
                        ),
                        strong: ({ node: _node, ...props }) => (
                          <strong className="font-semibold text-neutral-900" {...props} />
                        ),
                      }}
                    >
                      {selectedReport.markdown}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex-1 p-4 bg-white overflow-y-auto font-mono text-xs whitespace-pre-wrap text-neutral-800 leading-relaxed border-t border-neutral-100 selection:bg-blue-100">
                    {selectedReport.markdown}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 p-8">
                <FileText className="w-12 h-12 text-neutral-300 mb-2" />
                <p className="text-xs italic">
                  Select a report version or generate a new one to preview it.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 rounded-b-xl flex justify-end">
          <Button variant="secondary" onClick={onClose} className="text-xs h-9">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
