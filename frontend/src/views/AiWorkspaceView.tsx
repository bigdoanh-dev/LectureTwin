import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  FileCheck2,
  Clock,
  HelpCircle,
  Edit3,
  Save,
  X,
  RefreshCw,
  Check,
  Video,
  FileText,
  Link as LinkIcon,
  ChevronRight,
  ChevronDown,
  Info,
  Eye,
  AlertCircle,
  PlayCircle,
  Sliders
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VideoPlayer } from '../components/VideoPlayer';
import { ReviewModal } from '../components/ReviewModal';
import { ModalDialog } from '../components/ModalDialog';
import { api } from '../api';
import {
  buildLessonSummary,
  lessonWorkflow,
  analysisStages,
  formatEvidenceLabel,
  formatTimestamp,
  currentAssessments
} from '../presentation';
import { Evidence, AssessmentQuestion, ScenarioComparison } from '../types';

export const AiWorkspaceView: React.FC = () => {
  const {
    workspace,
    bootstrap,
    currentLectureId,
    selectLecture,
    switchRole,
    setCurrentView,
    seekVideoTo,
    videoSeekTarget,
    clearVideoSeek,
    refreshWorkspace,
    refreshBootstrap,
    setActiveJob,
    activeJob,
    loading
  } = useApp();

  const shouldReduceMotion = useReducedMotion();
  const workflow = lessonWorkflow(workspace);
  const summaryRows = buildLessonSummary(workspace);
  const stages = analysisStages(workspace);

  // Local UI State
  const [activeTab, setActiveTab] = useState<'summary' | 'questions' | 'improve'>('summary');
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isHowDemoWorksOpen, setIsHowDemoWorksOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Concept edit state
  const [editingConceptId, setEditingConceptId] = useState<string | null>(null);
  const [editConceptLabel, setEditConceptLabel] = useState('');
  const [editConceptDesc, setEditConceptDesc] = useState('');

  // Assessment edit state
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState('');
  const [editOptions, setEditOptions] = useState<Array<{ id: string; text: string }>>([]);
  const [editCorrectId, setEditCorrectId] = useState('');
  const [editExplanation, setEditExplanation] = useState('');

  // Real What-if Simulation state (Review line 30: NEVER fabricate results without API)
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simComparison, setSimComparison] = useState<ScenarioComparison | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  const assessmentAbortRef = useRef<AbortController | null>(null);
  const simAbortRef = useRef<AbortController | null>(null);
  const reviewBtnRef = useRef<HTMLButtonElement | null>(null);
  const helpBtnRef = useRef<HTMLButtonElement | null>(null);

  // Reset local state on lecture change
  useEffect(() => {
    setSelectedEvidence(null);
    setEditingConceptId(null);
    setEditingQuestionId(null);
    setSelectedAssessmentId('');
    setActionMessage(null);
    setSimComparison(null);
    setSimError(null);

    if (assessmentAbortRef.current) {
      assessmentAbortRef.current.abort();
      assessmentAbortRef.current = null;
    }
    if (simAbortRef.current) {
      simAbortRef.current.abort();
      simAbortRef.current = null;
    }

    return () => {
      if (assessmentAbortRef.current) {
        assessmentAbortRef.current.abort();
        assessmentAbortRef.current = null;
      }
      if (simAbortRef.current) {
        simAbortRef.current.abort();
        simAbortRef.current = null;
      }
    };
  }, [currentLectureId]);

  // Default first cited source
  const defaultEvidence = summaryRows[0]?.evidence || workspace?.evidence?.find(e => e.valid) || null;
  const currentEvidence = selectedEvidence || defaultEvidence;

  // Current assessments for active lecture version, newest first (Review line 36)
  const assessments = currentAssessments(workspace);
  const activeAssessment = assessments.find(a => a.id === selectedAssessmentId) || assessments[0] || null;

  // Real planned segments for tab Cải tiến
  const plannedSegments = workspace?.planned?.segments || workspace?.twin?.planned?.segments || [];
  const totalPlannedMinutes = workspace?.lecture.total_minutes || 50;

  // Start analysis handler
  const handleStartAnalysis = async () => {
    if (!currentLectureId) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const job = await api.startAnalysis(currentLectureId);
      setActiveJob(job);
      await refreshWorkspace();
    } catch (err: any) {
      setActionMessage(err.detail || err.message || 'Không thể khởi động phân tích.');
    } finally {
      setActionLoading(false);
    }
  };

  // Attach sample handler
  const handleAttachSample = async () => {
    if (!currentLectureId) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      await api.attachSample(currentLectureId);
      await Promise.all([refreshWorkspace(), refreshBootstrap()]);
    } catch (err: any) {
      setActionMessage(err.detail || err.message || 'Không thể gắn học liệu mẫu.');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm review handler
  const handleConfirmReview = async (note: string) => {
    if (!currentLectureId) return;
    setActionLoading(true);
    try {
      await api.bulkReview(currentLectureId, note);
      if (workflow.job?.id) {
        try {
          const updated = await api.getJob(workflow.job.id);
          setActiveJob(updated);
        } catch { /* silent */ }
      }
      await Promise.all([refreshWorkspace(), refreshBootstrap()]);
    } catch (err: any) {
      // Re-throw so ReviewModal stays open and displays the error!
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  // Publish lecture handler (Uses royal blue CTA per review point 32)
  const handlePublishLecture = async () => {
    if (!currentLectureId) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      await api.publishLecture(currentLectureId);
      await Promise.all([refreshWorkspace(), refreshBootstrap()]);
      setActionMessage('Đã xuất bản bài giảng thành công! Học viên đã có thể xem bài.');
    } catch (err: any) {
      setActionMessage(err.detail || err.message || 'Không thể xuất bản bài giảng.');
    } finally {
      setActionLoading(false);
    }
  };

  // Save concept edit handler (only allowed during needs_review)
  const handleSaveConcept = async (conceptId: string) => {
    if (!currentLectureId) return;
    setActionLoading(true);
    try {
      await api.patchConcept(currentLectureId, conceptId, {
        label: editConceptLabel.trim(),
        description: editConceptDesc.trim(),
      });
      setEditingConceptId(null);
      await refreshWorkspace();
    } catch (err: any) {
      setActionMessage(err.detail || err.message || 'Không thể cập nhật khái niệm.');
    } finally {
      setActionLoading(false);
    }
  };

  // Generate assessment with AbortController
  const handleGenerateAssessment = async () => {
    if (!currentLectureId) return;
    if (assessmentAbortRef.current) {
      assessmentAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    assessmentAbortRef.current = abortCtrl;

    setActionLoading(true);
    setActionMessage(null);
    try {
      const initialJob = await api.generateAssessment(currentLectureId);
      setActiveJob(initialJob);
      const finishedJob = await api.waitForJob(initialJob, abortCtrl.signal);
      if (finishedJob.status === 'completed') {
        await refreshWorkspace();
        if (finishedJob.result?.assessment_id) {
          setSelectedAssessmentId(finishedJob.result.assessment_id);
        }
        setActionMessage('Đã tạo câu hỏi từ bài giảng thành công!');
      } else {
        setActionMessage(finishedJob.error || 'Không thể tạo đề kiểm tra.');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setActionMessage(err.detail || err.message || 'Lỗi khi tạo câu hỏi.');
    } finally {
      setActionLoading(false);
    }
  };

  // Start question edit
  const handleStartEditQuestion = (q: AssessmentQuestion) => {
    setEditingQuestionId(q.id);
    setEditQuestionText(q.text);
    setEditOptions(q.options.map(opt => ({ id: opt.id, text: opt.text })));
    setEditCorrectId(q.correct_option_id || q.options[0]?.id || '');
    setEditExplanation(q.explanation || '');
  };

  // Save question edit via api.patchAssessment
  const handleSaveQuestion = async () => {
    if (!activeAssessment || !editingQuestionId) return;
    setActionLoading(true);
    try {
      const updatedQuestions = activeAssessment.questions.map(q => {
        if (q.id === editingQuestionId) {
          return {
            ...q,
            text: editQuestionText.trim(),
            options: editOptions,
            correct_option_id: editCorrectId,
            explanation: editExplanation.trim()
          };
        }
        return q;
      });

      await api.patchAssessment(activeAssessment.id, {
        questions: updatedQuestions
      });
      setEditingQuestionId(null);
      await refreshWorkspace();
      setActionMessage('Đã cập nhật câu hỏi thành công.');
    } catch (err: any) {
      setActionMessage(err.detail || err.message || 'Không thể lưu câu hỏi.');
    } finally {
      setActionLoading(false);
    }
  };

  // Publish assessment questions
  const handlePublishAssessment = async (assessmentId: string) => {
    setActionLoading(true);
    try {
      await api.publishAssessment(assessmentId);
      await refreshWorkspace();
      setActionMessage('Đã xuất bản bộ câu hỏi kiểm tra thành công!');
    } catch (err: any) {
      setActionMessage(err.detail || err.message || 'Không thể xuất bản câu hỏi.');
    } finally {
      setActionLoading(false);
    }
  };

  // Run real What-If simulation via API (Review line 30: working action, no fabricated data)
  const handleRunSimulation = async () => {
    if (!currentLectureId || simRunning) return;
    if (simAbortRef.current) {
      simAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    simAbortRef.current = abortCtrl;

    setSimRunning(true);
    setSimError(null);
    try {
      const initialJob = await api.runScenario(currentLectureId, {
        title: 'Kịch bản tăng cường thực hành DFS',
        request: 'Thêm 10 phút bài tập thực hành DFS nhưng không tăng tổng thời lượng bài giảng',
        add_practice_minutes: 10,
        total_limit: totalPlannedMinutes,
      });

      const finishedJob = await api.waitForJob(initialJob, abortCtrl.signal);
      if (finishedJob.status === 'completed' && finishedJob.result?.comparison) {
        setSimComparison(finishedJob.result.comparison);
      } else {
        setSimError(finishedJob.error || 'Không thể hoàn tất mô phỏng kịch bản.');
      }
      await refreshWorkspace();
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setSimError(err.detail || err.message || 'Lỗi khi chạy mô phỏng kịch bản.');
    } finally {
      setSimRunning(false);
    }
  };

  // Select citation & seek video
  const handleSelectEvidence = (ev: Evidence | null) => {
    if (!ev) return;
    setSelectedEvidence(ev);
    if (typeof ev.start === 'number' && ev.start >= 0) {
      seekVideoTo(ev.start);
    }
  };

  // Honest media caption
  const isSample = Boolean(workspace?.lecture.sample_attached);
  const videoCaption = isSample
    ? `Học liệu thực hành · 18:29 · ${workspace?.transcript.length ?? 0} ghi chú theo mốc`
    : (workspace?.assets.some(a => a.kind === 'video')
      ? 'Video bài giảng đã tải lên'
      : 'Học liệu bài giảng');

  // Step 3 label per Review line 26: use workflow.reviewed -> 'Đã duyệt, chờ xuất bản'
  const step3Label = workflow.published
    ? 'Đã hoàn tất'
    : (workflow.reviewed ? 'Đã duyệt, chờ xuất bản' : (workflow.canReview ? 'Kiểm tra và hoàn thiện' : 'Chưa mở'));

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      {/* 1. Top Section: Heading, Subtitle & Action */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-[#12213b] tracking-tight leading-tight">
            Từ bài giảng đến trợ lý học tập
          </h1>
          <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
            {isSample
              ? 'Gợi ý minh họa dựa trên ghi chú của học liệu thực hành; giảng viên kiểm tra trước khi xuất bản.'
              : 'AI đề xuất nội dung từ bài giảng và tài liệu tải lên; giảng viên kiểm tra trước khi xuất bản.'}
          </p>
        </div>

        {/* Action: Chuyển sang tài khoản học viên */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => switchRole('student')}
            disabled={!workflow.published || actionLoading}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 border transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
              workflow.published
                ? 'bg-white text-[#2959ea] border-[#2959ea] hover:bg-blue-50/60 shadow-2xs'
                : 'bg-white text-[#5f708b] border-[#e1e7ef] opacity-60 cursor-not-allowed'
            }`}
            title={workflow.published ? 'Chuyển sang tài khoản học viên' : 'Chỉ khả dụng sau khi bài giảng đã xuất bản'}
          >
            <Eye className="w-4 h-4 text-[#2959ea]" />
            <span>Chuyển sang tài khoản học viên</span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {actionMessage && (
        <div className="bg-blue-50 border border-blue-200 text-[#12213b] text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-[#2959ea] hover:text-blue-800 p-1 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. White Lecture / 3-Step Rail Row */}
      {/* Review line 34: At < 640px use THREE FULL-WIDTH ROWS, hide connector. Desktop flex-1 fills remaining width */}
      <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
        {/* Left: Lecture Selector */}
        <div className="shrink-0 min-w-0 sm:w-80">
          <div className="relative flex items-center">
            <FileText className="w-4 h-4 text-[#2959ea] absolute left-3 pointer-events-none" />
            <select
              id="lecture-picker"
              value={currentLectureId}
              onChange={(e) => selectLecture(e.target.value)}
              disabled={actionLoading}
              className="w-full bg-white border border-[#e1e7ef] rounded-xl pl-9 pr-8 py-2.5 text-xs sm:text-sm font-bold text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] cursor-pointer disabled:opacity-60 appearance-none shadow-2xs"
            >
              {bootstrap?.lectures.map((lec) => (
                <option key={lec.id} value={lec.id}>
                  {lec.title} {lec.status === 'published' ? '• (Đã xuất bản)' : `• (v${lec.version})`}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#5f708b] absolute right-3 pointer-events-none" />
          </div>
        </div>

        {/* Right: 3-Step Workflow Rail (Full width rows on mobile, flex-1 fills desktop) */}
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-3 sm:gap-4 lg:gap-6 text-xs font-semibold">
          {/* Step 1: Học liệu */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              workflow.hasSources ? 'bg-[#2959ea] text-white' : 'bg-slate-200 text-[#5f708b]'
            }`}>
              {workflow.hasSources ? <Check className="w-4 h-4 stroke-[3]" /> : '1'}
            </div>
            <div>
              <span className="font-bold text-[#12213b] block">1 Học liệu</span>
              <span className="text-xs text-[#5f708b] font-normal">
                {workflow.hasSources ? 'Đã tải lên' : 'Chưa có tệp'}
              </span>
            </div>
          </div>

          <div className={`hidden sm:block flex-1 max-w-[60px] h-[2px] ${workflow.analyzed || workflow.running ? 'bg-[#2959ea]' : 'bg-[#e1e7ef]'}`} />

          {/* Step 2: AI xử lý */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              workflow.analyzed
                ? 'bg-[#2959ea] text-white'
                : (workflow.running ? 'bg-blue-100 text-[#2959ea]' : 'bg-slate-200 text-[#5f708b]')
            }`}>
              {workflow.analyzed ? (
                <Check className="w-4 h-4 stroke-[3]" />
              ) : workflow.running ? (
                <RefreshCw className="w-4 h-4 animate-spin text-[#2959ea]" />
              ) : (
                '2'
              )}
            </div>
            <div>
              <span className={`font-bold block ${workflow.running ? 'text-[#2959ea]' : 'text-[#12213b]'}`}>
                2 AI xử lý
              </span>
              <span className="text-xs text-[#5f708b] font-normal">
                {workflow.analyzed ? 'Đã có đề xuất' : workflow.running ? 'Đang phân tích' : 'Chờ xử lý'}
              </span>
            </div>
          </div>

          <div className={`hidden sm:block flex-1 max-w-[60px] h-[2px] ${workflow.published || workflow.reviewed ? 'bg-[#2959ea]' : 'bg-[#e1e7ef]'}`} />

          {/* Step 3: Bạn duyệt */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              workflow.published || workflow.reviewed
                ? 'bg-[#2959ea] text-white'
                : (workflow.canReview ? 'bg-[#2959ea] text-white' : 'bg-slate-200 text-[#5f708b]')
            }`}>
              {workflow.published || workflow.reviewed ? (
                <Check className="w-4 h-4 stroke-[3]" />
              ) : (
                '3'
              )}
            </div>
            <div>
              <span className={`font-bold block ${workflow.canReview || workflow.reviewed ? 'text-[#2959ea]' : 'text-[#12213b]'}`}>
                3 Bạn duyệt
              </span>
              <span className="text-xs text-[#5f708b] font-normal">
                {step3Label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace Grid: Left 43% (Bài giảng gốc) vs Right 57% (Đề xuất từ học liệu) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT 43% (~5 cols out of 12) - MATCHING TEACHER CONCEPT PNG */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3.5">
          <h2 className="font-bold text-[20px] text-[#12213b]">
            Học liệu thực hành
          </h2>

          {/* Embedded Native Video Player (NO nested card wrapper) */}
          <VideoPlayer
            lectureId={currentLectureId}
            variant="embedded"
            seekTarget={videoSeekTarget}
            onClearSeekTarget={clearVideoSeek}
            sampleAttached={workspace?.lecture.sample_attached}
            selectedEvidence={selectedEvidence}
            defaultEvidence={defaultEvidence}
          />

          {/* Video Caption */}
          <div className="text-xs text-[#5f708b] font-medium">
            {videoCaption}
          </div>

          {/* Selected Citation Quote Box */}
          <div className="bg-[#f0f5ff] rounded-xl p-4 border border-blue-100 space-y-1.5">
            <div className="text-xs font-bold text-[#12213b]">
              {isSample
                ? 'Ghi chú học liệu thực hành'
                : (currentEvidence?.kind === 'slide' ? 'Trích dẫn trang slide' : 'Trích đoạn nguồn bài giảng')}
            </div>

            {currentEvidence ? (
              <>
                <p className="text-sm leading-[22px] text-[#12213b] font-medium">
                  “{currentEvidence.text}”
                </p>
                <div className="text-xs text-[#5f708b] font-medium pt-0.5">
                  {formatEvidenceLabel(currentEvidence)} · {isSample
                    ? 'Diễn giải thủ công từ phụ đề tự động tiếng Anh; chưa chạy nhận dạng giọng nói hoặc hình ảnh'
                    : (currentEvidence.kind === 'slide' ? 'Nội dung trang slide đã chuẩn bị' : 'Nội dung đối chiếu từ bài giảng đã tải lên')}
                </div>
              </>
            ) : (
              <p className="text-xs text-[#5f708b] italic">
                {isSample
                  ? 'Chọn một ý chính bên phải để mở học liệu tại đúng mốc tương ứng.'
                  : 'Bấm vào liên kết mốc thời gian ở cột bên phải để đối chiếu trên bài giảng.'}
              </p>
            )}
          </div>

          {/* Bottom Caption matching concept */}
          <div className="flex items-center gap-2 text-xs text-[#5f708b] pt-1">
            <FileText className="w-4 h-4 text-[#5f708b] shrink-0" />
            <span>
              {isSample
                ? 'Học liệu thực hành gồm video và ghi chú theo mốc thời gian.'
                : 'Video và tài liệu bài giảng đã tải lên.'}
            </span>
          </div>
        </div>

        {/* RIGHT 57% (~7 cols out of 12) - MATCHING TEACHER CONCEPT PNG */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-4">
          <h2 className="font-bold text-[20px] text-[#12213b]">
            Đề xuất từ học liệu
          </h2>

          {/* Plain Underline Tabs across panel (14px, min-h 44px touch) */}
          <div className="flex items-center space-x-6 border-b border-[#e1e7ef] text-sm font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`min-h-[44px] pb-2.5 flex items-center transition-colors cursor-pointer relative focus-visible:outline-hidden focus-visible:text-[#2959ea] ${
                activeTab === 'summary'
                  ? 'text-[#2959ea] font-bold'
                  : 'text-[#5f708b] hover:text-[#12213b]'
              }`}
            >
              <span>Ý chính</span>
              {activeTab === 'summary' && (
                <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-[#2959ea] rounded-t-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('questions')}
              className={`min-h-[44px] pb-2.5 flex items-center transition-colors cursor-pointer relative focus-visible:outline-hidden focus-visible:text-[#2959ea] ${
                activeTab === 'questions'
                  ? 'text-[#2959ea] font-bold'
                  : 'text-[#5f708b] hover:text-[#12213b]'
              }`}
            >
              <span>Câu hỏi</span>
              {activeTab === 'questions' && (
                <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-[#2959ea] rounded-t-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('improve')}
              className={`min-h-[44px] pb-2.5 flex items-center transition-colors cursor-pointer relative focus-visible:outline-hidden focus-visible:text-[#2959ea] ${
                activeTab === 'improve'
                  ? 'text-[#2959ea] font-bold'
                  : 'text-[#5f708b] hover:text-[#12213b]'
              }`}
            >
              <span>Cải tiến</span>
              {activeTab === 'improve' && (
                <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-[#2959ea] rounded-t-full" />
              )}
            </button>
          </div>

          {/* TAB 1: Ý CHÍNH */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {/* Case A: No Sources Attached */}
              {!workflow.hasSources && (
                <div className="text-center py-8 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-[#2959ea] flex items-center justify-center mx-auto">
                    <Video className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-[#12213b] text-base">
                    Chưa có học liệu bài giảng
                  </h3>
                  <p className="text-xs sm:text-sm text-[#5f708b] max-w-md mx-auto leading-relaxed">
                    Video và chú giải là đầu vào; hệ thống đề xuất ý chính, câu hỏi và nguồn để bạn kiểm tra.
                  </p>
                  <button
                    type="button"
                    onClick={handleAttachSample}
                    disabled={actionLoading}
                    className="min-h-[44px] px-5 py-2.5 bg-[#2959ea] hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                  >
                    {actionLoading ? 'Đang gắn học liệu...' : 'Gắn học liệu mẫu BFS & DFS'}
                  </button>
                </div>
              )}

              {/* Case B: Missing Transcript for uploaded video */}
              {workflow.hasSources && !workflow.hasText && !workflow.running && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-amber-950">
                        Cần bổ sung bản chép lời (Transcript)
                      </h4>
                      <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                        Video đã tải lên. Bản demo chưa nhận dạng lời nói tự động (ASR); hãy thêm bản chép lời hoặc slide để AI tạo đề xuất có căn cứ.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentView('lectures')}
                    className="min-h-[40px] px-4 py-2 bg-white text-amber-900 border border-amber-300 font-semibold text-xs rounded-xl hover:bg-amber-100 transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    Thêm bản chép lời ở trang Bài giảng →
                  </button>
                </div>
              )}

              {/* Case C: Sources Ready, No Analysis Run Yet */}
              {workflow.hasSources && workflow.hasText && !workflow.running && !workflow.analyzed && (
                <div className="space-y-4">
                  <div className="space-y-2.5">
                    <div className="p-3.5 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] flex items-start gap-3">
                      <FileCheck2 className="w-5 h-5 text-[#2959ea] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-sm text-[#12213b]">Tóm tắt có dẫn nguồn</h4>
                        <p className="text-xs sm:text-sm text-[#5f708b] mt-0.5 leading-relaxed">
                          Dò từ khóa trong ghi chú đã có, rồi gắn ý chính với mốc video để giảng viên đối chiếu. Bản demo chưa tự nghe hoặc đọc hình ảnh.
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] flex items-start gap-3">
                      <HelpCircle className="w-5 h-5 text-[#2959ea] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-sm text-[#12213b]">Câu hỏi từ bài giảng</h4>
                        <p className="text-xs sm:text-sm text-[#5f708b] mt-0.5 leading-relaxed">
                          Soạn câu hỏi nháp từ nội dung và đáp án mẫu để giảng viên xem lại trước khi giao; kết quả không tự kết luận học viên đã hiểu bài.
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-[#2959ea] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-sm text-[#12213b]">Trợ lý cho học viên</h4>
                        <p className="text-xs sm:text-sm text-[#5f708b] mt-0.5 leading-relaxed">
                          Giúp học viên tìm câu trả lời trong nội dung đã được giảng viên duyệt và mở lại mốc nguồn liên quan.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleStartAnalysis}
                      disabled={actionLoading}
                      className="w-full min-h-[44px] py-3 bg-[#2959ea] hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                    >
                      {actionLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang bắt đầu xử lý...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Chạy thử với bài giảng mẫu</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Case D: Running Analysis */}
              {workflow.running && (
                <div className="bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs sm:text-sm font-bold text-[#12213b]">
                      <RefreshCw className="w-4 h-4 text-[#2959ea] animate-spin" />
                      <span>Đang phân tích học liệu bài giảng...</span>
                    </div>
                    {activeJob && (
                      <button
                        type="button"
                        onClick={() => api.controlJob(activeJob.id, 'cancel').then(() => refreshWorkspace())}
                        className="text-xs text-red-600 hover:underline cursor-pointer"
                      >
                        Hủy tiến trình
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 text-xs sm:text-sm text-[#12213b]">
                    {stages.map((stage, sIdx) => {
                      const isDone = stage.status === 'completed';
                      const isRunning = stage.status === 'running';
                      const isFailed = stage.status === 'failed';
                      return (
                        <div key={stage.id} className="flex items-center gap-2.5 font-medium">
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : isRunning ? (
                            <RefreshCw className="w-4 h-4 text-[#2959ea] animate-spin shrink-0" />
                          ) : isFailed ? (
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <span className={isDone || isRunning ? 'text-[#12213b]' : 'text-[#5f708b]'}>
                            {sIdx + 1}. {stage.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Case E: Analyzed Rows matching Concept PNG layout (Review line 32 typography) */}
              {workflow.analyzed && !workflow.running && (
                <div className="space-y-4">
                  <div className="divide-y divide-[#e1e7ef]">
                    {summaryRows.map((row, idx) => (
                      <div
                        key={row.id}
                        className="py-3.5 flex items-start justify-between gap-3 group"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Number badge */}
                          <div className="w-6 h-6 rounded-full bg-[#f6f8fc] border border-[#e1e7ef] text-[#12213b] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </div>

                          {editingConceptId === row.id ? (
                            /* Concept inline edit (canReview only) */
                            <div className="space-y-2 flex-1">
                              <input
                                type="text"
                                value={editConceptLabel}
                                onChange={(e) => setEditConceptLabel(e.target.value)}
                                className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-lg px-2.5 py-1 text-sm font-bold text-[#12213b]"
                              />
                              <textarea
                                rows={2}
                                value={editConceptDesc}
                                onChange={(e) => setEditConceptDesc(e.target.value)}
                                className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-lg p-2 text-sm text-[#12213b]"
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setEditingConceptId(null)}
                                  className="px-2.5 py-1 text-xs text-[#5f708b] hover:bg-slate-100 rounded-md"
                                >
                                  Hủy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveConcept(row.id)}
                                  className="px-3 py-1 text-xs bg-[#2959ea] text-white font-semibold rounded-md"
                                >
                                  Lưu
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-base leading-[24px] text-[#12213b]">
                                  {row.title}
                                </h3>
                                {workflow.canReview && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingConceptId(row.id);
                                      setEditConceptLabel(row.title);
                                      setEditConceptDesc(row.description);
                                    }}
                                    className="text-slate-400 hover:text-[#2959ea] min-h-[44px] min-w-[44px] flex items-center justify-center p-1 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2959ea] rounded-lg"
                                    title="Sửa khái niệm"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-sm leading-[22px] text-[#5f708b] mt-0.5">
                                {row.description}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Right: Timestamp link + Chevron right matching concept PNG */}
                        {row.evidence && (
                          <button
                            type="button"
                            onClick={() => handleSelectEvidence(row.evidence)}
                            className="min-h-[44px] flex items-center gap-1.5 text-xs sm:text-sm text-[#2959ea] hover:underline font-semibold shrink-0 cursor-pointer pt-0.5 group-hover:text-blue-800 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2959ea] rounded-md px-2"
                            title={row.evidence.kind === 'slide' ? 'Bấm để xem trang slide tương ứng' : 'Bấm để tua video đến mốc này'}
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                            <span>
                              {isSample
                                ? row.evidence.source_type === 'youtube_caption_annotation'
                                  ? `Học liệu thực hành (${formatEvidenceLabel(row.evidence)})`
                                  : `Học liệu thực hành (${formatEvidenceLabel(row.evidence)})`
                                : (row.evidence.kind === 'slide' ? `Slide trang ${row.evidence.slide_page ?? 1}` : formatEvidenceLabel(row.evidence))}
                            </span>
                            <ChevronRight className="w-4 h-4 text-[#5f708b] group-hover:text-[#2959ea]" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Amber Warning Box matching concept PNG */}
                  {workflow.unsupportedCount > 0 && workflow.canReview && (
                    <div className="bg-[#fff9eb] border border-[#fde8b3] rounded-xl p-4 flex items-start gap-3 text-xs sm:text-sm">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-amber-950">
                          {workflow.unsupportedCount} nội dung chưa đủ nguồn
                        </div>
                        <p className="text-amber-900 mt-0.5 leading-relaxed">
                          Chưa đưa nhận định về độ phức tạp vào bản giao cho học viên.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Actions Row matching concept PNG */}
                  <div className="pt-2 space-y-2">
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      {workflow.canReview ? (
                        <>
                          <button
                            ref={reviewBtnRef}
                            type="button"
                            onClick={() => setIsReviewModalOpen(true)}
                            disabled={actionLoading}
                            className="w-full sm:flex-1 min-h-[44px] py-2.5 px-5 bg-[#2959ea] hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>Duyệt nội dung</span>
                          </button>
                          <button
                            type="button"
                            disabled
                            className="w-full sm:flex-1 min-h-[44px] py-2.5 px-5 bg-[#eef2f6] text-[#5f708b] font-semibold text-xs sm:text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-not-allowed"
                            title="Cần duyệt nội dung trước khi xuất bản"
                          >
                            <FileCheck2 className="w-4 h-4 text-[#5f708b]" />
                            <span>Xuất bản cho học viên</span>
                          </button>
                        </>
                      ) : workflow.canPublish ? (
                        /* Review line 32: Primary publish blue consistent with concept */
                        <button
                          type="button"
                          onClick={handlePublishLecture}
                          disabled={actionLoading}
                          className="w-full min-h-[44px] py-2.5 px-5 bg-[#2959ea] hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                        >
                          <FileCheck2 className="w-4 h-4" />
                          <span>Xuất bản cho học viên</span>
                        </button>
                      ) : workflow.published ? (
                        <div className="w-full flex items-center justify-between bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-xl">
                          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-800">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Đã xuất bản cho học viên (Phiên bản v{workspace?.lecture.version})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => switchRole('student')}
                            className="text-xs sm:text-sm font-bold text-[#2959ea] hover:underline flex items-center gap-1 cursor-pointer focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2959ea] rounded-md px-1"
                          >
                            <span>Chuyển sang tài khoản học viên</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {workflow.canReview && (
                      <p className="text-xs text-[#5f708b] italic">
                        Sau khi duyệt, bạn có thể xuất bản bài học.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CÂU HỎI TỪ BÀI GIẢNG */}
          {activeTab === 'questions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
                    Câu hỏi từ bài giảng
                  </h3>
                  <p className="text-xs text-[#5f708b] mt-0.5">
                    Được sinh tự động từ các khái niệm đã có nguồn chứng minh.
                  </p>
                </div>
                {activeAssessment && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    activeAssessment.status === 'published'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {activeAssessment.status === 'published' ? 'Đã xuất bản' : 'Bản thảo'}
                  </span>
                )}
              </div>

              {!activeAssessment || activeAssessment.questions.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-xs sm:text-sm text-[#5f708b]">
                    Chưa có bộ câu hỏi trắc nghiệm nào cho bài học này.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateAssessment}
                    disabled={actionLoading}
                    className="min-h-[44px] px-4 py-2 bg-[#2959ea] text-white font-semibold text-xs sm:text-sm rounded-xl cursor-pointer hover:bg-blue-700 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                  >
                    {actionLoading ? 'Đang tạo câu hỏi...' : 'Tạo câu hỏi từ bài giảng'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeAssessment.questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-3.5 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] text-xs sm:text-sm space-y-2.5"
                    >
                      {editingQuestionId === q.id ? (
                        /* Editing Question Form */
                        <div className="space-y-2.5">
                          <label className="block font-bold text-[#12213b]">Nội dung câu hỏi:</label>
                          <input
                            type="text"
                            value={editQuestionText}
                            onChange={(e) => setEditQuestionText(e.target.value)}
                            className="w-full bg-white border border-[#e1e7ef] rounded-lg p-2 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea]"
                          />

                          <label className="block font-bold text-[#12213b] pt-1">Các lựa chọn đáp án:</label>
                          <div className="space-y-1.5">
                            {editOptions.map((opt, oIdx) => (
                              <div key={opt.id || oIdx} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`correct-${q.id}`}
                                  checked={editCorrectId === opt.id}
                                  onChange={() => setEditCorrectId(opt.id)}
                                  className="accent-[#2959ea] cursor-pointer"
                                  title="Chọn làm đáp án đúng"
                                />
                                <input
                                  type="text"
                                  value={opt.text}
                                  onChange={(e) => {
                                    const next = [...editOptions];
                                    next[oIdx] = { ...opt, text: e.target.value };
                                    setEditOptions(next);
                                  }}
                                  className="flex-1 bg-white border border-[#e1e7ef] rounded-lg px-2.5 py-1 text-xs text-[#12213b] focus:outline-hidden focus:ring-1 focus:ring-[#2959ea]"
                                />
                              </div>
                            ))}
                          </div>

                          <div>
                            <label className="block font-bold text-[#12213b] pt-1">Giải thích sư phạm:</label>
                            <textarea
                              rows={2}
                              value={editExplanation}
                              onChange={(e) => setEditExplanation(e.target.value)}
                              className="w-full bg-white border border-[#e1e7ef] rounded-lg p-2 text-xs text-[#12213b] focus:outline-hidden focus:ring-1 focus:ring-[#2959ea]"
                            />
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingQuestionId(null)}
                              className="px-2.5 py-1 text-xs text-[#5f708b] hover:bg-slate-200 rounded-md"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveQuestion}
                              className="px-3.5 py-1 text-xs bg-[#2959ea] text-white font-semibold rounded-md flex items-center gap-1 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2959ea]"
                            >
                              <Save className="w-3 h-3" />
                              <span>Lưu thay đổi</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Display Question */
                        <div>
                          <div className="flex items-start justify-between gap-2 font-semibold text-[#12213b]">
                            <span>Câu {idx + 1}: {q.text}</span>
                            <button
                              type="button"
                              onClick={() => handleStartEditQuestion(q)}
                              className="text-slate-400 hover:text-[#2959ea] min-h-[44px] min-w-[44px] flex items-center justify-center p-1 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2959ea] rounded-lg"
                              title="Chỉnh sửa câu hỏi"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1.5">
                            {q.options.map((opt, oIdx) => {
                              const isCorrect = opt.id === q.correct_option_id;
                              return (
                                <div
                                  key={opt.id || oIdx}
                                  className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                                    isCorrect
                                      ? 'bg-emerald-50 border-emerald-200 font-bold text-emerald-800'
                                      : 'bg-white border-[#e1e7ef] text-[#5f708b]'
                                  }`}
                                >
                                  <span>{opt.text}</span>
                                  {isCorrect && (
                                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {q.explanation && (
                            <p className="text-xs text-[#5f708b] italic pt-1.5 border-t border-[#e1e7ef]/60">
                              Giải thích: {q.explanation}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Publish Assessment Action */}
                  {activeAssessment.status !== 'published' && (
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handlePublishAssessment(activeAssessment.id)}
                        disabled={actionLoading}
                        className="min-h-[44px] px-5 py-2 bg-[#2959ea] hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                      >
                        Xuất bản câu hỏi cho học viên
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CẢI TIẾN (Review line 30: Uses actual planned segments + real API simulation) */}
          {activeTab === 'improve' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
                  Kịch bản thử nghiệm phân bổ bài giảng (What-If)
                </h3>
                <p className="text-xs sm:text-sm text-[#5f708b] mt-0.5">
                  Thử nghiệm thêm 10 phút bài tập thực hành DFS nhưng không vượt quá tổng thời lượng bài giảng ({totalPlannedMinutes} phút).
                </p>
              </div>

              {simError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center justify-between">
                  <span>{simError}</span>
                  <button onClick={() => setSimError(null)} className="text-rose-700 font-bold">✕</button>
                </div>
              )}

              {/* Baseline Segments from actual workspace */}
              <div className="border border-[#e1e7ef] rounded-xl p-4 bg-[#f6f8fc] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs sm:text-sm text-[#12213b]">
                    Phân bổ kế hoạch hiện tại (Baseline): {totalPlannedMinutes} phút
                  </span>
                  <span className="text-xs text-[#5f708b]">
                    {plannedSegments.length} phân đoạn
                  </span>
                </div>

                {plannedSegments.length > 0 ? (
                  <div className="space-y-1.5">
                    {plannedSegments.map((seg: any) => (
                      <div key={seg.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-[#e1e7ef] text-xs">
                        <span className="text-[#12213b] font-medium">{seg.title}</span>
                        <strong className="text-[#2959ea]">{seg.minutes} phút</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#5f708b] italic">
                    Chưa khai báo phân đoạn thời lượng bài giảng chi tiết.
                  </p>
                )}
              </div>

              {/* Simulation Result: ONLY DISPLAYED AFTER COMPUTED VIA API */}
              {simComparison ? (
                <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-[#2959ea]">
                      Kết quả mô phỏng (+{simComparison.practice_delta} phút thực hành DFS)
                    </span>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      simComparison.feasible
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {simComparison.feasible ? '✓ Đảm bảo tổng thời lượng' : '⚠ Vượt quá thời lượng'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {simComparison.scenario_segments.map(seg => (
                      <div key={seg.id} className="flex justify-between items-center bg-white p-2 rounded-lg border border-blue-100 text-xs">
                        <span className="text-[#12213b] font-medium">{seg.title}</span>
                        <strong className="text-[#2959ea]">{seg.minutes} phút</strong>
                      </div>
                    ))}
                  </div>

                  {simComparison.assumptions.length > 0 && (
                    <div className="text-xs text-[#5f708b] space-y-1 pt-1 border-t border-blue-100">
                      <span className="font-semibold text-[#12213b]">Giả định điều chỉnh:</span>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {simComparison.assumptions.map((as, i) => (
                          <li key={i}>{as}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                /* Clear uncomputed state */
                <div className="text-xs text-[#5f708b] p-3 bg-white border border-[#e1e7ef] rounded-xl flex items-center justify-between">
                  <span>Chưa chạy mô phỏng. Bấm nút dưới đây để thử nghiệm phân bổ thời lượng thực tế từ hệ thống.</span>
                </div>
              )}

              {/* Working Simulation Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleRunSimulation}
                  disabled={simRunning}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-[#2959ea] hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                >
                  {simRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang tính toán mô phỏng...</span>
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4" />
                      <span>Thử thêm 10 phút thực hành DFS</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentView('simulation')}
                  className="text-xs sm:text-sm font-semibold text-[#2959ea] hover:underline flex items-center gap-1 cursor-pointer focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2959ea] rounded-md px-2 py-1"
                >
                  <span>Mở công cụ mô phỏng chi tiết</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Bottom Footer Area matching concept */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm pt-2">
        <button
          type="button"
          onClick={() => setCurrentView('agents')}
          className="text-[#5f708b] hover:text-[#2959ea] font-medium flex items-center gap-1.5 transition-colors cursor-pointer group focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2959ea] rounded-md px-1 py-0.5"
        >
          <ChevronDown className="w-4 h-4 text-[#5f708b] group-hover:text-[#2959ea]" />
          <span>Xem nguồn và cách tạo gợi ý</span>
        </button>

        {/* Clickable Info Button: literally includes "AI được dùng ở đâu?" per review line 24 */}
        <button
          ref={helpBtnRef}
          type="button"
          onClick={() => setIsHowDemoWorksOpen(true)}
          className="text-[#5f708b] hover:text-[#2959ea] flex items-center gap-1.5 cursor-pointer text-left sm:text-right focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#2959ea] rounded-md px-1 py-0.5"
        >
          <Info className="w-4 h-4 shrink-0 text-[#5f708b]" />
          <span>Chế độ minh họa: học liệu mẫu và xử lý bằng luật, chưa gọi mô hình AI bên ngoài. (AI được dùng ở đâu?)</span>
        </button>
      </div>

      {/* Review Modal Dialog with Focus Trap & Escape */}
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onConfirm={handleConfirmReview}
        pendingCount={workflow.pendingCount}
        unsupportedCount={workflow.unsupportedCount}
        triggerRef={reviewBtnRef}
      />

      {/* Accessible Dialog: "AI được dùng ở đâu?" with ModalDialog focus trap */}
      <ModalDialog
        isOpen={isHowDemoWorksOpen}
        onClose={() => setIsHowDemoWorksOpen(false)}
        title="AI được dùng ở đâu trong LectureTwin?"
        maxWidth="max-w-lg"
        triggerRef={helpBtnRef}
      >
        <div className="space-y-4 text-xs sm:text-sm text-[#12213b]">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2959ea] flex items-center justify-center shrink-0">
                <Info className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base sm:text-lg text-[#12213b]">
                AI được dùng ở đâu trong LectureTwin?
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsHowDemoWorksOpen(false)}
              className="text-slate-400 hover:text-[#12213b] p-1.5 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 leading-relaxed">
            <div className="bg-[#f6f8fc] p-3 rounded-xl border border-[#e1e7ef] space-y-1">
              <strong className="text-[#2959ea] block">1. Nguồn đưa vào:</strong>
              <p className="text-xs sm:text-sm text-[#5f708b]">
                Video tham khảo YouTube, ghi chú theo mốc thời gian hoặc học liệu do giảng viên cung cấp. Bản demo chưa tự nhận dạng video.
              </p>
            </div>

            <div className="bg-[#f6f8fc] p-3 rounded-xl border border-[#e1e7ef] space-y-1">
              <strong className="text-[#2959ea] block">2. Cách xử lý trong bản demo:</strong>
              <p className="text-xs sm:text-sm text-[#5f708b]">
                Quy tắc có sẵn dò từ khóa trong ghi chú, gắn ý chính với mốc nguồn và chọn câu hỏi mẫu. Demo chưa gọi mô hình AI bên ngoài, chưa tự nghe lời thoại hoặc đọc hình ảnh.
              </p>
            </div>

            <div className="bg-[#f6f8fc] p-3 rounded-xl border border-[#e1e7ef] space-y-1">
              <strong className="text-[#2959ea] block">3. Kết quả bạn nhận được:</strong>
              <p className="text-xs sm:text-sm text-[#5f708b]">
                {isSample
                  ? 'Bản thảo đề xuất để giảng viên kiểm duyệt; học viên có thể mở học liệu thực hành tại mốc được dẫn nguồn.'
                  : 'Bản thảo đề xuất để giảng viên kiểm duyệt và trợ lý học tập có trích dẫn từ bài giảng cho học viên.'}
              </p>
            </div>

            <p className="text-xs text-[#5f708b] italic pt-1">
              Lưu ý minh bạch: Bản thử nghiệm hiện tại chạy trên luật và dữ liệu mẫu đã xác thực; việc tích hợp nhận dạng giọng nói (ASR), mô hình đa phương thức và LLM bên ngoài là hướng phát triển mở rộng tiếp theo.
            </p>
          </div>

          <div className="flex justify-end pt-2 border-t border-[#e1e7ef]">
            <button
              type="button"
              onClick={() => setIsHowDemoWorksOpen(false)}
              className="px-4 py-2 bg-[#2959ea] text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-blue-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </ModalDialog>
    </motion.div>
  );
};
