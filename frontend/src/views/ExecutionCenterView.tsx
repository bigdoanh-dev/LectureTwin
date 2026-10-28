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

  const [selectedAgentId, setSelectedAgentId] = useState<string>('verification');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'input' | 'tools' | 'output' | 'history'>('output');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [selectedEvidenceForPlayer, setSelectedEvidenceForPlayer] = useState<Evidence | null>(null);

  const shouldReduceMotion = useReducedMotion();

  // Find selected agent run from active job
  const selectedAgentRun = activeJob?.agents?.find(a => a.agent === selectedAgentId);

  // Status computation for agents based strictly on activeJob
  const getAgentStatus = (agentName: string) => {
    if (!activeJob) return 'idle';
    const run = activeJob.agents?.find(a => a.agent === agentName);
    return run ? run.status : 'idle';
  };

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

  const handleJobControl = async (action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    if (!activeJob) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await api.controlJob(activeJob.id, action);
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
    } finally {
      setActionLoading(false);
    }
  };

  const lectures = bootstrap?.lectures || [];
  const currentLecture = lectures.find(l => l.id === currentLectureId) || workspace?.lecture;
  const lectureJobs = workspace?.jobs || [];
  const findings = workspace?.findings || [];
  const defaultFirstEvidence = workspace?.evidence?.[0] || null;

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
            Trung tâm tác nhân
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            Mỗi bước có đầu vào, công cụ và bằng chứng rõ ràng.
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {/* Active Job Controls (if running or paused) */}
          {activeJob && (activeJob.status === 'running' || activeJob.status === 'paused') && (
            <div className="flex items-center space-x-1.5 mr-1">
              {activeJob.status === 'running' ? (
                <button
                  type="button"
                  onClick={() => handleJobControl('pause')}
                  disabled={actionLoading}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Tạm dừng</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleJobControl('resume')}
                  disabled={actionLoading}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Tiếp tục</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleJobControl('cancel')}
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
              <span>Lịch sử ({lectureJobs.length})</span>
            </button>

            {/* History Dropdown Menu */}
            {isHistoryOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-xl border border-slate-200 shadow-lg p-2 z-40 space-y-1">
                <div className="text-[11px] font-bold text-slate-500 px-2 py-1 border-b border-slate-100">
                  Chọn lượt chạy phân tích
                </div>
                {lectureJobs.length === 0 ? (
                  <div className="text-xs text-slate-400 p-3 text-center">
                    Chưa có lượt chạy nào
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {lectureJobs.map((j) => {
                      const isSelected = activeJob?.id === j.id;
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
                              {j.workflow} · {new Date(j.created_at).toLocaleTimeString('vi-VN')}
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
            disabled={actionLoading || activeJob?.status === 'running'}
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
          DEMO • Rule-based
        </span>

        <span className="text-xs text-slate-500 font-medium">
          {currentLecture?.sample_attached ? 'Dữ liệu mẫu đã chuẩn bị' : 'Chưa gắn dữ liệu mẫu'}
        </span>
      </div>

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
            {activeJob ? (
              renderStatusBadge(activeJob.status)
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
                  <span className="font-extrabold text-xs">Orchestrator</span>
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5">
                  Điều phối và lưu tiến trình
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
                    <span className="font-bold text-[12px] text-slate-900 truncate">Perception</span>
                  </div>
                </div>

                <div>
                  {renderStatusBadge(getAgentStatus('perception'))}
                </div>

                <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 leading-tight">
                  <div>Đầu vào: <strong className="text-slate-700">Transcript + slide</strong></div>
                  <div>Đầu ra: <strong className="text-slate-700">Nội dung đã cấu trúc</strong></div>
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
                    <span className="font-bold text-[12px] text-slate-900 truncate">Knowledge</span>
                  </div>
                </div>

                <div>
                  {renderStatusBadge(getAgentStatus('knowledge'))}
                </div>

                <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 leading-tight">
                  <div>Đầu vào: <strong className="text-slate-700">Khái niệm + liên kết</strong></div>
                  <div>Đầu ra: <strong className="text-slate-700">Đồ thị tri thức</strong></div>
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
                    <span className="font-bold text-[12px] text-slate-900 truncate">Verification</span>
                  </div>
                </div>

                <div>
                  {renderStatusBadge(getAgentStatus('verification'))}
                </div>

                <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 leading-tight">
                  <div>Đầu vào: <strong className="text-slate-700">Đối chiếu bằng chứng</strong></div>
                  <div>Đầu ra: <strong className="text-slate-700">Kết quả xác minh</strong></div>
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
                    <span className="font-bold text-[12px] text-slate-900 truncate">Pedagogical</span>
                  </div>
                </div>

                <div>
                  {renderStatusBadge(getAgentStatus('pedagogical'))}
                </div>

                <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 leading-tight">
                  <div>Đầu vào: <strong className="text-slate-700">Mục tiêu học tập</strong></div>
                  <div>Đầu ra: <strong className="text-slate-700">Gợi ý sư phạm</strong></div>
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
                  <div className="font-bold text-slate-800 text-[11px]">Planning</div>
                  <div className="text-[10px] text-slate-500">Lập kế hoạch phân tích</div>
                  <div className="mt-1">{renderStatusBadge(getAgentStatus('planning'))}</div>
                </div>

                <div
                  onClick={() => setSelectedAgentId('tutor')}
                  className={`p-2.5 rounded-xl border text-center text-xs cursor-pointer transition-all ${
                    selectedAgentId === 'tutor' ? 'bg-blue-50 border-blue-400' : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-slate-800 text-[11px]">Tutor</div>
                  <div className="text-[10px] text-slate-500">Sinh hoạt động học tập</div>
                  <div className="mt-1">{renderStatusBadge(getAgentStatus('tutor'))}</div>
                </div>

                <div
                  onClick={() => setSelectedAgentId('assessment')}
                  className={`p-2.5 rounded-xl border text-center text-xs cursor-pointer transition-all ${
                    selectedAgentId === 'assessment' ? 'bg-blue-50 border-blue-400' : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100'
                  }`}
                >
                  <div className="font-bold text-slate-800 text-[11px]">Assessment</div>
                  <div className="text-[10px] text-slate-500">Tạo câu hỏi & đánh giá</div>
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
              <h3 className="font-black text-sm text-slate-900 capitalize">
                {selectedAgentId} Agent
              </h3>
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
              Đầu vào
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
              Công cụ ({selectedAgentRun?.tools?.length || 0})
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
              Lịch sử
            </button>
          </div>

          {/* Tab Content Display */}
          {activeInspectorTab === 'output' && (
            <div className="space-y-3">
              {!selectedAgentRun ? (
                <div className="text-xs text-slate-400 py-6 text-center">
                  Tác nhân này chưa được kích hoạt trong lượt chạy hiện tại. Bấm "Bắt đầu phân tích" để chạy workflow.
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
                                Xem mốc dẫn chứng
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

                  {/* Perception Agent: Keyframes and metadata */}
                  {selectedAgentId === 'perception' && selectedAgentRun.output?.result && (
                    <div className="space-y-2 text-xs">
                      <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                        <div>Thời lượng video: <strong>{selectedAgentRun.output.result.duration_seconds} giây</strong></div>
                        <div>Phân đoạn transcript: <strong>{selectedAgentRun.output.result.transcript_segments || 0}</strong></div>
                        <div>Trang slide: <strong>{selectedAgentRun.output.result.slide_pages || 0}</strong></div>
                        <div>Nguồn ngữ nghĩa: <strong>{selectedAgentRun.output.result.semantic_source || 'Chuẩn bị sẵn'}</strong></div>
                      </div>

                      {selectedAgentRun.output.result.keyframes && selectedAgentRun.output.result.keyframes.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-slate-600">Khung hình chính trích xuất:</span>
                          <div className="grid grid-cols-3 gap-2">
                            {selectedAgentRun.output.result.keyframes.map((kf: any, i: number) => (
                              <div key={i} className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-video relative">
                                <img src={kf.url} alt={`Frame ${kf.timestamp}s`} className="w-full h-full object-cover" />
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
                    <div className="p-3 bg-slate-50 rounded-xl text-xs font-mono text-slate-800 space-y-1 max-h-48 overflow-y-auto">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(selectedAgentRun.output.result || selectedAgentRun.output, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Action Buttons for Teacher Review when Verification needs review */}
                  {selectedAgentId === 'verification' && (
                    <div className="flex items-center space-x-2.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsReviewModalOpen(true)}
                        disabled={actionLoading || role !== 'teacher'}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Xác nhận bằng chứng</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleJobControl('retry')}
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
            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 space-y-1 font-mono max-h-56 overflow-y-auto">
              {selectedAgentRun?.input ? (
                <pre className="whitespace-pre-wrap">{JSON.stringify(selectedAgentRun.input, null, 2)}</pre>
              ) : (
                <span className="text-slate-400 font-sans italic">Chưa có đầu vào được ghi nhận cho tác nhân này.</span>
              )}
            </div>
          )}

          {activeInspectorTab === 'tools' && (
            <div className="space-y-2 text-xs">
              {selectedAgentRun?.tools && selectedAgentRun.tools.length > 0 ? (
                selectedAgentRun.tools.map((t, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-800">Tool: {t.name}</span>
                      <div className="text-[11px] text-slate-500">
                        Thời gian: {t.duration_ms ?? 0}ms · Trạng thái: {t.status}
                      </div>
                    </div>
                    <span className="text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded">
                      {t.status === 'completed' ? '200 OK' : t.status}
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
              <div>
                Lượt chạy hiện tại: <span className="font-mono text-slate-800 font-bold">{activeJob?.id || 'Chưa chọn'}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Tổng số lượt chạy của bài giảng: {lectureJobs.length}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM-RIGHT: Lecture Twin Summary */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3.5">
          <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
            <FileText className="w-4 h-4 text-blue-600" />
            <h3 className="font-extrabold text-sm text-slate-900">
              Lecture Twin
            </h3>
          </div>

          {/* 4 State Rows */}
          <div className="space-y-2">
            {/* 1. Kế hoạch (Planned) */}
            <div
              onClick={() => setCurrentView('twin')}
              className="p-3 rounded-xl border border-slate-200/90 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between text-xs"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-800">Kế hoạch</span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-500">
                <span>{workspace?.planned?.objectives?.length || 3} mục tiêu học tập</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 2. Quan sát (Observed) */}
            <div
              onClick={() => setCurrentView('graph')}
              className="p-3 rounded-xl border border-slate-200/90 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between text-xs"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-800">Quan sát</span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-500">
                <span>{workspace?.twin?.observed?.verified ?? 0}/{workspace?.twin?.observed?.concepts ?? 0} khái niệm xác minh</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 3. Đánh giá (Evaluated) */}
            <div
              onClick={() => setCurrentView('assessment')}
              className="p-3 rounded-xl border border-slate-200/90 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between text-xs"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <BarChart2 className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-800">Đánh giá</span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-500">
                <span>{workspace?.twin?.evaluated?.attempt_count ? `${workspace.twin.evaluated.attempt_count} lượt làm bài` : 'Chưa có bài nộp'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 4. Kịch bản (Scenario) */}
            <div
              onClick={() => setCurrentView('simulation')}
              className="p-3 rounded-xl border border-slate-200/90 hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between text-xs"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <FileCode className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-800">Kịch bản</span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-500">
                <span>{workspace?.scenarios?.length ? `${workspace.scenarios.length} kịch bản mô phỏng` : 'Chưa thay đổi bản gốc'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Honest Footer */}
      <footer className="pt-4 border-t border-slate-200 text-center text-xs text-slate-400 font-medium">
        Chế độ demo xác định · Không có ASR/Vision/LLM đang hoạt động · Giảng viên duyệt trước khi xuất bản
      </footer>

      {/* Review Modal Dialog */}
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onConfirm={handleBulkReview}
      />
    </motion.div>
  );
};
