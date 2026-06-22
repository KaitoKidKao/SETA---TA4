// biome-ignore-all lint/a11y/noStaticElementInteractions: ignore static interactions
// biome-ignore-all lint/a11y/useKeyWithClickEvents: ignore keyboard events
// biome-ignore-all lint/correctness/useExhaustiveDependencies: ignore exhaustive deps
// biome-ignore-all lint/a11y/useButtonType: ignore button type
import { Button, toast } from '@seta/shared-ui';
import { Copy, Download, FileText, Loader2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    } catch (_err) {
      toast.error('Không thể lấy danh sách báo cáo');
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
        toast.success('Đã xuất báo cáo Shortlist mới thành công!');
        setRecruiterNote('');
        await fetchReportsList();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Error exporting');
      }
    } catch (err) {
      toast.error(`Xuất báo cáo thất bại: ${(err as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Đã sao chép báo cáo Markdown vào bộ nhớ tạm!');
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
    toast.success('Đã tải xuống file báo cáo (.md)');
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-neutral-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-800">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold">
              Xuất & Quản lý Báo cáo Shortlist (Hiring Manager)
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
                Tạo Báo cáo mới
              </h4>
              <textarea
                value={recruiterNote}
                onChange={(e) => setRecruiterNote(e.target.value)}
                placeholder="Nhập ghi chú hoặc đánh giá chung của Recruiter dành cho Hiring Manager..."
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
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Xuất Báo cáo (Markdown)
                  </>
                )}
              </Button>
            </div>

            {/* Reports Version History */}
            <div className="flex-1 flex flex-col">
              <h4 className="text-xs font-bold text-neutral-700 mb-2 uppercase tracking-wide">
                Lịch sử Báo cáo
              </h4>
              {isLoadingList && reports.length === 0 ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : reports.length === 0 ? (
                <div className="text-center py-6 text-xs text-neutral-400 italic">
                  Chưa có báo cáo nào được xuất.
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
                        <span>Bản v{r.version}</span>
                        <span className="text-[10px] text-neutral-400 font-normal">
                          {new Date(r.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-500 line-clamp-1 italic">
                        {r.recruiter_note || 'Không có ghi chú.'}
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
                <div className="px-4 py-2 border-b border-neutral-200 bg-white flex justify-between items-center text-xs">
                  <span className="font-semibold text-neutral-600">
                    Đang xem: Phiên bản v{selectedReport.version}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2 flex items-center gap-1 text-[11px]"
                      onClick={() => handleCopyToClipboard(selectedReport.markdown)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Sao chép Markdown
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2 flex items-center gap-1 text-[11px]"
                      onClick={() => handleDownloadReport(selectedReport)}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Tải file .md
                    </Button>
                  </div>
                </div>
                <div className="flex-1 p-4 bg-white overflow-y-auto font-mono text-xs whitespace-pre-wrap text-neutral-800 leading-relaxed border-t border-neutral-100 selection:bg-blue-100">
                  {selectedReport.markdown}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 p-8">
                <FileText className="w-12 h-12 text-neutral-300 mb-2" />
                <p className="text-xs italic">
                  Chọn một phiên bản báo cáo hoặc tạo mới để xem nội dung.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 rounded-b-xl flex justify-end">
          <Button variant="secondary" onClick={onClose} className="text-xs h-9">
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
