// biome-ignore-all lint/suspicious/noArrayIndexKey: ignore array index key
// biome-ignore-all lint/suspicious/noExplicitAny: ignore explicit any
// biome-ignore-all lint/a11y/noLabelWithoutControl: ignore form labels association
import { Badge, Button, Input, toast } from '@seta/shared-ui';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Check,
  Loader2,
  Sparkles,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface MatchItem {
  jdSkill: string;
  cvSkill: string | null;
  matched: boolean;
  justification: string;
  evidenceSnippet?: string | null;
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
    mustHaveMatches: MatchItem[];
    niceToHaveMatches: MatchItem[];
    scoreBreakdown?: {
      mustHaveSkills: number;
      yoe: number;
      english: number;
      niceToHave: number;
    };
    flags?: string[];
  } | null;
}

interface CandidateScorecardProps {
  selectedCandidate: CandidateState;
  campaignId: string;
  onReviewSaved: () => Promise<void>;
}

export function CandidateScorecard({
  selectedCandidate,
  campaignId,
  onReviewSaved,
}: CandidateScorecardProps) {
  const [reviewScore, setReviewScore] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setReviewScore(
      String(
        selectedCandidate.reviewed_fit_score ??
          selectedCandidate.effective_fit_score ??
          selectedCandidate.fit_score ??
          '',
      ),
    );
    setReviewReason(selectedCandidate.review_reason ?? '');
    setErrorMsg(null);
  }, [selectedCandidate]);

  const handleSaveReview = async () => {
    const fitScore = Number(reviewScore);
    if (!Number.isInteger(fitScore) || fitScore < 0 || fitScore > 100) {
      setErrorMsg('Điểm đánh giá phải là số nguyên từ 0 đến 100.');
      return;
    }
    if (!reviewReason.trim()) {
      setErrorMsg('Lý do ghi đè điểm số là bắt buộc.');
      return;
    }
    if (reviewReason.trim().length < 5) {
      setErrorMsg('Lý do ghi đè phải có ít nhất 5 ký tự.');
      return;
    }

    setIsSavingReview(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/smartrecruit/v1/campaigns/${campaignId}/candidates/${selectedCandidate.id}/review`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fitScore, reason: reviewReason.trim() }),
        },
      );
      const text = await res.text();
      let data: any = {};
      if (text.trim()) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(text.slice(0, 300));
        }
      }
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Không thể lưu đánh giá của recruiter.');
      }
      toast.success('Đã lưu điểm số điều chỉnh thành công!');
      await onReviewSaved();
    } catch (err) {
      setErrorMsg((err as Error).message);
      toast.error('Lỗi khi lưu điểm điều chỉnh');
    } finally {
      setIsSavingReview(false);
    }
  };

  const getScoreBreakdown = () => {
    return (
      selectedCandidate.screening_report?.scoreBreakdown ?? {
        mustHaveSkills: 0,
        yoe: 0,
        english: 0,
        niceToHave: 0,
      }
    );
  };

  const hasFlags = selectedCandidate.screening_report?.flags?.includes('EVIDENCE_MISSING');
  const report = selectedCandidate.screening_report;
  const pros = report?.pros ?? [];
  const gaps = report?.gaps ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Visual Score breakdown & Override Form */}
      <div className="bg-neutral-50/50 p-5 rounded-xl border border-neutral-200 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h4 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-600" />
            Bảng điểm Chi tiết Phân tích CV (AI Scorecard)
          </h4>
          {selectedCandidate.reviewed_fit_score !== null && (
            <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-600" />
              Đã điều chỉnh bởi Recruiter
            </Badge>
          )}
        </div>

        {/* Breakdown counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-xs">
            <span className="block text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
              Kỹ năng bắt buộc
            </span>
            <span className="text-lg font-extrabold text-neutral-800">
              {getScoreBreakdown().mustHaveSkills}%
            </span>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-xs">
            <span className="block text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
              Kinh nghiệm (YOE)
            </span>
            <span className="text-lg font-extrabold text-neutral-800">
              {getScoreBreakdown().yoe}%
            </span>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-xs">
            <span className="block text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
              Trình độ Tiếng Anh
            </span>
            <span className="text-lg font-extrabold text-neutral-800">
              {getScoreBreakdown().english}%
            </span>
          </div>
          <div className="bg-white rounded-lg border border-neutral-200 p-3 shadow-xs">
            <span className="block text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
              Kỹ năng mong muốn
            </span>
            <span className="text-lg font-extrabold text-neutral-800">
              {getScoreBreakdown().niceToHave}%
            </span>
          </div>
        </div>

        {/* Evidence warning */}
        {hasFlags && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex items-start gap-2 text-xs text-amber-800 leading-normal">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Cần rà soát hồ sơ:</span> Phát hiện kỹ năng ứng viên
              khai báo nhưng không tìm thấy minh chứng (evidence) rõ ràng trong văn bản CV gốc.
            </div>
          </div>
        )}

        {/* Override Form */}
        <div className="border-t border-neutral-100 pt-4 flex flex-col gap-3">
          <h5 className="text-xs font-bold text-neutral-700 uppercase tracking-wide">
            Điều chỉnh Điểm đánh giá (Score Override)
          </h5>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3 flex flex-col gap-1">
              <label className="text-xs font-semibold text-neutral-600">
                Điểm mới (0-100) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                value={reviewScore}
                onChange={(e) => setReviewScore(e.target.value)}
                className="h-9 text-xs border-neutral-300"
              />
            </div>
            <div className="md:col-span-6 flex flex-col gap-1">
              <label className="text-xs font-semibold text-neutral-600">
                Lý do điều chỉnh <span className="text-red-500">*</span>
              </label>
              <Input
                value={reviewReason}
                placeholder="Nhập lý do bắt buộc để phục vụ audit log..."
                onChange={(e) => setReviewReason(e.target.value)}
                className="h-9 text-xs border-neutral-300"
              />
            </div>
            <div className="md:col-span-3">
              <Button
                type="button"
                onClick={handleSaveReview}
                disabled={isSavingReview}
                className="w-full h-9 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {isSavingReview ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  'Lưu Thay đổi'
                )}
              </Button>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded-lg mt-1">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* Skills Match Matrix with Evidence Snippets */}
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
          <ThumbsUp className="w-4 h-4 text-blue-600" />
          Ma trận đối khớp kỹ năng (Skills Alignment Matrix)
        </h4>

        <div className="space-y-3">
          {/* Must Have Skills */}
          {report?.mustHaveMatches && report.mustHaveMatches.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-bold text-red-600/90 uppercase tracking-wider bg-red-50 w-fit px-2 py-0.5 rounded">
                Yêu cầu Bắt buộc (Must-Have)
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {report.mustHaveMatches.map((match, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-lg border border-neutral-200 text-xs shadow-xs flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-50 pb-1.5">
                      <span className="font-semibold text-neutral-800">{match.jdSkill}</span>
                      <Badge
                        className={
                          match.matched
                            ? 'bg-emerald-500 text-white font-bold'
                            : 'bg-red-500 text-white font-bold'
                        }
                      >
                        {match.matched ? 'Matched' : 'Missing'}
                      </Badge>
                    </div>
                    {match.cvSkill && (
                      <div className="text-[11px] text-neutral-500">
                        Từ khóa trong CV:{' '}
                        <strong className="text-neutral-700">{match.cvSkill}</strong>
                      </div>
                    )}
                    <p className="text-[11px] text-neutral-600 italic bg-neutral-50/50 p-2 rounded border-l-2 border-neutral-300">
                      {match.evidenceSnippet ||
                        match.justification ||
                        'Không tìm thấy thông tin/minh chứng trong CV.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nice Have Skills */}
          {report?.niceToHaveMatches && report.niceToHaveMatches.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              <div className="text-[11px] font-bold text-blue-600/90 uppercase tracking-wider bg-blue-50 w-fit px-2 py-0.5 rounded">
                Yêu cầu Mong muốn (Nice-to-Have)
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {report.niceToHaveMatches.map((match, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-lg border border-neutral-200 text-xs shadow-xs flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-50 pb-1.5">
                      <span className="font-semibold text-neutral-800">{match.jdSkill}</span>
                      <Badge
                        className={
                          match.matched
                            ? 'bg-emerald-500 text-white font-bold'
                            : 'bg-red-500 text-white font-bold'
                        }
                      >
                        {match.matched ? 'Matched' : 'Missing'}
                      </Badge>
                    </div>
                    {match.cvSkill && (
                      <div className="text-[11px] text-neutral-500">
                        Từ khóa trong CV:{' '}
                        <strong className="text-neutral-700">{match.cvSkill}</strong>
                      </div>
                    )}
                    <p className="text-[11px] text-neutral-600 italic bg-neutral-50/50 p-2 rounded border-l-2 border-neutral-300">
                      {match.evidenceSnippet ||
                        match.justification ||
                        'Không tìm thấy thông tin/minh chứng trong CV.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pros & Gaps summary columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 bg-emerald-50/20 border border-emerald-100 rounded-xl p-4">
          <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <Check className="w-4 h-4 text-emerald-500" />
            Ưu điểm / Điểm mạnh (Pros)
          </span>
          <ul className="flex flex-col gap-1.5 mt-1">
            {pros.length === 0 ? (
              <li className="text-xs text-neutral-400 italic">
                Không có điểm mạnh cụ thể được ghi nhận.
              </li>
            ) : (
              pros.map((pro, idx) => (
                <li key={idx} className="text-xs text-neutral-700 flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 mt-0.5">•</span>
                  <span>{pro}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-col gap-2 bg-red-50/20 border border-red-100 rounded-xl p-4">
          <span className="text-xs font-bold text-red-800 uppercase tracking-wider flex items-center gap-1">
            <XCircle className="w-4 h-4 text-red-500" />
            Khoảng trống Kỹ năng (Gaps)
          </span>
          <ul className="flex flex-col gap-1.5 mt-1">
            {gaps.length === 0 ? (
              <li className="text-xs text-neutral-400 italic">
                Không có khoảng trống kỹ năng được ghi nhận.
              </li>
            ) : (
              gaps.map((gap, idx) => (
                <li key={idx} className="text-xs text-neutral-700 flex items-start gap-1.5">
                  <span className="text-red-500 shrink-0 mt-0.5">•</span>
                  <span>{gap}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Experience Calculation */}
      <div className="border-t border-neutral-200 pt-3 flex flex-col gap-1">
        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
          Phân tích Số năm Kinh nghiệm (YOE Details)
        </span>
        <p className="text-xs text-neutral-700 italic font-medium leading-relaxed mt-1">
          {report?.yoeExplanation || 'Không có chi tiết tính toán số năm kinh nghiệm.'}
        </p>
      </div>

      {/* PII Decryption if available */}
      {report?.piiMapping && Object.keys(report.piiMapping).length > 0 && (
        <div className="border-t border-neutral-200 pt-4 flex flex-col gap-2">
          <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
            Thông tin Liên hệ Giải mã (Contact Details)
          </span>
          <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs">
            {Object.entries(report.piiMapping).map(([key, val]) => (
              <div key={key} className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-neutral-400 font-semibold uppercase">{key}</span>
                <span className="font-semibold text-neutral-800 truncate">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
