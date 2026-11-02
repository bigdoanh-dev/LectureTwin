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
  Sliders,
  Upload
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VideoPlayer } from '../components/VideoPlayer';
import { ReviewModal } from '../components/ReviewModal';
import { ModalDialog } from '../components/ModalDialog';
import { LectureWorkflow } from '../components/LectureWorkflow';
import { KnowledgeMap } from '../components/KnowledgeMap';
import { api } from '../api';
import {
  buildLessonSummary,
  lessonWorkflow,
  formatEvidenceLabel,
  formatTimestamp,
  currentAssessments,
  workspaceSections,
  currentKeyPoints,
  aiCapabilitySummary,
  availableLessonEvidence,
  resolveLessonEvidence,
  currentCollaborationTraces,
  collaborationMessageLabel,
  collaborationRoleLabel,
  keyPointDraftLabel
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
  const sections = workspaceSections(workspace);
  const summaryRows = sections.resultsReady ? buildLessonSummary(workspace) : [];
  const keyPoints = currentKeyPoints(workspace);
  const keyPointCards = (keyPoints?.points || []).filter(point => point.title.trim() && point.explanation.trim()).slice(0, 6);
  const collaborationTraces = currentCollaborationTraces(workspace);
  const collaborationMessageCount = collaborationTraces.reduce((count, item) => count + item.trace.messages.length, 0);

  // Local UI State
  const [activeTab, setActiveTab] = useState<'summary' | 'questions' | 'improve'>('summary');
  const [workflowStep, setWorkflowStep] = useState<1 | 2 | 3>(1);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isHowDemoWorksOpen, setIsHowDemoWorksOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [keyPointsLoading, setKeyPointsLoading] = useState(false);
  const [keyPointsError, setKeyPointsError] = useState<string | null>(null);

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
  const keyPointsRequestRef = useRef(0);
  const selectedLessonRef = useRef({ lectureId: currentLectureId, version: workspace?.lecture.version });
  selectedLessonRef.current = { lectureId: currentLectureId, version: workspace?.lecture.version };
  const reviewBtnRef = useRef<HTMLButtonElement | null>(null);
  const helpBtnRef = useRef<HTMLButtonElement | null>(null);

  // Reset local state on lecture change
  useEffect(() => {
    setActiveTab('summary');
    setWorkflowStep(workspace?.assets.some(asset => asset.source_type === 'user_upload') && workflow.job ? 2 : 1);
    setSelectedEvidence(null);
    setEditingConceptId(null);
    setEditingQuestionId(null);
    setSelectedAssessmentId('');
    setActionMessage(null);
    setKeyPointsLoading(false);
    setKeyPointsError(null);
    keyPointsRequestRef.current++;
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
  }, [currentLectureId, workspace?.lecture.version]);

  const handleGenerateKeyPoints = async () => {
    const selected = selectedLessonRef.current;
    if (!selected.lectureId || selected.version == null || keyPointsLoading) return;
    const requestId = ++keyPointsRequestRef.current;
    setKeyPointsLoading(true);
    setKeyPointsError(null);
    try {
      const result = await api.generateKeyPoints(selected.lectureId);
      const stillSelected = selectedLessonRef.current.lectureId === selected.lectureId &&
        selectedLessonRef.current.version === selected.version && requestId === keyPointsRequestRef.current;
      if (!stillSelected) return;
      if (result.lecture.id !== selected.lectureId || result.lecture.version !== selected.version ||
          result.key_points?.source_version !== selected.version) {
        setKeyPointsError('Kết quả không khớp với phiên bản học liệu đang mở. Hãy tải lại học liệu rồi thử lại.');
        return;
      }
      await refreshWorkspace();
    } catch (error: any) {
      const stillSelected = selectedLessonRef.current.lectureId === selected.lectureId &&
        selectedLessonRef.current.version === selected.version && requestId === keyPointsRequestRef.current;
      if (stillSelected) setKeyPointsError(error.detail || error.message || 'Chưa thể tạo ý chính từ học liệu này.');
    } finally {
      const stillSelected = selectedLessonRef.current.lectureId === selected.lectureId &&
        selectedLessonRef.current.version === selected.version && requestId === keyPointsRequestRef.current;
      if (stillSelected) setKeyPointsLoading(false);
    }
  };

  // Default first cited source
  const lessonEvidence = availableLessonEvidence(workspace);
  const defaultEvidence = lessonEvidence.find(evidence => evidence.id === summaryRows[0]?.evidence?.id) || lessonEvidence[0] || null;
  const currentEvidence = resolveLessonEvidence(workspace, selectedEvidence?.id) || defaultEvidence;

  // Current assessments for active lecture version, newest first (Review line 36)
  const assessments = currentAssessments(workspace);
  const activeAssessment = assessments.find(a => a.id === selectedAssessmentId) || assessments[0] || null;

  // Real planned segments for tab Cải tiến
  const plannedSegments = workspace?.planned?.segments || workspace?.twin?.planned?.segments || [];
  const totalPlannedMinutes = workspace?.lecture.total_minutes || 50;
  const practiceName = plannedSegments.find(segment => segment.kind === 'practice')?.title || 'phần thực hành';
  const goToWorkflow = (step: 1 | 2 | 3) => {
    setWorkflowStep(step);
    document.getElementById('lecture-workflow')?.scrollIntoView({ behavior: shouldReduceMotion ? 'instant' : 'smooth', block: 'start' });
  };

  // Confirm review handler
  const handleConfirmReview = async (note: string) => {
    if (!currentLectureId) return;
    setActionLoading(true);
    try {
      const reviewed = await api.bulkReview(currentLectureId, note);
      const remaining = reviewed.findings?.filter((finding: {status: string}) => finding.status === 'pending').length || 0;
      setActionMessage(remaining ? `Đã lưu quyết định. Còn ${remaining} nhận định cần duyệt riêng ở bước 3.` : 'Đã lưu quyết định duyệt; đang hoàn tất liên kết mục tiêu học tập.');
      if (workflow.job?.id) {
        const updated = await api.getJob(workflow.job.id);
        setActiveJob(updated);
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
    if (!sections.canQuestions) { setActionMessage(sections.questionReason); return; }
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
    if (!sections.canImprove) { setSimError(sections.improvementReason); return; }
    if (simAbortRef.current) {
      simAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    simAbortRef.current = abortCtrl;

    setSimRunning(true);
    setSimError(null);
    try {
      const initialJob = await api.runScenario(currentLectureId, {
        title: `Thêm thời gian cho ${practiceName}`,
        request: `Thêm 10 phút cho ${practiceName} nhưng không tăng tổng thời lượng bài giảng`,
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
    if (!ev?.id) return;
    const source = resolveLessonEvidence(workspace, ev.id);
    if (!source) return;
    setSelectedEvidence(source);
    if (workspace?.assets.some(asset => asset.kind === 'video') && typeof source.start === 'number' && source.start >= 0) {
      seekVideoTo(source.start);
    }
    document.getElementById('lecture-source-panel')?.scrollIntoView({ behavior: shouldReduceMotion ? 'instant' : 'smooth', block: 'start' });
  };

  // Honest media caption
  const isSample = Boolean(workspace?.lecture.sample_attached);
  const hasVideo = Boolean(workspace?.assets.some(asset => asset.kind === 'video'));
  const videoCaption = isSample
    ? `Học liệu thực hành · 18:29 · ${workspace?.transcript.length ?? 0} ghi chú theo mốc`
    : (workspace?.assets.some(a => a.kind === 'video')
      ? 'Video bài giảng đã tải lên'
      : 'Học liệu bài giảng');

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

      <LectureWorkflow key={currentLectureId} step={workflowStep} onStepChange={setWorkflowStep} onShowResults={() => { setActiveTab('summary'); document.getElementById('lecture-proposals-panel')?.scrollIntoView({ behavior: shouldReduceMotion ? 'instant' : 'smooth', block: 'start' }); }} onReview={() => setIsReviewModalOpen(true)} onPublish={handlePublishLecture} />
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <button type="button" onClick={() => setCurrentView('questions')} className="min-h-[44px] text-sm font-semibold text-blue-700 hover:underline">Xem câu hỏi của lớp và điều chỉnh bài dạy</button>
        <button type="button" onClick={() => setCurrentView('twin')} className="min-h-[44px] text-sm font-semibold text-blue-700 hover:underline">Theo dõi học tập và đề xuất dạy</button>
      </div>

      {sections.hasUpload && Boolean(workspace?.concepts.length) && <KnowledgeMap
        key={`source-map-${currentLectureId}-${workspace?.lecture.version}`}
        concepts={workspace?.concepts || []}
        edges={workspace?.edges || []}
        selectedConceptId={selectedEvidence?.concept_id || workspace?.concepts[0]?.id || null}
        isTeacherView
        title="Bản đồ tri thức từ học liệu của bạn"
        subtitle="Chọn một khái niệm để xem dẫn chứng. Các quan hệ được tạo từ nguồn và cần giảng viên kiểm tra."
        notice={workflow.reviewed || workflow.published ? 'Nội dung đã qua bước duyệt của giảng viên.' : 'Bản đề xuất chưa phát hành. Đoạn trích khớp nguồn chưa đồng nghĩa nhận định và quan hệ đã đúng.'}
        onSelectConcept={id => {
          const evidence = lessonEvidence.find(item => item.concept_id === id) || null;
          setSelectedEvidence(evidence || null);
          if (typeof evidence?.start === 'number') seekVideoTo(evidence.start);
        }}
      />}

      {/* 3. Main Workspace Grid: Left 43% (Bài giảng gốc) vs Right 57% (Đề xuất từ học liệu) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT 43% (~5 cols out of 12) - MATCHING TEACHER CONCEPT PNG */}
        <div id="lecture-source-panel" role="region" aria-label="Nguồn học liệu hiện tại" data-lecture-id={currentLectureId} data-version={workspace?.lecture.version} className="scroll-mt-28 lg:col-span-5 bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3.5">
          {sections.hasUpload ? <>
          <h2 className="font-bold text-[20px] text-[#12213b]">
            Học liệu đang sử dụng
          </h2>

          <p className="break-words text-xs text-slate-500">{workspace?.assets.filter(asset => asset.source_type === 'user_upload').map(asset => asset.name).join(' · ')} · Phiên bản {workspace?.lecture.version}</p>
          {/* Embedded Native Video Player (NO nested card wrapper) */}
          {hasVideo && currentEvidence?.kind !== 'slide' ? <VideoPlayer
            lectureId={currentLectureId}
            variant="embedded"
            seekTarget={videoSeekTarget}
            onClearSeekTarget={clearVideoSeek}
            sampleAttached={workspace?.lecture.sample_attached}
            selectedEvidence={currentEvidence}
            defaultEvidence={defaultEvidence}
          /> : <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-[#12213b]"><FileText className="h-4 w-4 text-blue-600" />Nội dung tệp đã tải</p>
            {workspace?.assets.map(asset => <p key={asset.id} className="break-words text-xs font-semibold text-slate-500">{asset.name}</p>)}
            {workspace?.slides.length && currentEvidence?.kind !== 'transcript' ? (currentEvidence?.kind === 'slide' ? workspace.slides.filter(slide => currentEvidence.section_index ? slide.section_index === currentEvidence.section_index : currentEvidence.slide_page ? slide.page === currentEvidence.slide_page : true) : workspace.slides.slice(0, 2)).map(slide => <div key={slide.page} className="rounded-lg bg-white p-3 text-sm leading-relaxed text-slate-600"><p className="mb-1 text-xs font-bold text-blue-700">{slide.section_index ? `Phần ${slide.section_index}` : `Trang ${slide.page}`}</p>{slide.text || 'Trang này chưa có văn bản trích xuất được.'}</div>) : (currentEvidence?.kind === 'transcript' ? workspace?.transcript.filter(note => note.start === currentEvidence.start && note.end === currentEvidence.end) : workspace?.transcript.slice(0, 2))?.map(note => <div key={note.id} className="rounded-lg bg-white p-3 text-sm leading-relaxed text-slate-600"><p className="mb-1 text-xs font-bold text-blue-700">{formatTimestamp(note.start)} – {formatTimestamp(note.end)}</p>{note.text}</div>)}
            {!workspace?.assets.length && <p className="text-sm text-slate-500">Chọn tệp ở bước 1 để bắt đầu.</p>}
          </div>}

          {/* Video Caption */}
          <div className="text-xs text-[#5f708b] font-medium">
            {videoCaption}
          </div>

          {/* Selected Citation Quote Box */}
          <div aria-live="polite" data-evidence-id={currentEvidence?.id} className="bg-[#f0f5ff] rounded-xl p-4 border border-blue-100 space-y-1.5">
            <div className="text-xs font-bold text-[#12213b]">
              {isSample
                ? 'Ghi chú học liệu thực hành'
                : (currentEvidence?.kind === 'slide' ? formatEvidenceLabel(currentEvidence) : 'Căn cứ từ phụ đề hoặc bài giảng')}
            </div>

            {currentEvidence ? (
              <>
                <p className="text-sm leading-[22px] text-[#12213b] font-medium">
                  “{currentEvidence.text}”
                </p>
                <div className="text-xs text-[#5f708b] font-medium pt-0.5">
                  {formatEvidenceLabel(currentEvidence)} · {isSample
                    ? 'Diễn giải thủ công từ phụ đề tự động tiếng Anh; chưa chạy nhận dạng giọng nói hoặc hình ảnh'
                    : (currentEvidence.kind === 'slide' ? 'Đoạn trích từ tài liệu đã tải lên' : 'Nội dung đối chiếu từ bài giảng đã tải lên')}
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
                : hasVideo ? 'Video và tài liệu bài giảng đã tải lên.' : 'Nội dung được đọc từ tài liệu hoặc phụ đề bạn đã tải lên.'}
            </span>
          </div>
          </> : <div className="space-y-3 py-6 text-center">
            <Upload className="mx-auto h-9 w-9 text-blue-500" />
            <h2 className="text-lg font-bold text-[#12213b]">Chưa tải học liệu</h2>
            <p className="text-sm leading-relaxed text-slate-500">Tệp bạn gửi ở bước 1 sẽ hiển thị tại đây. Ý chính, câu hỏi và dẫn chứng bên phải sẽ lấy từ chính tệp đó.</p>
            <button type="button" onClick={() => goToWorkflow(1)} className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Tải học liệu ở bước 1</button>
          </div>}
        </div>

        {/* RIGHT 57% (~7 cols out of 12) - MATCHING TEACHER CONCEPT PNG */}
        <div id="lecture-proposals-panel" role="region" aria-label="Đề xuất của học liệu hiện tại" data-lecture-id={currentLectureId} data-version={workspace?.lecture.version} className="scroll-mt-28 lg:col-span-7 bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-4">
          <h2 className="font-bold text-[20px] text-[#12213b]">
            Đề xuất từ học liệu
          </h2>

          <p className="text-xs text-slate-500">{sections.hasUpload ? `Kết quả của ${workspace?.assets.filter(asset => asset.source_type === 'user_upload').map(asset => asset.name).join(' + ')} · Phiên bản ${workspace?.lecture.version}` : 'Kết quả sẽ xuất hiện sau khi xử lý tệp ở bước 2.'}</p>
          {/* Plain Underline Tabs across panel (14px, min-h 44px touch) */}
          <div className="flex items-center space-x-6 border-b border-[#e1e7ef] text-sm font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`min-h-[44px] pb-2.5 flex items-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer relative focus-visible:outline-hidden focus-visible:text-[#2959ea] ${
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
              disabled={!sections.canQuestions}
              title={sections.canQuestions ? 'Câu hỏi từ ý chính đã duyệt' : sections.questionReason}
              className={`min-h-[44px] pb-2.5 flex items-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer relative focus-visible:outline-hidden focus-visible:text-[#2959ea] ${
                activeTab === 'questions'
                  ? 'text-[#2959ea] font-bold'
                  : 'text-[#5f708b] hover:text-[#12213b]'
              }`}
            >
              <span>Câu hỏi</span>
              {activeTab === 'questions' && sections.canQuestions && (
                <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-[#2959ea] rounded-t-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('improve')}
              disabled={!sections.canImprove}
              title={sections.canImprove ? 'Thử thay đổi kế hoạch của bài này' : sections.improvementReason}
              className={`min-h-[44px] pb-2.5 flex items-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer relative focus-visible:outline-hidden focus-visible:text-[#2959ea] ${
                activeTab === 'improve'
                  ? 'text-[#2959ea] font-bold'
                  : 'text-[#5f708b] hover:text-[#12213b]'
              }`}
            >
              <span>Cải tiến</span>
              {activeTab === 'improve' && sections.canImprove && (
                <span className="absolute bottom-0 inset-x-0 h-[2.5px] bg-[#2959ea] rounded-t-full" />
              )}
            </button>
          </div>

          {/* TAB 1: Ý CHÍNH */}
          {!sections.canQuestions && <p className="text-xs leading-relaxed text-slate-500">Câu hỏi: {sections.questionReason}</p>}
          {!sections.canImprove && <p className="text-xs leading-relaxed text-slate-500">Cải tiến: {sections.improvementReason}</p>}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              {!sections.hasUpload && <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-relaxed text-slate-600">Chưa có kết quả. Hãy tải tệp ở bước 1; hệ thống sẽ xử lý ở bước 2 và gửi đề xuất để bạn duyệt ở bước 3.</div>}
              {sections.hasUpload && !sections.resultsReady && <div role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-slate-600">{workflow.running ? 'Đang xử lý học liệu này. Khái niệm và dẫn chứng sẽ xuất hiện khi có kết quả từ lượt chạy.' : 'Chưa có kết quả cho phiên bản học liệu này. Tiếp tục ở bước 2 trong luồng phía trên.'}</div>}
              {sections.resultsReady && !workflow.running && (
                <section aria-labelledby="teacher-key-points-title" className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 id="teacher-key-points-title" className="font-bold text-base text-[#12213b]">Ý chính từ học liệu</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">Các ý được trình bày thành nội dung ngắn có dẫn chứng để giảng viên đối chiếu.</p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{keyPointDraftLabel(keyPoints)}</span>
                  </div>
                  {keyPointCards.length ? (
                    <div className="space-y-3">
                      {keyPointCards.map((point, index) => (
                        <article key={point.id} className="rounded-lg border border-slate-200 bg-white p-3.5">
                          <h4 className="font-semibold leading-relaxed text-[#12213b]">{index + 1}. {point.title}</h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{point.explanation}</p>
                          {point.method === 'deterministic_python_code_observation' && <p className="mt-1 text-xs leading-relaxed text-slate-500">Quan sát cấu trúc mã theo quy tắc; ý này không do mô hình ngôn ngữ tạo.</p>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {point.evidence.map(evidence => {
                              const usable = resolveLessonEvidence(workspace, evidence.id);
                              return usable ? <button key={evidence.id} type="button" onClick={() => handleSelectEvidence(usable)} className="min-h-[40px] rounded-lg border border-blue-100 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Xem dẫn chứng · {formatEvidenceLabel(usable)}</button> : null;
                            })}
                            {!point.evidence.some(evidence => lessonEvidence.some(item => item.id === evidence.id)) && <p className="text-xs text-amber-800">Chưa có dẫn chứng hợp lệ để mở cho ý này.</p>}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                    <p>{keyPoints ? 'Chưa có ý chính hoàn chỉnh để trình bày từ phiên bản học liệu này.' : 'Chưa có bản nháp ý chính cho phiên bản học liệu này. Tạo ý chính để nhận nội dung được sinh từ học liệu đã đọc.'}</p>
                    {keyPoints?.limitations.map((limitation, index) => <p key={index} className="mt-1">{limitation}</p>)}
                  </div>}
                  {keyPoints?.limitations.length ? <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">{keyPoints.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul> : null}
                  {keyPointsError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-800">{keyPointsError}</p>}
                  <button type="button" onClick={() => void handleGenerateKeyPoints()} disabled={keyPointsLoading || workflow.running} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#2959ea] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                    {keyPointsLoading && <RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
                    {keyPointsLoading ? 'Đang tạo ý chính…' : keyPoints ? 'Cập nhật ý chính' : 'Tạo lại ý chính từ học liệu'}
                  </button>
                </section>
              )}
              {collaborationTraces.length > 0 && (
                <details className="rounded-xl border border-slate-200 bg-white px-4">
                  <summary className="flex min-h-[48px] cursor-pointer items-center font-semibold text-sm text-[#12213b]">Trao đổi giữa bước tạo và kiểm chứng ({collaborationMessageCount})</summary>
                  <div className="space-y-3 pb-4">
                    <p className="text-xs leading-relaxed text-slate-600">Các bước trao đổi được điều phối theo quy trình có giới hạn. Chỉ hiển thị vai trò và loại trao đổi; nội dung suy luận nội bộ không được trình bày.</p>
                    {collaborationTraces.map(({ label, trace }) => (
                      <section key={`${label}-${trace.source_version}`} className="rounded-lg bg-slate-50 p-3">
                        <h4 className="text-sm font-semibold text-[#12213b]">{label} · phiên bản {trace.source_version}</h4>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                          {trace.independent_models
                            ? `Mô hình tạo: ${trace.generator_model}; mô hình kiểm chứng: ${trace.verifier_model}.`
                            : `Cùng mô hình ${trace.generator_model} tạo và kiểm chứng.`}
                          {' '}Đã dùng {trace.revision_rounds}/{trace.max_revision_rounds} vòng chỉnh sửa tối đa.
                          {trace.teacher_review_required ? ' Cần giảng viên đối chiếu.' : ''}
                        </p>
                        <ol className="mt-2 space-y-1.5">
                          {trace.messages.map((message, index) => (
                            <li key={message.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs leading-relaxed">
                              <span className="font-medium text-slate-700">{index + 1}. {collaborationMessageLabel(message.kind)} · {collaborationRoleLabel(message.sender)} → {collaborationRoleLabel(message.recipient)}</span>
                              <span className="text-slate-500">Phiên bản {message.source_version}</span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ))}
                  </div>
                </details>
              )}
              {/* Case E: Analyzed Rows matching Concept PNG layout (Review line 32 typography) */}
              {sections.resultsReady && summaryRows.length > 0 && !workflow.running && (
                <div className="space-y-4">
                  <details className="rounded-xl border border-slate-200 bg-white px-4">
                    <summary className="flex min-h-[48px] cursor-pointer items-center font-semibold text-sm text-[#12213b]">Thuật ngữ và mã được nhắc tới ({summaryRows.length})</summary>
                    <p className="pb-3 text-xs leading-relaxed text-slate-500">Danh sách này giữ các thuật ngữ và mã được trích từ đồ thị nguồn; đây không phải phần tóm tắt bài học.</p>
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
                                : formatEvidenceLabel(row.evidence)}
                            </span>
                            <ChevronRight className="w-4 h-4 text-[#5f708b] group-hover:text-[#2959ea]" />
                          </button>
                        )}
                      </div>
                    ))}
                    </div>
                  </details>

                  {/* Amber Warning Box matching concept PNG */}
                  {workflow.unsupportedCount > 0 && workflow.canReview && (
                    <div className="bg-[#fff9eb] border border-[#fde8b3] rounded-xl p-4 flex items-start gap-3 text-xs sm:text-sm">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-amber-950">
                          {workflow.unsupportedCount} nội dung chưa đủ nguồn
                        </div>
                        <p className="text-amber-900 mt-0.5 leading-relaxed">
                          {workspace?.findings.filter(finding => !finding.has_evidence).map(finding => finding.title).join('; ')}
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
                            onClick={() => goToWorkflow(3)}
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
          {activeTab === 'questions' && sections.canQuestions && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
                    Câu hỏi từ bài giảng
                  </h3>
                  <p className="text-xs text-[#5f708b] mt-0.5">
                    Câu hỏi nháp lấy từ các ý chính bạn đã duyệt, kèm căn cứ trong học liệu này.
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
                              disabled={activeAssessment.status === 'published'}
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

                          {(() => { const evidence = workspace?.evidence.find(item => item.id === q.evidence_id && item.valid && item.verified); return evidence ? <button type="button" onClick={() => handleSelectEvidence(evidence)} className="min-h-[44px] text-xs font-semibold text-blue-700">Xem căn cứ câu {idx + 1}: {formatEvidenceLabel(evidence)}</button> : <p className="text-xs text-amber-700">Nguồn của câu hỏi không còn phù hợp; cần tạo lại câu hỏi cho học liệu hiện tại.</p>; })()}
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
                    <div className="pt-2 flex flex-col items-end gap-2">
                      {!workflow.published && <p className="text-xs text-slate-500">Xuất bản bài giảng ở bước 3 trước khi giao bộ câu hỏi này cho học viên.</p>}
                      <button
                        type="button"
                        onClick={() => handlePublishAssessment(activeAssessment.id)}
                        disabled={actionLoading || !workflow.published}
                        title={workflow.published ? 'Giao bộ câu hỏi của bài này' : 'Xuất bản bài giảng trước khi giao câu hỏi cho học viên'}
                        className="min-h-[44px] px-5 py-2 bg-[#2959ea] hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
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
          {activeTab === 'improve' && sections.canImprove && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
                  Kịch bản thử nghiệm phân bổ bài giảng (What-If)
                </h3>
                <p className="text-xs sm:text-sm text-[#5f708b] mt-0.5">
                  Thử thêm 10 phút cho {practiceName}, giữ tổng thời lượng {totalPlannedMinutes} phút. Đây là kế hoạch đề xuất từ các ý chính đã duyệt, không phải thời lượng đo từ video.
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
                    Kế hoạch đề xuất từ nội dung đã duyệt: {totalPlannedMinutes} phút
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
                      Kết quả tính thử (+{simComparison.practice_delta} phút cho {practiceName})
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
                      <span>Thử thêm 10 phút cho {practiceName}</span>
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

      {!sections.hasUpload && workspace?.lecture.sample_attached && <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-blue-700">Xem video ví dụ có sẵn</summary><p className="my-3 text-xs leading-relaxed text-slate-500">Nguồn tham khảo để xem cách trình bày. Kết quả trong luồng tải tệp chỉ được tạo từ học liệu bạn gửi.</p><VideoPlayer lectureId={currentLectureId} variant="embedded" sampleAttached={true} /></details>}

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
          <span>{workspace?.ai?.note || (isSample ? 'Chế độ minh họa với nguồn mẫu đã chuẩn bị.' : 'Chưa có thông tin bộ xử lý AI.')} (AI được dùng ở đâu?)</span>
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
                Video hoặc tài liệu do giảng viên cung cấp. Nguồn tham khảo mẫu được ghi rõ và không được gán cho tệp mới.
              </p>
            </div>

            <div className="bg-[#f6f8fc] p-3 rounded-xl border border-[#e1e7ef] space-y-1">
              <strong className="text-[#2959ea] block">2. Cách xử lý trong bản demo:</strong>
              <p className="text-xs sm:text-sm text-[#5f708b]">
                {aiCapabilitySummary(workspace?.ai)}
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
              Mô hình có thể sai. Dẫn chứng được đối chiếu với đoạn nguồn, nhưng giảng viên vẫn cần kiểm tra ý nghĩa và quan hệ trước khi phát hành. Trạng thái, số lần gọi và lỗi được lấy từ công việc thực tế.
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
