import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Play,
  Clock,
  Workflow,
  Scan,
  Network,
  ShieldCheck,
  GraduationCap,
  ChevronRight,
  RotateCcw,
  Check,
  AlertTriangle,
  FileText,
  Target,
  Eye,
  FileCode,
  Pause,
  X,
  RefreshCw,
  FolderOpen,
  History,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  List
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VideoPlayer } from '../components/VideoPlayer';
import { ReviewModal } from '../components/ReviewModal';
import { api } from '../api';
import { Job, Evidence } from '../types';

const AGENT_GUIDES: Record<string, { label: string; purpose: string; input: string; output: string }> = {
  orchestrator: { label: 'Điều phối', purpose: 'Bắt đầu đúng quy trình, lưu trạng thái và chuyển việc giữa các bước.', input: 'Yêu cầu xử lý và phiên bản bài giảng', output: 'Các bước cần chạy và trạng thái lượt xử lý' },
  perception: { label: 'Đọc nguồn học liệu', purpose: 'Đọc thông tin video cùng các ghi chú đã có mốc thời gian. Với video mẫu, hệ thống không tự nghe hoặc phân tích hình ảnh.', input: 'Video tham khảo và ghi chú theo phụ đề', output: 'Thông tin nguồn và số ghi chú được đọc' },
  knowledge: { label: 'Tìm và liên kết ý chính', purpose: 'Tìm cụm từ khóa đã định trước trong ghi chú rồi nối ý liên quan với đoạn nguồn.', input: 'Ghi chú có mốc và danh sách khái niệm', output: 'Ý chính, mốc nguồn và mối liên hệ' },
  verification: { label: 'Kiểm tra nguồn', purpose: 'Kiểm tra mốc có nằm trong thời lượng nguồn không và đánh dấu nội dung cần giảng viên xác nhận.', input: 'Ý chính và mốc dẫn chứng', output: 'Danh sách có nguồn, thiếu nguồn hoặc đang chờ duyệt' },
  pedagogical: { label: 'Đối chiếu mục tiêu học tập', purpose: 'Gợi ý khái niệm nào liên quan tới từng mục tiêu; giảng viên vẫn cần xem mức độ phù hợp.', input: 'Mục tiêu và ý chính đã xác nhận', output: 'Bảng đối chiếu mục tiêu học tập' },
  planning: { label: 'Thử phương án bài học', purpose: 'Kiểm tra thời lượng và thứ tự nội dung trong kịch bản, không dự đoán điểm số.', input: 'Thời lượng các phần và thay đổi đề xuất', output: 'Tổng thời gian và điều kiện hợp lệ' },
  tutor: { label: 'Trợ lý hỏi đáp', purpose: 'Tìm câu trả lời trong các đoạn nguồn đã được giảng viên xác nhận.', input: 'Câu hỏi và nội dung đã duyệt', output: 'Câu trả lời kèm mốc nguồn phù hợp' },
  assessment: { label: 'Soạn câu hỏi', purpose: 'Chọn câu hỏi mẫu gắn với ý đã xác nhận để giảng viên xem trước.', input: 'Ý chính và nguồn đã duyệt', output: 'Bộ câu hỏi bản nháp' },
};

const TOOL_LABELS: Record<string, string> = {
  dispatch_workflow: 'Chọn quy trình cần thực hiện', persist_handoff: 'Lưu bước tiếp theo', probe_video: 'Đọc thông tin video',
  extract_audio: 'Tách âm thanh', read_sources: 'Đọc ghi chú và tài liệu', extract_concepts: 'Tìm cụm từ khóa', query_evidence: 'Tìm đoạn nguồn liên quan',
  validate_evidence: 'Kiểm tra mốc và nguồn', validate_constraints: 'Kiểm tra điều kiện thực hiện', map_objectives: 'Đối chiếu mục tiêu học tập',
  learning_analytics: 'Tổng hợp kết quả học tập', plan_timetable: 'Tính phân bổ thời lượng', evaluate_scenario: 'Kiểm tra kịch bản',
  compose_grounded_answer: 'Soạn câu trả lời từ nguồn đã duyệt', build_questions: 'Chọn câu hỏi phù hợp', grade_answers: 'Chấm câu trả lời',
};
const WORKFLOW_LABELS: Record<string, string> = {
  analysis: 'Phân tích nguồn', tutor: 'Hỏi đáp', assessment: 'Soạn câu hỏi', planning: 'Thử phương án',
};

export const ExecutionCenterView: React.FC = () => {
  const {
    workspace,
    bootstrap,
    activeJob,
    setActiveJob,
    currentLectureId,
    selectLecture,
    refreshWorkspace,
    seekVideoTo,
    videoSeekTarget,
    clearVideoSeek,
    setCurrentView,
    role
  } = useApp();

  const [selectedAgentId, setSelectedAgentId] = useState<string>('perception');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'input' | 'tools' | 'output' | 'history'>('output');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [selectedEvidenceForPlayer, setSelectedEvidenceForPlayer] = useState<Evidence | null>(null);

  const shouldReduceMotion = useReducedMotion();

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>Hoàn tất</span>
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
            <RefreshCw className="w-3 h-3 text-blue-600 animate-spin shrink-0" />
            <span>Đang chạy</span>
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
            <span>Cần xác nhận</span>
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
            <span>Chờ lượt</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
            <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
            <span>Thất bại</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
            <span>Đã hủy</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
            <span>Sẵn sàng</span>
          </span>
        );
    }
  };

  const handleStartAnalysis = async () => {
    if (!currentLectureId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const job = await api.startAnalysis(currentLectureId);
      setActiveJob(job);
      await refreshWorkspace();
    } catch (err: any) {
      console.error('Start analysis error:', err);
      setActionError(err.detail || err.message || 'Không thể bắt đầu phân tích bài giảng');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJobControl = async (action: 'pause' | 'resume' | 'cancel' | 'retry', targetJob: Job | null = activeJob) => {
    if (!targetJob) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await api.controlJob(targetJob.id, action);
      setActiveJob(updated);
      await refreshWorkspace();
    } catch (err: any) {
      console.error('Job control error:', err);
      setActionError(err.detail || err.message || 'Lỗi khi điều khiển lượt chạy');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkReview = async (note: string) => {
    if (!currentLectureId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await api.bulkReview(currentLectureId, note);
      await refreshWorkspace();
    } catch (err: any) {
      setActionError(err.detail || err.message || 'Lỗi khi xác nhận hàng loạt');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const lectures = bootstrap?.lectures || [];
  const currentLecture = lectures.find(l => l.id === currentLectureId) || workspace?.lecture;
  const lectureJobs = workspace?.jobs || [];
  const analysisJobs = lectureJobs.filter(job => job.workflow === 'analysis' && job.input?.version === currentLecture?.version);
  const analysisJob = activeJob?.workflow === 'analysis' && activeJob.lecture_id === currentLectureId && activeJob.input?.version === currentLecture?.version
    ? activeJob
    : analysisJobs[0] || null;
  const selectedAgentRun = analysisJob?.agents?.find(agentRun => agentRun.agent === selectedAgentId);
  const getAgentStatus = (agentName: string) => analysisJob?.agents?.find(agentRun => agentRun.agent === agentName)?.status || 'idle';
  const findings = workspace?.findings || [];
  const pendingFindings = findings.filter(finding => finding.status === 'pending');
  const unsupportedPendingCount = pendingFindings.filter(finding => !finding.has_evidence).length;
  const defaultFirstEvidence = workspace?.evidence?.[0] || null;
  const youtubeSource = workspace?.assets.find(asset => asset.source_type === 'youtube_reference');
  const annotationCount = workspace?.transcript.length ?? 0;
  const hasAnalysisResults = Boolean(currentLecture?.analysis_current || workspace?.concepts.length || findings.length || analysisJob?.agents.some(agentRun => agentRun.agent === 'knowledge' && agentRun.status === 'completed'));
  const unfinishedAnalysisLabel = analysisJob?.status === 'running' || analysisJob?.status === 'queued'
    ? 'Đang xử lý'
    : analysisJob?.status === 'failed' ? 'Không hoàn tất' : 'Chưa chạy';
  const linkedSourceCount = new Set((workspace?.evidence || []).filter(evidence => evidence.valid)
    .map(evidence => `${evidence.start ?? ''}|${evidence.end ?? ''}|${evidence.text}`)).size;
  const selectedGuide = AGENT_GUIDES[selectedAgentId] || AGENT_GUIDES.orchestrator;
  const selectedResult = selectedAgentRun?.output?.result;
  const selectedResultSummary = (() => {
    if (!selectedResult) return '';
    switch (selectedAgentId) {
      case 'orchestrator': return `Đã tạo lượt phân tích cho phiên bản ${selectedResult.version ?? analysisJob?.input?.version ?? 'hiện tại'}.`;
      case 'perception': return `${selectedResult.transcript_segments ?? annotationCount} ghi chú có mốc được đọc; ${selectedResult.slide_pages ?? 0} trang trình chiếu. ${selectedResult.note || 'Bước này chỉ đọc nguồn đã cung cấp.'}`;
      case 'knowledge': return `Tìm thấy ${selectedResult.concept_count ?? 0} ý chính; gắn ${selectedResult.evidence_count ?? 0} liên kết ý–nguồn và tạo ${selectedResult.edge_count ?? 0} mối liên hệ. ${selectedResult.method || ''}`;
      case 'verification': return `Đã rà ${selectedResult.findings?.length ?? findings.length} đề xuất. Các mục có bằng chứng vẫn cần giảng viên xác nhận trước khi dùng.`;
      case 'pedagogical': return `Đã lập bảng đối chiếu cho ${selectedResult.coverage?.length ?? 0} mục tiêu học tập. Đây là gợi ý để giảng viên xem lại.`;
      case 'planning': return selectedResult.feasible === undefined
        ? 'Đã kiểm tra kịch bản theo các điều kiện thời lượng và thứ tự nội dung.'
        : `${selectedResult.feasible ? 'Kịch bản đáp ứng' : 'Kịch bản chưa đáp ứng'} điều kiện. Tổng dự kiến: ${selectedResult.scenario_total} phút.`;
      case 'tutor': return selectedResult.answer || `Đã tìm ${selectedResult.citations?.length ?? 0} đoạn nguồn để trả lời.`;
      case 'assessment': return `Đã chọn ${selectedResult.questions?.length ?? selectedResult.question_count ?? 0} câu hỏi nháp từ nội dung có nguồn.`;
      default: return 'Đã ghi nhận kết quả của bước xử lý.';
    }
  })();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-5 max-w-7xl mx-auto pb-10"
    >
      {/* Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-black text-slate-900 tracking-tight leading-tight">
            Các bước xử lý bài giảng
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            Xem hệ thống đã dùng nguồn nào, tìm được gì và phần nào cần giảng viên kiểm tra.
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {/* Active Job Controls (if running or paused) */}
          {analysisJob && (analysisJob.status === 'running' || analysisJob.status === 'paused') && (
            <div className="flex items-center space-x-1.5 mr-1">
              {analysisJob.status === 'running' ? (
                <button
                  type="button"
                  onClick={() => handleJobControl('pause', analysisJob)}
                  disabled={actionLoading}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Tạm dừng</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleJobControl('resume', analysisJob)}
                  disabled={actionLoading}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Tiếp tục</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleJobControl('cancel', analysisJob)}
                disabled={actionLoading}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Hủy lượt chạy"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* History Selection Dropdown Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>Lịch sử phân tích ({analysisJobs.length})</span>
            </button>

            {/* History Dropdown Menu */}
            {isHistoryOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-xl border border-slate-200 shadow-lg p-2 z-40 space-y-1">
                <div className="text-[11px] font-bold text-slate-500 px-2 py-1 border-b border-slate-100">
                  Chọn lượt chạy phân tích
                </div>
                {analysisJobs.length === 0 ? (
                  <div className="text-xs text-slate-400 p-3 text-center">
                    Chưa có lượt phân tích cho phiên bản này
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {analysisJobs.map((j) => {
                      const isSelected = analysisJob?.id === j.id;
                      return (
                        <div
                          key={j.id}
                          onClick={() => {
                            setActiveJob(j);
                            setIsHistoryOpen(false);
                          }}
                          className={`p-2 rounded-lg text-xs cursor-pointer flex items-center justify-between transition-colors ${
                            isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <div className="font-mono font-bold text-slate-800 text-[11px]">
                              {j.id}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(j.created_at).toLocaleString('vi-VN')}
                            </div>
                          </div>
                          <div>{renderStatusBadge(j.status)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Start Analysis Button */}
          <button
            type="button"
            onClick={handleStartAnalysis}
            disabled={actionLoading || analysisJob?.status === 'running'}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-xs transition-colors cursor-pointer"
          >
            {actionLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Bắt đầu phân tích</span>
          </button>
        </div>
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-600 hover:text-rose-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Lecture Selector & Status Pill */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs shadow-2xs">
          <FolderOpen className="w-4 h-4 text-blue-600 mr-2 shrink-0" />
          <select
            value={currentLectureId}
            onChange={(e) => selectLecture(e.target.value)}
            className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer text-xs"
            aria-label="Chọn bài giảng"
          >
            {lectures.map((lec) => (
              <option key={lec.id} value={lec.id}>
                {lec.title} {lec.status === 'published' ? '(Đã xuất bản)' : '(Bản thảo)'}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl">
          Minh họa · quy tắc có sẵn
        </span>

        <span className="text-xs text-slate-500 font-medium">
          {youtubeSource ? 'Học liệu thực hành · ghi chú theo mốc' : (currentLecture?.sample_attached ? 'Học liệu mẫu đã gắn' : 'Chưa gắn nguồn học liệu')}
        </span>
      </div>

      {/* Explain the measurements before showing the agent workflow. */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-4" aria-labelledby="processing-summary-title">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 id="processing-summary-title" className="font-extrabold text-sm text-slate-900">Hệ thống đã làm gì với nguồn này?</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {youtubeSource
                ? 'Hệ thống dò các từ khóa đã định trước trong ghi chú, nối kết quả với khoảng thời gian tương ứng, rồi để giảng viên kiểm tra trước khi dùng.'
                : 'Hệ thống dò nội dung trong tài liệu đã cung cấp, gắn kết quả với đoạn nguồn, rồi để giảng viên kiểm tra trước khi dùng.'}
            </p>
          </div>
          {youtubeSource?.url && (
            <a href={youtubeSource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline shrink-0">
              <span>Mở video nguồn</span><ChevronRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {youtubeSource && (
          <div className="rounded-xl bg-blue-50/70 border border-blue-100 px-3.5 py-3 text-xs leading-relaxed">
            <div className="font-bold text-slate-800">{youtubeSource.name}</div>
            <p className="text-slate-600 mt-0.5">
              Video dài 18 phút 29 giây · đang dùng {annotationCount} ghi chú tiếng Việt theo phụ đề tự động tiếng Anh. Demo chưa tự nghe lời thoại hoặc đọc hình ảnh.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-[11px] font-semibold text-slate-500">Gợi ý ý chính</div>
            <div className="mt-1 text-lg font-black text-slate-900">{hasAnalysisResults ? (workspace?.concepts.length ?? 0) : unfinishedAnalysisLabel}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Đếm số chủ đề có từ khóa khớp với ghi chú nguồn. Đây không phải điểm hiểu bài hay thước đo độ chính xác.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-[11px] font-semibold text-slate-500">Mốc video có liên kết</div>
            <div className="mt-1 text-lg font-black text-slate-900">{hasAnalysisResults ? linkedSourceCount : unfinishedAnalysisLabel}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Đếm các khoảng thời gian khác nhau được gắn với ít nhất một gợi ý để thầy/cô mở video đối chiếu.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-[11px] font-semibold text-slate-500">Mục cần thầy/cô xem</div>
            <div className="mt-1 text-lg font-black text-slate-900">{hasAnalysisResults ? `${pendingFindings.length} mục chờ xem` : unfinishedAnalysisLabel}</div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {pendingFindings.length} gợi ý chưa được duyệt; {unsupportedPendingCount} mục chưa có nguồn nên cần bổ sung căn cứ hoặc loại bỏ. Chỉ nội dung được giảng viên xác nhận mới chia sẻ với học viên.
            </p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">
          Đây là bản minh họa chạy theo quy tắc trên ghi chú đã chuẩn bị, không phải phân tích tự động toàn bộ video. “Thời gian xử lý” bên dưới là thời gian máy chạy, không phải thời lượng video hoặc thời gian học.
        </p>
      </section>

      {/* 2x2 Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* TOP-LEFT: Luồng phân tích bài giảng (Execution Flow Diagram) (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Workflow className="w-4 h-4 text-blue-600" />
              <h2 className="font-extrabold text-sm text-slate-900">
                Luồng phân tích bài giảng
              </h2>
            </div>

            {/* Dynamic Status Badge for active job */}
            {analysisJob ? (
              renderStatusBadge(analysisJob.status)
            ) : (
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-lg">
                Chưa có lượt chạy
              </span>
            )}
          </div>

          {/* Graph Nodes Architecture */}
          <div className="space-y-4 pt-1">
            {/* Orchestrator Root Node (Dark Navy Card) */}
            <div className="flex justify-center">
              <div
                onClick={() => setSelectedAgentId('orchestrator')}
                className={`bg-[#0f172a] text-white p-3.5 rounded-xl shadow-md border cursor-pointer transition-all w-64 text-center ${
                  selectedAgentId === 'orchestrator' ? 'ring-2 ring-blue-500 border-blue-400' : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  <Workflow className="w-4 h-4 text-cyan-400" />
                  <span className="font-extrabold text-xs">Điều phối lượt xử lý</span>
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5">
                  Chọn bước tiếp theo và lưu trạng thái
                </div>
                <div className="mt-1">
                  {renderStatusBadge(getAgentStatus('orchestrator'))}
                </div>
              </div>
            </div>

            {/* Connecting lines downward */}
            <div className="w-full flex justify-center">
              <div className="w-0.5 h-3 bg-slate-300" />
            </div>

            {/* Primary 4 Analysis Agents Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* 1. Perception */}
              <div
                onClick={() => setSelectedAgentId('perception')}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-2 ${
                  selectedAgentId === 'perception'
                    ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-100'
                    : 'bg-white border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Scan className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-bold text-[12px] text-slate-900 truncate">Đọc học liệu</span>
                  </div>
                </div>

                <div>
                  {renderStatusBadge(getAgentStatus('perception'))}
                </div>

                <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 leading-tight">
                  <div>Đọc: <strong className="text-slate-700">Video và ghi chú</strong></div>
                  <div>Ghi nhận: <strong className="text-slate-700">Nguồn, mốc thời gian</strong></div>
                </div>
              </div>

              {/* 2. Knowledge */}
              <div
                onClick={() => setSelectedAgentId('knowledge')}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-2 ${
                  selectedAgentId === 'knowledge'
                    ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-100'
                    : 'bg-white border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Network className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="font-bold text-[12px] text-slate-900 truncate">Tìm ý chính</span>
                  </div>
                </div>

                <div>
                  {renderStatusBadge(getAgentStatus('knowledge'))}
                </div>

                <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 leading-tight">
                  <div>Tìm: <strong className="text-slate-700">Cụm từ khóa đã định</strong></div>
                  <div>Liên kết: <strong className="text-slate-700">Ý chính và mốc nguồn</strong></div>
                </div>
              </div>

              {/* 3. Verification */}
              <div
                onClick={() => setSelectedAgentId('verification')}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-2 ${
                  selectedAgentId === 'verification'
                    ? 'bg-amber-50/70 border-amber-400 ring-2 ring-amber-100'
                    : 'bg-white border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-bold text-[12px] text-slate-900 truncate">Kiểm tra nguồn</span>
                  </div>
                </div>

                <div>
                  {renderStatusBadge(getAgentStatus('verification'))}
                </div>

                <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 leading-tight">
                  <div>Kiểm tra: <strong className="text-slate-700">Mốc và nội dung nguồn</strong></div>
                  <div>Kết quả: <strong className="text-slate-700">Chờ giảng viên duyệt</strong></div>
                </div>
              </div>

              {/* 4. Pedagogical */}
              <div
                onClick={() => setSelectedAgentId('pedagogical')}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all space-y-2 ${
                  selectedAgentId === 'pedagogical'
                    ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-100'
                    : 'bg-white border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4 text-slate-600 shrink-0" />
                    <span className="font-bold text-[12px] text-slate-900 truncate">Đối chiếu mục tiêu</span>
                  </div>
                </div>

                <div>
                  {renderStatusBadge(getAgentStatus('pedagogical'))}
                </div>

                <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 leading-tight">
                  <div>Đối chiếu: <strong className="text-slate-700">Ý chính và mục tiêu</strong></div>
                  <div>Kết quả: <strong className="text-slate-700">Gợi ý để xem lại</strong></div>
                </div>
              </div>
            </div>

            {/* Dotted Box: Kích hoạt theo tác vụ */}
            <div className="pt-2">
              <span className="text-[10px] text-slate-400 font-semibold block text-center mb-2">
                Kích hoạt theo tác vụ
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div
                  onClick={() => setSelectedAgentId('planning')}
                  className={`p-2.5 rounded-xl border text-center text-xs cursor-pointer transition-all ${
                    selectedAgentId === 'planning' ? 'bg-blue-50 border-blue-400' : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-slate-800 text-[11px]">Thử phương án</div>
                  <div className="text-[10px] text-slate-500">Kiểm tra thời lượng</div>
                  <div className="mt-1">{renderStatusBadge(getAgentStatus('planning'))}</div>
                </div>

                <div
                  onClick={() => setSelectedAgentId('tutor')}
                  className={`p-2.5 rounded-xl border text-center text-xs cursor-pointer transition-all ${
                    selectedAgentId === 'tutor' ? 'bg-blue-50 border-blue-400' : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-slate-800 text-[11px]">Trợ lý hỏi đáp</div>
                  <div className="text-[10px] text-slate-500">Trả lời theo nguồn đã duyệt</div>
                  <div className="mt-1">{renderStatusBadge(getAgentStatus('tutor'))}</div>
                </div>

                <div
                  onClick={() => setSelectedAgentId('assessment')}
                  className={`p-2.5 rounded-xl border text-center text-xs cursor-pointer transition-all ${
                    selectedAgentId === 'assessment' ? 'bg-blue-50 border-blue-400' : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-slate-800 text-[11px]">Soạn câu hỏi</div>
                  <div className="text-[10px] text-slate-500">Từ nội dung đã xác nhận</div>
                  <div className="mt-1">{renderStatusBadge(getAgentStatus('assessment'))}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TOP-RIGHT: Bằng chứng đang xem (5 Cols) */}
        <div className="lg:col-span-5">
          <VideoPlayer
            lectureId={currentLectureId}
            seekTarget={videoSeekTarget}
            onClearSeekTarget={clearVideoSeek}
            sampleAttached={currentLecture?.sample_attached}
            selectedEvidence={selectedEvidenceForPlayer}
            defaultEvidence={defaultFirstEvidence}
          />
        </div>
      </div>

      {/* BOTTOM ROW: Agent Detail Inspector (Left 7 Cols) & Lecture Twin Summary (Right 5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* BOTTOM-LEFT: Agent Detail Inspector */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="font-black text-sm text-slate-900">{selectedGuide.label}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{selectedGuide.purpose}</p>
              </div>
            </div>

            <div>
              {renderStatusBadge(getAgentStatus(selectedAgentId))}
            </div>
          </div>

          {/* Inspector Tabs */}
          <div className="flex items-center space-x-4 border-b border-slate-100 pb-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveInspectorTab('input')}
              className={`pb-1 cursor-pointer transition-colors ${
                activeInspectorTab === 'input'
                  ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Dữ liệu nhận
            </button>
            <button
              type="button"
              onClick={() => setActiveInspectorTab('tools')}
              className={`pb-1 cursor-pointer transition-colors ${
                activeInspectorTab === 'tools'
                  ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Các bước đã làm ({selectedAgentRun?.tools?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveInspectorTab('output')}
              className={`pb-1 cursor-pointer transition-colors ${
                activeInspectorTab === 'output'
                  ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Kết quả
            </button>
            <button
              type="button"
              onClick={() => setActiveInspectorTab('history')}
              className={`pb-1 cursor-pointer transition-colors ${
                activeInspectorTab === 'history'
                  ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lượt xử lý
            </button>
          </div>

          {/* Tab Content Display */}
          {activeInspectorTab === 'output' && (
            <div className="space-y-3">
              {!selectedAgentRun ? (
                <div className="text-xs text-slate-600 py-5 px-4 rounded-xl bg-slate-50 text-center space-y-1.5">
                  <div className="font-bold text-slate-700">Bước này chưa chạy trong lượt đang xem.</div>
                  <p>{selectedGuide.purpose}</p>
                  <p className="text-slate-500">Bấm “Bắt đầu phân tích” để hệ thống đọc nguồn và tạo kết quả cần giảng viên kiểm tra.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Verification Agent: Display Findings */}
                  {selectedAgentId === 'verification' && findings.length > 0 && (
                    <div className="divide-y divide-slate-100 text-xs">
                      {findings.map((f) => (
                        <div key={f.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                              f.status === 'confirmed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : f.status === 'rejected'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {f.status === 'confirmed' ? '✓' : f.status === 'rejected' ? '✕' : '!'}
                            </span>
                            <div>
                              <span className="font-bold text-slate-800">{f.title}</span>
                              <p className="text-[11px] text-slate-500">{f.description}</p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {f.has_evidence && (
                              <button
                                type="button"
                                onClick={() => {
                                  const ev = workspace?.evidence.find(e => f.source_ids?.includes(e.id));
                                  if (ev) {
                                    setSelectedEvidenceForPlayer(ev);
                                    if (ev.start !== undefined && ev.start !== null) {
                                      seekVideoTo(ev.start);
                                    }
                                  }
                                }}
                                className="text-blue-600 hover:underline font-mono text-[11px] cursor-pointer"
                              >
                                Mở video tại mốc này
                              </button>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              f.status === 'confirmed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : f.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {f.status === 'confirmed' ? 'Đã duyệt' : f.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Source reading: report what was read, and what was not analyzed. */}
                  {selectedAgentId === 'perception' && selectedAgentRun.output?.result && (
                    <div className="space-y-2 text-xs">
                      <div className="p-3 bg-slate-50 rounded-xl space-y-2">
                        <div><span className="text-slate-500">Nguồn nội dung:</span> <strong className="text-slate-800">{youtubeSource?.name || selectedAgentRun.output.result.source_label || 'Video/tài liệu đã tải lên'}</strong></div>
                        {youtubeSource?.url && <a href={youtubeSource.url} target="_blank" rel="noreferrer" className="inline-flex text-blue-700 font-semibold hover:underline">Mở video nguồn</a>}
                        <div><span className="text-slate-500">Đã đọc:</span> <strong className="text-slate-800">{selectedAgentRun.output.result.transcript_segments ?? annotationCount} ghi chú có mốc</strong>, <strong className="text-slate-800">{selectedAgentRun.output.result.slide_pages ?? 0} trang trình chiếu</strong></div>
                        <div><span className="text-slate-500">Cách có nội dung:</span> <strong className="text-slate-800">{selectedAgentRun.output.result.caption_source || 'Đọc văn bản và tài liệu đã cung cấp'}</strong></div>
                        <p className="text-slate-600 leading-relaxed">{selectedAgentRun.output.result.note || 'Bước này chỉ đọc nguồn được cung cấp; chưa tự nhận dạng lời nói hoặc nội dung trong hình ảnh.'}</p>
                        {selectedAgentRun.output.result.asr === 'not_run' && <p className="text-amber-800">Chưa tự tạo phụ đề hoặc phân tích khung hình từ video.</p>}
                      </div>

                      {selectedAgentRun.output.result.keyframes && selectedAgentRun.output.result.keyframes.length > 0 && (
                        <div className="space-y-1">
                            <span className="text-[11px] font-bold text-slate-600">Khung hình lấy từ tệp video đã tải lên:</span>
                          <div className="grid grid-cols-3 gap-2">
                            {selectedAgentRun.output.result.keyframes.map((kf: any, i: number) => (
                              <div key={i} className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-video relative">
                                  <img src={kf.url} alt={`Khung hình tại giây ${kf.timestamp}`} className="w-full h-full object-cover" />
                                <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 rounded font-mono">
                                  {kf.timestamp}s
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Generic Output Summary */}
                  {selectedAgentId !== 'verification' && selectedAgentId !== 'perception' && selectedAgentRun.output && (
                    <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 space-y-2">
                      <div className="font-bold text-slate-800">Kết quả của bước này</div>
                      <p className="leading-relaxed">{selectedResultSummary}</p>
                      {selectedAgentId === 'knowledge' && selectedResult && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                          <div className="rounded-lg bg-white border border-slate-200 p-2"><strong>{selectedResult.concept_count ?? 0}</strong><div className="text-[10px] text-slate-500 mt-0.5">ý có từ khóa khớp</div></div>
                          <div className="rounded-lg bg-white border border-slate-200 p-2"><strong>{selectedResult.evidence_count ?? 0}</strong><div className="text-[10px] text-slate-500 mt-0.5">liên kết ý–nguồn</div></div>
                          <div className="rounded-lg bg-white border border-slate-200 p-2"><strong>{selectedResult.edge_count ?? 0}</strong><div className="text-[10px] text-slate-500 mt-0.5">mối liên hệ giữa ý</div></div>
                        </div>
                      )}
                      {selectedAgentId === 'tutor' && selectedResult.citations?.length > 0 && <p className="text-slate-500">Số đoạn nguồn được trích: {selectedResult.citations.length}. Câu trả lời dùng nội dung đã xác nhận.</p>}
                      <details className="pt-1">
                        <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">Thông tin kỹ thuật (không bắt buộc)</summary>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-[10px] text-slate-500">{JSON.stringify(selectedAgentRun.output.result || selectedAgentRun.output, null, 2)}</pre>
                      </details>
                    </div>
                  )}

                  {/* Action Buttons for Teacher Review when Verification needs review */}
                  {selectedAgentId === 'verification' && analysisJob?.status === 'needs_review' && pendingFindings.length > 0 && role === 'teacher' && (
                    <div className="flex items-center space-x-2.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsReviewModalOpen(true)}
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Kiểm tra {pendingFindings.length} ý đang chờ duyệt</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleJobControl('retry', analysisJob)}
                        disabled={actionLoading}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center space-x-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Yêu cầu rà soát</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeInspectorTab === 'input' && (
            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 space-y-2">
              {selectedAgentRun?.input ? (
                <>
                  <div className="font-bold text-slate-800">Bước này nhận gì?</div>
                  <p className="leading-relaxed">{selectedGuide.input}</p>
                  <div><span className="text-slate-500">Bài giảng:</span> <strong>{currentLecture?.title || 'Chưa chọn'}</strong></div>
                  <div><span className="text-slate-500">Phiên bản:</span> <strong>{selectedAgentRun.input.version ?? currentLecture?.version ?? '—'}</strong></div>
                  <details className="pt-1">
                    <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">Thông tin kỹ thuật (không bắt buộc)</summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-[10px] text-slate-500">{JSON.stringify(selectedAgentRun.input, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <span className="text-slate-500">Chưa có lượt xử lý để xem dữ liệu đầu vào.</span>
              )}
            </div>
          )}

          {activeInspectorTab === 'tools' && (
            <div className="space-y-2 text-xs">
              {selectedAgentRun?.tools && selectedAgentRun.tools.length > 0 ? (
                selectedAgentRun.tools.map((t, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800">{TOOL_LABELS[t.name] || 'Bước xử lý'}</span>
                      <div className="text-[11px] text-slate-500">
                        Thời gian máy chạy: {t.duration_ms ?? 0} mili giây · {t.status === 'completed' ? 'Đã hoàn tất' : t.status === 'failed' ? 'Bị lỗi' : t.status === 'running' ? 'Đang chạy' : 'Đang chờ'}
                      </div>
                    </div>
                    <span className={`font-bold text-[10px] px-2 py-0.5 rounded ${t.status === 'completed' ? 'text-emerald-700 bg-emerald-50' : t.status === 'failed' ? 'text-rose-700 bg-rose-50' : 'text-slate-600 bg-slate-100'}`}>
                      {t.status === 'completed' ? 'Hoàn tất' : t.status === 'failed' ? 'Có lỗi' : t.status === 'running' ? 'Đang chạy' : 'Chờ'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 py-3 text-center italic">
                  Chưa có công cụ nào được gọi bởi tác nhân này.
                </div>
              )}
            </div>
          )}

          {activeInspectorTab === 'history' && (
            <div className="text-xs text-slate-500 py-2 space-y-1">
              <div className="font-bold text-slate-800">Lượt xử lý đang xem</div>
              <div>Loại: <span className="text-slate-700 font-semibold">{WORKFLOW_LABELS[analysisJob?.workflow || ''] || 'Chưa chọn'}</span></div>
              <div>Trạng thái: <span className="text-slate-700 font-semibold">{analysisJob ? analysisJob.status === 'completed' ? 'Hoàn tất' : analysisJob.status === 'needs_review' ? 'Chờ giảng viên xem' : analysisJob.status === 'failed' ? 'Có lỗi' : analysisJob.status === 'running' ? 'Đang chạy' : analysisJob.status === 'queued' ? 'Đang chờ' : 'Đã dừng' : 'Chưa có lượt'}</span></div>
              {analysisJob?.created_at && <div>Thời điểm bắt đầu: <span className="text-slate-700">{new Date(analysisJob.created_at).toLocaleString('vi-VN')}</span></div>}
              <div className="text-[11px] text-slate-400">
                Tổng số lượt đã lưu cho bài giảng: {lectureJobs.length}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM-RIGHT: Lecture Twin Summary */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3.5">
          <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
            <FileText className="w-4 h-4 text-blue-600" />
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Tóm tắt bài giảng</h3>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                Mục tiêu, ý chính, lượt làm bài và phương án thử.
              </p>
            </div>
          </div>

          {/* Four plain-language summaries, each opening its corresponding detail. */}
          <div className="space-y-2">
            {/* Lesson objectives */}
            <button
              type="button"
              onClick={() => setCurrentView('twin')}
              aria-label={`Mục tiêu bài học: ${workspace?.planned?.objectives?.length ?? workspace?.lecture?.objectives?.length ?? 0} mục tiêu. Mở chi tiết kế hoạch.`}
              className="group w-full p-3 rounded-xl border border-slate-200/90 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 transition-colors flex items-center gap-3 text-left"
            >
              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800">Mục tiêu bài học</span>
                  <span className="shrink-0 text-right text-slate-600">
                    {(workspace?.planned?.objectives?.length ?? workspace?.lecture?.objectives?.length ?? 0) > 0
                      ? `${workspace?.planned?.objectives?.length ?? workspace?.lecture?.objectives?.length} mục tiêu`
                      : 'Chưa có mục tiêu'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Điều người học cần đạt sau buổi học.
                </p>
              </div>
              <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </button>

            {/* Lesson ideas and reviewed sources */}
            <button
              type="button"
              onClick={() => setCurrentView('graph')}
              aria-label="Ý chính trong bài giảng và tình trạng duyệt. Mở nội dung cùng nguồn dẫn."
              className="group w-full p-3 rounded-xl border border-slate-200/90 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 transition-colors flex items-center gap-3 text-left"
            >
              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800">Ý chính trong bài giảng</span>
                  <span className="shrink-0 text-right text-slate-600">
                    {currentLecture?.analysis_current && currentLecture?.sample_attached
                      ? `${workspace?.twin?.observed?.concepts ?? workspace?.concepts?.length ?? 0} gợi ý mẫu`
                      : (workspace?.twin?.observed?.concepts ?? workspace?.concepts?.length ?? 0) > 0
                        ? `${workspace?.twin?.observed?.verified ?? workspace?.concepts?.filter(concept => concept.verified).length ?? 0}/${workspace?.twin?.observed?.concepts ?? workspace?.concepts?.length ?? 0} gợi ý đã duyệt`
                        : 'Chưa chạy xử lý'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  {currentLecture?.analysis_current && currentLecture?.sample_attached
                    ? 'Gợi ý minh họa đã chuẩn bị sẵn để xem cách đối chiếu với video; không phải kết quả AI vừa phân tích.'
                    : (workspace?.twin?.observed?.concepts ?? workspace?.concepts?.length ?? 0) > 0
                      ? 'Số đã duyệt / tổng số gợi ý. Thầy/cô mở nguồn để kiểm tra; đây không phải điểm hiểu bài.'
                      : 'Chạy xử lý để tạo gợi ý từ ghi chú, sau đó thầy/cô kiểm tra nguồn.'}
                </p>
              </div>
              <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </button>

            {/* Learner quiz attempts */}
            <button
              type="button"
              onClick={() => setCurrentView('assessment')}
              aria-label="Lượt làm bài kiểm tra. Mở để tạo bài kiểm tra hoặc xem kết quả."
              className="group w-full p-3 rounded-xl border border-slate-200/90 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 transition-colors flex items-center gap-3 text-left"
            >
              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <BarChart2 className="w-4 h-4" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800">Bài kiểm tra</span>
                  <span className="shrink-0 text-right text-slate-600">
                    {(workspace?.twin?.evaluated?.attempt_count ?? 0) > 0
                      ? `${workspace?.twin?.evaluated?.attempt_count} lượt làm bài`
                      : 'Chưa có lượt làm bài'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  {role === 'student'
                    ? 'Số lần bạn đã nộp bài kiểm tra.'
                    : 'Số lần học viên đã nộp; mở để tạo bài hoặc xem kết quả.'}
                </p>
              </div>
              <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </button>

            {/* Saved what-if lesson plans */}
            <button
              type="button"
              onClick={() => setCurrentView('simulation')}
              aria-label="Phương án thử đã lưu. Mở để thử thay đổi kế hoạch bài học."
              className="group w-full p-3 rounded-xl border border-slate-200/90 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 transition-colors flex items-center gap-3 text-left"
            >
              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <FileCode className="w-4 h-4" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-800">Phương án thử</span>
                  <span className="shrink-0 text-right text-slate-600">
                    {(workspace?.scenarios?.length ?? 0) > 0
                      ? `${workspace?.scenarios?.length} phương án đã lưu`
                      : 'Chưa lưu phương án thử'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Bản nháp để so sánh thay đổi, chưa áp dụng vào lớp.
                </p>
              </div>
              <ChevronRight aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Honest Footer */}
      <footer className="pt-4 border-t border-slate-200 text-center text-xs text-slate-400 font-medium">
        Bản minh họa dùng quy tắc và ghi chú có sẵn; chưa tự nghe lời thoại hoặc phân tích hình ảnh. Giảng viên duyệt trước khi xuất bản.
      </footer>

      {/* Review Modal Dialog */}
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onConfirm={handleBulkReview}
        pendingCount={pendingFindings.length}
        unsupportedCount={unsupportedPendingCount}
      />
    </motion.div>
  );
};
