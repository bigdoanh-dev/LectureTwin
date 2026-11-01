import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ShieldCheck,
  RefreshCw,
  Info,
  X,
  FileText
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VideoPlayer } from '../components/VideoPlayer';
import { ModalDialog } from '../components/ModalDialog';
import { StudentOverview } from '../components/StudentOverview';
import { StudentResourceTabs } from '../components/StudentResourceTabs';
import { StudentOutline } from '../components/StudentOutline';
import { StudentTutor } from '../components/StudentTutor';
import { StudentResults } from '../components/StudentResults';
import { StudentSlideModal } from '../components/StudentSlideModal';
import { studentLearningOverview } from '../student-model';
import { currentAssessments } from '../presentation';
import { api } from '../api';
import type { Evidence } from '../types';

interface StudentLearnViewProps {
  focusTutor?: boolean;
}

export const StudentLearnView: React.FC<StudentLearnViewProps> = ({ focusTutor = false }) => {
  const {
    workspace,
    bootstrap,
    selectLecture,
    currentLectureId,
    setCurrentView,
    seekVideoTo,
    videoSeekTarget,
    clearVideoSeek,
    refreshWorkspace,
    loading
  } = useApp();

  const shouldReduceMotion = useReducedMotion();

  // Course filter state
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  // Player & UI states
  const [playerTime, setPlayerTime] = useState<number>(0);
  const [playerDuration, setPlayerDuration] = useState<number>(0);
  const [selectedVideoEvidence, setSelectedVideoEvidence] = useState<Evidence | null>(null);
  const [activeTab, setActiveTab] = useState<'source' | 'knowledge' | 'notes'>('source');
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [draftNoteTime, setDraftNoteTime] = useState<number | null>(null);
  const [progressNotice, setProgressNotice] = useState<string | null>(null);
  const [isHowDemoWorksOpen, setIsHowDemoWorksOpen] = useState<boolean>(false);
  const [selectedSlidePage, setSelectedSlidePage] = useState<number | null>(null);

  const lastProgressSaveRef = useRef<number>(0);
  const currentLectureScopeRef = useRef<string>(currentLectureId);
  const helpBtnRef = useRef<HTMLButtonElement | null>(null);
  const resourcesRef = useRef<HTMLDivElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const openKnowledge = (conceptId?: string) => {
    setActiveTab('knowledge');
    if (conceptId) setSelectedConceptId(conceptId);
    resourcesRef.current?.scrollIntoView({ block: 'start', behavior: shouldReduceMotion ? 'auto' : 'smooth' });
  };

  // Keep scope ref strictly updated
  useEffect(() => {
    currentLectureScopeRef.current = currentLectureId;
    return () => { currentLectureScopeRef.current = ''; };
  }, [currentLectureId]);

  // Derive model using the selector contract
  const model = useMemo(() => studentLearningOverview(workspace), [workspace]);

  // Sync selected course with current lecture on initial load
  useEffect(() => {
    if (workspace?.lecture.course_id) {
      setSelectedCourseId(workspace.lecture.course_id);
    } else if (bootstrap?.courses && bootstrap.courses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(bootstrap.courses[0].id);
    }
  }, [workspace?.lecture.course_id, bootstrap?.courses]);

  // Reset transient playback state on lecture change
  useEffect(() => {
    setPlayerTime(0);
    setPlayerDuration(0);
    setSelectedVideoEvidence(null);
    setDraftNoteTime(null);
    setSelectedSlidePage(null);
    setProgressNotice(null);
    setActiveTab('source');
    setSelectedConceptId(null);
    lastProgressSaveRef.current = 0;
  }, [currentLectureId]);

  // Filter lectures by selected course
  const filteredLectures = useMemo(() => {
    if (!bootstrap?.lectures) return [];
    if (!selectedCourseId) return bootstrap.lectures;
    return bootstrap.lectures.filter(l => l.course_id === selectedCourseId);
  }, [bootstrap?.lectures, selectedCourseId]);

  // Handle course change
  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    const validInCourse = bootstrap?.lectures.filter(l => l.course_id === courseId) || [];
    if (validInCourse.length > 0 && !validInCourse.some(l => l.id === currentLectureId)) {
      selectLecture(validInCourse[0].id);
    }
  };

  // Video time update handler (ONLY saves measured time from native player, never estimates YouTube)
  const handleTimeUpdate = (currentTime: number, duration: number) => {
    setPlayerTime(currentTime);
    if (duration > 0) setPlayerDuration(duration);

    if (model.canTrackVideo && duration > 0) {
      const now = Date.now();
      if (now - lastProgressSaveRef.current > 5000) {
        lastProgressSaveRef.current = now;
        const currentScope = currentLectureId;
        const isCompleted = duration > 0 ? currentTime >= Math.max(duration - 2, 1) : false;

        api.updateProgress(currentScope, {
          position_seconds: Math.round(currentTime),
          completed: isCompleted
        }).catch((err: any) => {
          if (currentLectureScopeRef.current !== currentScope) return;
          setProgressNotice(`Tiến trình chưa lưu được: ${err.detail || err.message}`);
        });
      }
    }
  };

  const handlePause = (currentTime: number) => {
    setPlayerTime(currentTime);
    if (model.canTrackVideo && playerDuration > 0) {
      const currentScope = currentLectureId;
      const isCompleted = playerDuration > 0 ? currentTime >= Math.max(playerDuration - 2, 1) : false;

      api.updateProgress(currentScope, {
        position_seconds: Math.round(currentTime),
        completed: isCompleted
      }).catch((err: any) => {
        if (currentLectureScopeRef.current !== currentScope) return;
        setProgressNotice(`Tiến trình chưa lưu được: ${err.detail || err.message}`);
      });
    }
  };

  const handleSeek = (seconds: number) => {
    setSelectedVideoEvidence(null);
    seekVideoTo(seconds);
    playerContainerRef.current?.scrollIntoView({ block: 'start', behavior: shouldReduceMotion ? 'auto' : 'smooth' });
  };

  const handleSeekEvidence = (evidence: Evidence) => {
    setSelectedVideoEvidence(evidence);
    if (evidence.start != null) {
      seekVideoTo(evidence.start);
      playerContainerRef.current?.scrollIntoView({ block: 'start', behavior: shouldReduceMotion ? 'auto' : 'smooth' });
    }
  };

  const handleViewSlide = (page: number) => {
    setSelectedSlidePage(page);
  };

  const activeSlide = useMemo(() => {
    if (selectedSlidePage == null || !workspace?.slides) return null;
    return workspace.slides.find(s => s.page === selectedSlidePage) || null;
  }, [selectedSlidePage, workspace?.slides]);

  const publishedAssessments = currentAssessments(workspace).filter(a => a.status === 'published');
  const hasPublishedAssessment = publishedAssessments.length > 0;

  // Has video source check
  const hasVideo = Boolean(model.primaryVideo);

  // Caption for video in plain Vietnamese (no technical jargon or source_type enums)
  const videoCaption = workspace?.lecture.sample_attached
    ? `Học liệu bài giảng · ${workspace.transcript.length} mốc chú giải đã duyệt`
    : (model.primaryVideo ? model.primaryVideo.name : 'Học liệu bài giảng đã xuất bản');

  // Loading state
  if (loading && !workspace) {
    return (
      <div className="space-y-6 max-w-[1440px] mx-auto pb-12 animate-pulse">
        <div className="space-y-2">
          <div className="h-8 bg-slate-200 rounded-xl w-72" />
          <div className="h-4 bg-slate-100 rounded-lg w-96" />
        </div>
        <div className="h-48 bg-white rounded-2xl border border-[#e1e7ef] p-6" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white rounded-xl border border-[#e1e7ef] p-6 h-[460px] flex flex-col items-center justify-center text-xs text-[#5f708b] space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#2959ea]" />
            <span>Đang tải không gian học tập...</span>
          </div>
          <div className="lg:col-span-4 bg-white rounded-xl border border-[#e1e7ef] p-6 h-[460px]" />
        </div>
      </div>
    );
  }

  if (!workspace || (selectedCourseId && workspace.lecture.course_id !== selectedCourseId)) {
    return <section className="space-y-5">
      <h1 className="text-2xl font-bold">Không gian học tập</h1>
      <label className="block text-sm font-semibold" htmlFor="empty-course-select">Khóa học</label>
      <select id="empty-course-select" value={selectedCourseId} onChange={event => handleCourseChange(event.target.value)} className="min-h-[44px] w-full max-w-lg rounded-xl border border-[#e1e7ef] bg-white px-3 text-sm">
        {bootstrap?.courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
      </select>
      <p className="rounded-xl border border-[#e1e7ef] bg-white p-6 text-sm leading-relaxed text-[#5f708b]">{bootstrap?.lectures.length ? 'Khóa học này chưa có bài học được xuất bản. Hãy chọn khóa học khác hoặc chờ giảng viên giao bài.' : 'Bạn chưa có bài học được xuất bản. Nội dung sẽ xuất hiện khi giảng viên giao bài cho khóa học của bạn.'}</p>
    </section>;
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      {/* 1. Header Section: Không gian học tập */}
      <div>
        <h1 className="text-2xl sm:text-[28px] font-bold text-[#12213b] tracking-tight leading-tight">
          Không gian học tập
        </h1>
        <p className="text-[14px] text-[#5f708b] font-medium mt-1">
          Nội dung và bài luyện tập giảng viên đã xuất bản cho bạn.
        </p>

        {/* Course & Lecture Selector Row */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <div>
            <label htmlFor="course-select" className="block text-[12px] font-semibold text-[#5f708b] mb-1.5">
              Khóa học
            </label>
            <select
              id="course-select"
              value={selectedCourseId}
              onChange={(e) => handleCourseChange(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#e1e7ef] rounded-xl px-3 py-2 text-[13px] sm:text-[14px] text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea]"
            >
              {bootstrap?.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="lecture-select" className="block text-[12px] font-semibold text-[#5f708b] mb-1.5">
              Bài học
            </label>
            <select
              id="lecture-select"
              value={currentLectureId}
              onChange={(e) => selectLecture(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#e1e7ef] rounded-xl px-3 py-2 text-[13px] sm:text-[14px] text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea]"
            >
              {filteredLectures.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {progressNotice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-900 flex items-center justify-between">
          <span>{progressNotice}</span>
          <button
            type="button"
            onClick={() => setProgressNotice(null)}
            className="text-amber-800 font-bold p-1 cursor-pointer min-h-[32px] min-w-[32px]"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Lesson Overview Card */}
      <StudentOverview
        workspace={workspace}
        model={model}
        onSelectTab={tab => { if (tab === 'knowledge') openKnowledge(); else setActiveTab(tab); }}
        onSelectConcept={openKnowledge}
        onNavigateToAssessment={() => setCurrentView('assessment')}
      />

      {/* 3. Main Area: Desktop 8/4 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 8 of 12 (Video Player & Resource Tabs) */}
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* Video Player Card */}
          <div ref={playerContainerRef} className="scroll-mt-32 bg-white rounded-2xl border border-[#e1e7ef] p-4 sm:p-5 shadow-2xs space-y-3">
            {hasVideo ? (
              <VideoPlayer
                lectureId={currentLectureId}
                variant="embedded"
                seekTarget={videoSeekTarget}
                onClearSeekTarget={clearVideoSeek}
                sampleAttached={workspace?.lecture.sample_attached}
                selectedEvidence={selectedVideoEvidence}
                onTimeUpdate={handleTimeUpdate}
                onPause={handlePause}
              />
            ) : (
              <div className="rounded-xl aspect-video bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center space-y-2 border border-slate-800">
                <FileText className="w-10 h-10 text-slate-400" />
                <p className="font-bold text-sm">Bài học chưa đính kèm tệp video</p>
                <p className="text-[13px] text-slate-400 max-w-sm">
                  Bạn có thể xem các trang slide trình chiếu và nội dung kiến thức trong các thẻ bên dưới.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#5f708b] pt-1">
              <span>{videoCaption}</span>
              <span className="font-medium text-[#2959ea]">
                {model.canTrackVideo ? 'Trình phát video trực tiếp' : 'Học liệu video tham khảo'}
              </span>
            </div>
          </div>

          {/* Resource Tabs below player */}
          <div ref={resourcesRef} className="scroll-mt-32">
          <StudentResourceTabs
            key={currentLectureId}
            workspace={workspace}
            model={model}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            selectedConceptId={selectedConceptId}
            onSelectConcept={setSelectedConceptId}
            playerTime={playerTime}
            playerDuration={playerDuration}
            onSeek={handleSeek}
            onSeekEvidence={handleSeekEvidence}
            onViewSlide={handleViewSlide}
            draftNoteTime={draftNoteTime}
            onSetDraftNoteTime={setDraftNoteTime}
            onRefreshWorkspace={refreshWorkspace}
          />
          </div>
        </div>

        {/* RIGHT COLUMN: 4 of 12 (Outline, Tutor, Results) */}
        <div className="lg:col-span-4 space-y-6 min-w-0">
          {/* 1. Lộ trình bài học */}
          <StudentOutline
            outline={model.outline}
            totalMinutes={workspace?.planned?.total_minutes ?? 0}
            onSeekEvidence={handleSeekEvidence}
            hasPublishedAssessment={hasPublishedAssessment}
            onNavigateToAssessment={() => setCurrentView('assessment')}
          />

          {/* 2. Hỏi về bài học (Tutor) */}
          <StudentTutor
            lectureId={currentLectureId}
            verifiedConcepts={model.knowledge}
            slides={workspace?.slides || []}
            onSeekEvidence={handleSeekEvidence}
            onViewSlide={handleViewSlide}
            focusTutor={focusTutor}
          />

          {/* 3. Kết quả luyện tập của bạn */}
          <StudentResults
            workspace={workspace}
            reviewConcepts={model.reviewConcepts}
            onSelectTab={tab => { if (tab === 'knowledge') openKnowledge(); else setActiveTab(tab); }}
            onSelectConcept={openKnowledge}
            onNavigateToAssessment={() => setCurrentView('assessment')}
          />
        </div>
      </div>

      {/* 4. Slide Preview Modal */}
      <StudentSlideModal
        isOpen={selectedSlidePage !== null}
        onClose={() => setSelectedSlidePage(null)}
        slide={activeSlide}
        onSeek={handleSeek}
      />

      {/* 5. Bottom Informational Link */}
      <div className="pt-4 flex justify-center text-[12px]">
        <button
          ref={helpBtnRef}
          type="button"
          onClick={() => setIsHowDemoWorksOpen(true)}
          className="min-h-[44px] text-[#5f708b] hover:text-[#2959ea] flex items-center gap-1.5 cursor-pointer text-center px-3 py-1.5 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
        >
          <ShieldCheck className="w-4 h-4 text-[#5f708b]" />
          <span>Chế độ minh họa, chưa gọi mô hình bên ngoài. AI được dùng ở đâu?</span>
        </button>
      </div>

      {/* Informational Dialog: "AI được dùng ở đâu trong không gian học viên?" */}
      <ModalDialog
        isOpen={isHowDemoWorksOpen}
        onClose={() => setIsHowDemoWorksOpen(false)}
        title="AI được dùng ở đâu trong không gian học viên?"
        maxWidth="max-w-lg"
        triggerRef={helpBtnRef}
      >
        <div className="space-y-4 text-[13px] sm:text-[14px] text-[#12213b]">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#2959ea] flex items-center justify-center shrink-0">
                <Info className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base sm:text-lg text-[#12213b]">
                AI được dùng ở đâu trong không gian học viên?
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsHowDemoWorksOpen(false)}
              className="text-slate-400 hover:text-[#12213b] min-h-[44px] min-w-[44px] p-2 flex items-center justify-center rounded-lg"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 leading-relaxed">
            <div className="bg-[#f6f8fc] p-3 rounded-xl border border-[#e1e7ef] space-y-1">
              <strong className="text-[#2959ea] block">Đối chiếu câu hỏi với bài giảng:</strong>
              <p className="text-[12px] text-[#5f708b]">
                Trợ lý tìm đoạn nguồn đã được giảng viên duyệt. Nếu không tìm thấy căn cứ phù hợp, trợ lý sẽ báo rõ.
              </p>
            </div>

            <div className="bg-[#f6f8fc] p-3 rounded-xl border border-[#e1e7ef] space-y-1">
              <strong className="text-[#2959ea] block">Dẫn nguồn trực tiếp:</strong>
              <p className="text-[12px] text-[#5f708b]">
                Câu trả lời có căn cứ đi kèm trích dẫn. Bấm mốc thời gian để xem lại đoạn video hoặc trang slide nguồn.
              </p>
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-[#5f708b]">
            Bản demo tìm nguồn theo từ khóa và trả về trích đoạn; chưa gọi mô hình AI bên ngoài.
          </p>

          <div className="flex justify-end pt-2 border-t border-[#e1e7ef]">
            <button
              type="button"
              onClick={() => setIsHowDemoWorksOpen(false)}
              className="min-h-[44px] px-5 py-2.5 bg-[#2959ea] text-white font-semibold text-[13px] sm:text-[14px] rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </ModalDialog>
    </motion.div>
  );
};
