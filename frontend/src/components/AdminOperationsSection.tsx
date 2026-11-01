import React, { useState } from 'react';
import {
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  XCircle,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Bot,
  Shield,
  Lock,
  Cpu,
  Layers,
  FileText,
  Info
} from 'lucide-react';
import {
  adminWorkflowLabels,
  adminJobStatusLabels,
  filterAdminJobs,
  adminOperationSummary,
  adminAuditPresentation
} from '../admin-model';
import type { AdminMonitoringData, LectureSummary, Course, User, Job, AgentRun } from '../types';

interface AdminOperationsSectionProps {
  monitoring: AdminMonitoringData | null;
  lectures: LectureSummary[];
  courses: Course[];
  users: User[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  lastFetched: Date | null;
}

const agentNameMap: Record<string, string> = {
  orchestrator: 'Tác nhân điều phối',
  perception: 'Tác nhân phân tích học liệu',
  knowledge: 'Tác nhân trích xuất tri thức',
  verification: 'Tác nhân xác minh bằng chứng',
  pedagogical: 'Tác nhân sư phạm',
  planning: 'Tác nhân lập kế hoạch bài học',
  tutor: 'Tác nhân trợ lý học tập',
  assessment: 'Tác nhân kiểm tra đánh giá'
};

function formatDuration(ms?: number | null): string {
  if (ms == null || isNaN(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Number(ms.toFixed(1))} ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds} giây`;
}

function formatShortTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return isoString;
  }
}

export const AdminOperationsSection: React.FC<AdminOperationsSectionProps> = ({
  monitoring,
  lectures,
  courses,
  users,
  loading,
  error,
  onRefresh,
  lastFetched
}) => {
  // Job filters
  const [workflowFilter, setWorkflowFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [jobQuery, setJobQuery] = useState<string>('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [visibleJobsCount, setVisibleJobsCount] = useState<number>(10);

  // Audit filters
  const [auditQuery, setAuditQuery] = useState<string>('');
  const [auditRoleFilter, setAuditRoleFilter] = useState<string>('all');
  const [visibleAuditCount, setVisibleAuditCount] = useState<number>(15);

  const summary = adminOperationSummary(monitoring);
  const rawJobs = monitoring?.jobs || [];
  const filteredJobs = filterAdminJobs(
    rawJobs,
    { workflow: workflowFilter, status: statusFilter, query: jobQuery },
    lectures
  );

  const rawAudit = monitoring?.audit || [];
  const filteredAudit = rawAudit.filter(entry => {
    if (auditRoleFilter !== 'all' && entry.actor_role !== auditRoleFilter) return false;
    if (!auditQuery.trim()) return true;
    const q = auditQuery.toLowerCase();
    const pres = adminAuditPresentation(entry, users, lectures, courses);
    return (
      entry.id.toLowerCase().includes(q) ||
      pres.title.toLowerCase().includes(q) ||
      pres.actor.toLowerCase().includes(q) ||
      (pres.username && pres.username.toLowerCase().includes(q)) ||
      pres.detail.toLowerCase().includes(q)
    );
  });

  const getLectureTitle = (lectureId: string) => {
    const found = lectures.find(l => l.id === lectureId);
    return found ? found.title : 'Bài giảng không còn trong danh sách';
  };

  const getStatusBadge = (status: Job['status']) => {
    switch (status) {
      case 'running':
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#2959ea] border border-blue-200">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>{adminJobStatusLabels[status] || status}</span>
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            <span>{adminJobStatusLabels[status] || status}</span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>{adminJobStatusLabels[status] || status}</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" />
            <span>{adminJobStatusLabels[status] || status}</span>
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-[#5f708b] border border-slate-200">
            <PauseCircle className="w-3 h-3" />
            <span>{adminJobStatusLabels[status] || status}</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
            <XCircle className="w-3 h-3" />
            <span>{adminJobStatusLabels[status] || status}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  const metrics = monitoring?.metrics;

  const configuredAgents = monitoring?.agents || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold text-[#12213b] tracking-tight leading-tight">
            Vận hành hệ thống
          </h1>
          <p className="text-sm text-[#5f708b] font-medium mt-1">
            Theo dõi tiến trình xử lý và tra cứu hoạt động đã ghi nhận.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {lastFetched && (
            <span className="text-xs text-[#5f708b] hidden md:inline">
              Đã tải lúc: {formatShortTime(lastFetched.toISOString())}
            </span>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-[#12213b] bg-white border border-[#e1e7ef] hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
            title="Tải lại dữ liệu giám sát vận hành"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2959ea]' : 'text-[#5f708b]'}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex items-start justify-between gap-3 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Lỗi kết nối dữ liệu vận hành</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-900 rounded-lg text-xs font-semibold cursor-pointer shrink-0 min-h-[44px]"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Top 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Processing */}
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2959ea] flex items-center justify-center shrink-0 border border-blue-100">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-[#5f708b] block">Đang xử lý</span>
            <div className="text-2xl font-bold text-[#2959ea] leading-tight mt-0.5">
              {summary ? summary.processing : '—'}
            </div>
            <p className="text-xs text-[#5f708b] mt-0.5">Các quy trình đang được tác nhân xử lý</p>
          </div>
        </div>

        {/* Needs review */}
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-100">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-[#5f708b] block">Chờ giảng viên duyệt</span>
            <div className="text-2xl font-bold text-amber-700 leading-tight mt-0.5">
              {summary ? summary.needsReview : '—'}
            </div>
            <p className="text-xs text-[#5f708b] mt-0.5">Đã xong, chờ giảng viên phê duyệt kết quả</p>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-[#5f708b] block">Đã hoàn tất</span>
            <div className="text-2xl font-bold text-emerald-600 leading-tight mt-0.5">
              {summary ? summary.completed : '—'}
            </div>
            <p className="text-xs text-[#5f708b] mt-0.5">Các quy trình đã hoàn thành thành công</p>
          </div>
        </div>

        {/* Failed */}
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-[#5f708b] block">Gặp lỗi</span>
            <div className="text-2xl font-bold text-rose-600 leading-tight mt-0.5">
              {summary ? summary.failed : '—'}
            </div>
            <p className="text-xs text-[#5f708b] mt-0.5">Quy trình không thể hoàn thành do lỗi</p>
          </div>
        </div>
      </div>

      {/* Sub-badge for paused/cancelled if > 0 */}
      {summary && (summary.paused > 0 || summary.cancelled > 0) && (
        <div className="flex items-center gap-2 text-xs text-[#5f708b]">
          <span className="font-semibold text-[#12213b]">Trạng thái phụ:</span>
          {summary.paused > 0 && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">
              {summary.paused} quy trình tạm dừng
            </span>
          )}
          {summary.cancelled > 0 && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">
              {summary.cancelled} quy trình đã hủy
            </span>
          )}
        </div>
      )}

      {/* Honest Review Queue Notice */}
      <div className="flex items-start gap-2.5 p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-[#12213b] leading-relaxed">
        <Info className="w-4 h-4 text-[#2959ea] shrink-0 mt-0.5" />
        <span>
          <strong>Lưu ý quyền hạn:</strong> Các tiến trình ở trạng thái &ldquo;Chờ giảng viên duyệt&rdquo; là cổng kiểm soát học thuật cần chính giảng viên xem xét và xác nhận trước khi đưa vào bài giảng. Quản trị viên chỉ có quyền xem trạng thái kỹ thuật và không thể duyệt thay.
        </span>
      </div>

      {/* Main Grid: Left 2/3 (Lịch sử xử lý) & Right 1/3 (Chế độ & Tác nhân) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 2/3: Lịch sử xử lý */}
        <div className="lg:col-span-8 min-w-0 space-y-4">
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 sm:p-6 shadow-2xs space-y-4">
            {/* Header & Controls */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#2959ea]" />
                  <h2 className="font-bold text-base text-[#12213b]">
                    Lịch sử xử lý ({monitoring ? filteredJobs.length : '—'})
                  </h2>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* Workflow select */}
                <div className="sm:col-span-4">
                  <select
                    aria-label="Lọc quy trình"
                    value={workflowFilter}
                    onChange={e => setWorkflowFilter(e.target.value)}
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea] outline-hidden cursor-pointer min-h-[44px]"
                  >
                    <option value="all">Tất cả quy trình</option>
                    <option value="analysis">Phân tích bài giảng</option>
                    <option value="tutor">Hỗ trợ học tập</option>
                    <option value="assessment">Tạo bài kiểm tra</option>
                    <option value="planning">Lập kế hoạch bài học</option>
                  </select>
                </div>

                {/* Status select */}
                <div className="sm:col-span-3">
                  <select
                    aria-label="Lọc trạng thái tiến trình"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-2.5 py-2 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea] outline-hidden cursor-pointer min-h-[44px]"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="queued">Đợi xử lý</option>
                    <option value="running">Đang chạy</option>
                    <option value="needs_review">Chờ giảng viên duyệt</option>
                    <option value="completed">Đã hoàn tất</option>
                    <option value="failed">Gặp lỗi</option>
                    <option value="paused">Tạm dừng</option>
                    <option value="cancelled">Đã hủy</option>
                  </select>
                </div>

                {/* Search */}
                <div className="sm:col-span-5 relative">
                  <Search className="w-4 h-4 text-[#5f708b] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={jobQuery}
                    onChange={e => setJobQuery(e.target.value)}
                    placeholder="Tìm theo tên bài giảng hoặc mã..."
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl pl-9 pr-3 py-2 text-sm text-[#12213b] focus:ring-2 focus:ring-[#2959ea] outline-hidden transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Job List */}
            {loading && !monitoring ? (
              <div className="py-12 flex flex-col items-center justify-center text-xs text-[#5f708b] space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[#2959ea]" />
                <span>Đang tải tiến trình hệ thống...</span>
              </div>
            ) : !monitoring ? (
              <p className="py-8 text-sm text-[#5f708b]">Chưa tải được lịch sử xử lý.</p>
            ) : filteredJobs.length === 0 ? (
              <div className="py-10 text-center space-y-2 border border-dashed border-[#e1e7ef] rounded-xl p-6">
                <Activity className="w-8 h-8 text-[#5f708b]/50 mx-auto" />
                <p className="text-xs font-semibold text-[#12213b]">
                  Không tìm thấy tiến trình nào phù hợp.
                </p>
                <p className="text-xs text-[#5f708b]">
                  Thử thay đổi bộ lọc hoặc đợi hệ thống ghi nhận tác vụ mới.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#e1e7ef] text-xs">
                {filteredJobs.slice(0, visibleJobsCount).map(job => {
                  const isExpanded = expandedJobId === job.id;
                  const lectureTitle = getLectureTitle(job.lecture_id);
                  const workflowLabel = adminWorkflowLabels[job.workflow] || job.workflow;

                  return (
                    <div key={job.id} className="py-3.5 space-y-3">
                      {/* Summary Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[#12213b] text-sm">
                              {workflowLabel}
                            </span>
                            <span className="font-mono text-xs text-[#5f708b] bg-slate-100 px-1.5 py-0.2 rounded">
                              {job.id}
                            </span>
                            {getStatusBadge(job.status)}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-[#5f708b] flex-wrap">
                            <span className="truncate max-w-[280px] font-medium text-[#12213b]">
                              {lectureTitle}
                            </span>
                            <span>·</span>
                            <span>Khởi tạo: {formatShortTime(job.created_at)}</span>
                          </div>
                        </div>

                        {/* Expand Button */}
                        <button
                          type="button"
                          onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#e1e7ef] text-[#12213b] hover:bg-slate-50 text-xs font-semibold cursor-pointer min-h-[44px] transition-colors self-start sm:self-auto shrink-0"
                        >
                          <span>{isExpanded ? 'Thu gọn' : 'Xem chi tiết'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Expanded Details Panel */}
                      {isExpanded && (
                        <div className="p-4 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] space-y-3.5 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e7ef] pb-2">
                            <h3 className="font-bold text-[#12213b]">
                              Chi tiết kỹ thuật tiến trình: {workflowLabel}
                            </h3>
                            <span className="text-xs text-[#5f708b]">Chế độ xem chỉ đọc (Read-only)</span>
                          </div>

                          {/* Metadata row */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-[#5f708b] bg-white p-3 rounded-lg border border-[#e1e7ef]">
                            <div>
                              <span className="font-semibold text-[#12213b] block">Bài giảng mục tiêu:</span>
                              <span className="truncate block">{lectureTitle}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-[#12213b] block">Thời điểm bắt đầu:</span>
                              <span>{formatShortTime(job.started_at || job.created_at)}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-[#12213b] block">Người khởi tạo:</span>
                              <span className="break-words">{users.find(u => u.id === job.owner_id)?.full_name || job.owner_id}</span>
                            </div>
                          </div>

                          {/* Error if present */}
                          {job.error && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold block">Thông báo lỗi từ tác nhân:</span>
                                <span>{job.error}</span>
                              </div>
                            </div>
                          )}

                          {/* Privacy Protection for Tutor */}
                          {job.workflow === 'tutor' ? (
                            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1 text-xs text-[#12213b]">
                              <div className="flex items-center gap-2 font-bold text-[#2959ea]">
                                <Lock className="w-4 h-4" />
                                <span>Nội dung hỏi đáp riêng tư đã được ẩn</span>
                              </div>
                              <p className="text-xs text-[#5f708b] leading-relaxed">
                                Nhằm tuân thủ quy định bảo vệ quyền riêng tư học viên, nội dung câu hỏi và câu trả lời của trợ lý học tập không hiển thị trong màn hình quản trị. Quản trị viên chỉ có thể xem thời lượng thực thi và trạng thái tác nhân bên dưới.
                              </p>
                            </div>
                          ) : null}

                          {/* Agent step progress */}
                          <div className="space-y-2">
                            <span className="font-bold text-xs text-[#12213b] block">
                              Tiến trình thực thi của các tác nhân ({job.agents ? job.agents.length : 0} bước):
                            </span>

                            {!job.agents || job.agents.length === 0 ? (
                              <p className="text-xs text-[#5f708b] italic">Chưa ghi nhận bước tác nhân nào.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {job.agents.map((agentRun: AgentRun, idx: number) => {
                                  const name = agentNameMap[agentRun.agent] || configuredAgents.find(a => a.id === agentRun.agent)?.name || agentRun.agent;
                                  return (
                                    <div
                                      key={agentRun.id || idx}
                                      className="p-2.5 bg-white rounded-lg border border-[#e1e7ef] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-2 h-2 rounded-full bg-[#2959ea] shrink-0" />
                                        <div className="min-w-0">
                                          <span className="font-bold text-[#12213b] block truncate">
                                            {name}
                                          </span>
                                          {agentRun.tools && agentRun.tools.length > 0 && (
                                            <span className="text-xs text-[#5f708b]">
                                              Công cụ: {agentRun.tools.map(t => t.name).join(', ')}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-3 shrink-0 text-right">
                                        <span className="text-xs font-mono text-[#5f708b]">
                                          {formatDuration(agentRun.duration_ms)}
                                        </span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                          agentRun.status === 'completed'
                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                            : agentRun.status === 'running'
                                            ? 'bg-blue-50 text-[#2959ea] border border-blue-200'
                                            : agentRun.status === 'needs_review'
                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                            : agentRun.status === 'failed'
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {adminJobStatusLabels[agentRun.status] || agentRun.status}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Show more button if there are more jobs */}
                {filteredJobs.length > visibleJobsCount && (
                  <div className="pt-3 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleJobsCount(prev => prev + 10)}
                      className="px-4 py-2 text-xs font-semibold text-[#2959ea] hover:bg-blue-50 rounded-xl border border-blue-200 transition-colors cursor-pointer min-h-[44px]"
                    >
                      Xem thêm tiến trình (còn {filteredJobs.length - visibleJobsCount})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right 1/3: Chế độ hoạt động & Tác nhân được cấu hình */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card: Chế độ hoạt động */}
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#2959ea]" />
              <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
                Chế độ hoạt động
              </h2>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#e1e7ef]/60">
                <span className="text-[#5f708b]">Chế độ hiện tại:</span>
                <span className="font-bold text-[#12213b]">
                  {monitoring ? 'Minh họa theo quy tắc' : '—'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#e1e7ef]/60">
                <span className="text-[#5f708b]">Kết nối mô hình ngoài:</span>
                <span className="font-semibold text-emerald-700">{monitoring ? 'Chưa kết nối mô hình bên ngoài' : '—'}</span>
              </div>
            </div>

            <div className="pt-2 space-y-2 text-xs">
              <span className="font-bold text-[#12213b] block">Chỉ số tài nguyên đã ghi nhận:</span>

              <div className="bg-[#f6f8fc] rounded-xl p-3 space-y-2 border border-[#e1e7ef]">
                <div className="flex justify-between items-center">
                  <span className="text-[#5f708b]">Lượt gọi công cụ nội bộ:</span>
                  <span className="font-bold text-base text-[#2959ea]">
                    {metrics?.tool_calls ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5f708b]">Lượt gọi mô hình (LLM):</span>
                  <span className="font-bold text-base text-[#12213b]">
                    {metrics?.model_calls ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#5f708b]">Token phát sinh:</span>
                  <span className="font-semibold text-xs text-[#5f708b]">
                    {!metrics ? '—' : metrics.tokens == null ? 'Chưa ghi nhận' : metrics.tokens}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[#e1e7ef]/80">
                  <span className="text-[#5f708b]">Tổng thời gian các bước:</span>
                  <span className="font-mono text-xs text-[#12213b] font-bold">
                    {formatDuration(metrics?.total_latency_ms)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-[#5f708b] italic">
                * Tổng thời gian là tổng độ trễ thực thi các bước tác nhân đã ghi nhận, không phải thời gian máy chủ vận hành liên tục (uptime).
              </p>
            </div>
          </div>

          {/* Card: Tác nhân được cấu hình */}
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-3.5">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#2959ea]" />
              <div>
                <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
                  Tác nhân được cấu hình
                </h2>
                <span className="text-xs text-[#5f708b]">
                  {configuredAgents.length > 0
                    ? `${monitoring ? configuredAgents.length : '—'} tác nhân (1 điều phối + ${configuredAgents.length - 1} chuyên biệt)`
                    : '8 tác nhân'}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              {configuredAgents.map(agent => (
                <div
                  key={agent.id}
                  className="p-2.5 rounded-lg border border-[#e1e7ef] bg-[#f6f8fc] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-[#12213b] block">{agentNameMap[agent.id] || agent.name}</span>
                    <span className="text-xs text-[#5f708b] block">
                      {agent.name} · {agent.tools ? `${agent.tools.length} công cụ` : 'Tác nhân phân tích'}
                    </span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 shrink-0">
                    Đã cấu hình
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Full-Width Card: Nhật ký hoạt động */}
      <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#2959ea]" />
            <div>
              <h2 className="font-bold text-base text-[#12213b]">
                Nhật ký hoạt động hệ thống ({monitoring ? filteredAudit.length : '—'})
              </h2>
              <span className="text-xs text-[#5f708b]">
                Tối đa 100 sự kiện gần nhất được ghi nhận trong cơ sở dữ liệu
              </span>
            </div>
          </div>

          {/* Audit Search & Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#5f708b] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={auditQuery}
                onChange={e => setAuditQuery(e.target.value)}
                placeholder="Tìm nhật ký..."
                className="bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea] outline-hidden min-h-[44px] w-48 sm:w-60"
              />
            </div>

            <select
              aria-label="Lọc vai trò trong nhật ký"
              value={auditRoleFilter}
              onChange={e => setAuditRoleFilter(e.target.value)}
              className="bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-2.5 py-1.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea] outline-hidden cursor-pointer min-h-[44px]"
            >
              <option value="all">Tất cả vai trò</option>
              <option value="admin">Quản trị viên</option>
              <option value="teacher">Giảng viên</option>
              <option value="student">Học viên</option>
            </select>
          </div>
        </div>

        {/* Audit List Table */}
        {filteredAudit.length === 0 ? (
          <div className="text-center py-8 text-[#5f708b] text-xs">
            Chưa có sự kiện nào phù hợp với bộ lọc tìm kiếm.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#e1e7ef] text-[#5f708b] font-semibold">
                  <th className="pb-2.5 pl-1">Thời gian</th>
                  <th className="pb-2.5 px-2">Tài khoản</th>
                  <th className="pb-2.5 px-2">Vai trò</th>
                  <th className="pb-2.5 px-2">Hành động</th>
                  <th className="pb-2.5 pr-1">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1e7ef]">
                {filteredAudit.slice(0, visibleAuditCount).map(entry => {
                  const pres = adminAuditPresentation(entry, users, lectures, courses);

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 pl-1 pr-2 font-mono text-xs text-[#5f708b] whitespace-nowrap">
                        {formatShortTime(entry.created_at)}
                      </td>
                      <td className="py-2.5 px-2 font-bold text-[#12213b] whitespace-nowrap">
                        {pres.actor} {pres.username ? <span className="font-normal font-mono text-[#5f708b] text-xs">(@{pres.username})</span> : null}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-xs font-semibold ${
                          entry.actor_role === 'admin'
                            ? 'bg-purple-50 text-purple-700'
                            : entry.actor_role === 'teacher'
                            ? 'bg-blue-50 text-[#2959ea]'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {pres.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-semibold text-[#12213b] whitespace-nowrap">
                        {pres.title}
                      </td>
                      <td className="py-2.5 pr-1 pl-2 text-[#5f708b] max-w-md truncate" title={pres.detail}>
                        {pres.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredAudit.length > visibleAuditCount && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setVisibleAuditCount(prev => prev + 20)}
              className="px-4 py-2 text-xs font-semibold text-[#2959ea] hover:bg-blue-50 rounded-xl border border-blue-200 transition-colors cursor-pointer min-h-[44px]"
            >
              Xem thêm nhật ký (còn {filteredAudit.length - visibleAuditCount})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
