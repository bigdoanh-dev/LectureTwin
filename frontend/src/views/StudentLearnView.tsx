import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Send,
  Bookmark,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  ArrowRight,
  Play,
  BookOpen,
  FileText,
  ShieldCheck,
  Info,
  X,
  RefreshCw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VideoPlayer } from '../components/VideoPlayer';
import { ModalDialog } from '../components/ModalDialog';
import { api } from '../api';
import { Evidence } from '../types';
import { formatTimestamp, formatEvidenceLabel, currentAssessments } from '../presentation';

interface ChatItem {
  id: string;
  sender: 'student' | 'tutor';
  text: string;
  timestamp?: string;
  citations?: Evidence[];
  limitation?: string;
  isError?: boolean;
}

interface StudentLearnViewProps {
  focusTutor?: boolean;
}

export const StudentLearnView: React.FC<StudentLearnViewProps> = ({ focusTutor = false }) => {
  const {
    workspace,
    currentLectureId,
    setCurrentView,
    seekVideoTo,
    videoSeekTarget,
    clearVideoSeek,
    refreshWorkspace,
    loading
  } = useApp();

  const [chatInput, setChatInput] = useState<string>('');
  const [asking, setAsking] = useState<boolean>(false);
  const [playerTime, setPlayerTime] = useState<number>(0);
  const [playerDuration, setPlayerDuration] = useState<number>(0);
  const [activeTranscriptIndex, setActiveTranscriptIndex] = useState<number | null>(null);
  const [bookmarkLabel, setBookmarkLabel] = useState<string>('');
  const [isNotesOpen, setIsNotesOpen] = useState<boolean>(false);
  const [progressNotice, setProgressNotice] = useState<string | null>(null);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [isHowDemoWorksOpen, setIsHowDemoWorksOpen] = useState<boolean>(false);

  const shouldReduceMotion = useReducedMotion();
  const lastProgressSaveRef = useRef<number>(0);
  const tutorAbortRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const helpBtnRef = useRef<HTMLButtonElement | null>(null);

  // Suggested questions (DO NOT auto-ask on mount!)
  const suggestedQuestions = [
    'Tại sao BFS dùng Queue?',
    'Khi nào nên ưu tiên dùng BFS thay vì DFS để tìm đường đi ngắn nhất?',
    'Đoạn nào trong video minh họa trực tiếp thuật toán DFS?'
  ];

  // Conversation history
  const [conversation, setConversation] = useState<ChatItem[]>([]);

  // Auto focus input when focusTutor is true (Review point 6)
  useEffect(() => {
    if (focusTutor && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [focusTutor]);

  // Reset local state on lecture change (Review point 6 & 7)
  useEffect(() => {
    if (tutorAbortRef.current) {
      tutorAbortRef.current.abort();
      tutorAbortRef.current = null;
    }
    setAsking(false);
    setConversation([]);
    setActiveTranscriptIndex(null);
    setProgressNotice(null);
    setBookmarkError(null);

    return () => {
      if (tutorAbortRef.current) {
        tutorAbortRef.current.abort();
        tutorAbortRef.current = null;
      }
    };
  }, [currentLectureId]);

  // Scroll to latest message honoring reduced motion
  useEffect(() => {
    if (conversation.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' });
    }
  }, [conversation, shouldReduceMotion]);

  // Handle initial loading cleanly (Review point 18)
  if (loading && !workspace) {
    return (
      <div className="space-y-6 max-w-[1440px] mx-auto pb-12 animate-pulse">
        <div className="space-y-2">
          <div className="h-8 bg-slate-200 rounded-xl w-72" />
          <div className="h-4 bg-slate-100 rounded-lg w-96" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white rounded-xl border border-[#e1e7ef] p-6 h-[460px] flex flex-col items-center justify-center text-xs text-[#5f708b] space-y-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#2959ea]" />
            <span>Đang tải bài học đã xuất bản...</span>
          </div>
          <div className="lg:col-span-5 bg-white rounded-xl border border-[#e1e7ef] p-6 h-[460px]" />
        </div>
      </div>
    );
  }

  // Video time update handler
  const handleTimeUpdate = (currentTime: number, duration: number) => {
    setPlayerTime(currentTime);
    if (duration > 0) setPlayerDuration(duration);

    // Highlight active transcript row
    const transcript = workspace?.transcript || [];
    const foundIdx = transcript.findIndex((item, i) => {
      const nextItem = transcript[i + 1];
      const nextStart = nextItem ? nextItem.start : duration || 50;
      return currentTime >= item.start && currentTime < nextStart;
    });
    if (foundIdx !== -1 && foundIdx !== activeTranscriptIndex) {
      setActiveTranscriptIndex(foundIdx);
    }

    // Debounced progress save every 5s
    const now = Date.now();
    if (now - lastProgressSaveRef.current > 5000) {
      lastProgressSaveRef.current = now;
      const isCompleted = duration > 0 ? currentTime >= Math.max(duration - 2, 1) : false;
      api.updateProgress(currentLectureId, {
        position_seconds: Math.round(currentTime),
        completed: isCompleted
      }).catch((err: any) => {
        setProgressNotice(`Tiến trình chưa lưu được: ${err.detail || err.message}`);
      });
    }
  };

  const handlePause = (currentTime: number) => {
    setPlayerTime(currentTime);
    const isCompleted = playerDuration > 0 ? currentTime >= Math.max(playerDuration - 2, 1) : false;
    api.updateProgress(currentLectureId, {
      position_seconds: Math.round(currentTime),
      completed: isCompleted
    }).catch(() => { /* silent */ });
  };

  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookmarkLabel.trim()) return;
    setBookmarkError(null);
    try {
      await api.addBookmark(currentLectureId, {
        seconds: Math.round(playerTime),
        label: bookmarkLabel.trim()
      });
      setBookmarkLabel('');
      await refreshWorkspace();
    } catch (err: any) {
      setBookmarkError(err.detail || err.message || 'Không thể lưu ghi chú');
    }
  };

  const handleSendQuestion = async (questionText?: string) => {
    const textToSend = (questionText || chatInput).trim();
    if (!textToSend || asking) return;
    setChatInput('');

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setConversation(prev => [
      ...prev,
      { id: `s-${Date.now()}`, sender: 'student', text: textToSend, timestamp: timeStr }
    ]);
    setAsking(true);

    if (tutorAbortRef.current) {
      tutorAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    tutorAbortRef.current = abortCtrl;

    try {
      const initialJob = await api.askTutor(currentLectureId, textToSend);
      const tutorJob = await api.waitForJob(initialJob, abortCtrl.signal);

      const respTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (tutorJob.status === 'completed' && tutorJob.result) {
        const ans = tutorJob.result.answer || 'Không tìm thấy thông tin phù hợp trong nguồn bài giảng.';
        const cites = tutorJob.result.citations || [];
        const limitNote = tutorJob.result.limitation;

        setConversation(prev => [
          ...prev,
          {
            id: `t-${Date.now()}`,
            sender: 'tutor',
            text: ans,
            timestamp: respTimeStr,
            citations: cites,
            limitation: limitNote,
          }
        ]);
      } else {
        const errMsg = tutorJob.error || 'AI Tutor không thể trả lời câu hỏi này dựa trên các nguồn bài giảng đã xuất bản.';
        setConversation(prev => [
          ...prev,
          {
            id: `t-${Date.now()}`,
            sender: 'tutor',
            text: errMsg,
            timestamp: respTimeStr,
            isError: true,
          }
        ]);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const respTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setConversation(prev => [
        ...prev,
        {
          id: `t-${Date.now()}`,
          sender: 'tutor',
          text: `Không thể kết nối với AI Tutor: ${err.detail || err.message || 'Lỗi mạng'}`,
          timestamp: respTimeStr,
          isError: true,
        }
      ]);
    } finally {
      setAsking(false);
    }
  };

  const transcript = workspace?.transcript || [];
  const bookmarks = workspace?.progress?.bookmarks || [];
  const publishedAssessment = currentAssessments(workspace).find(a => a.status === 'published');

  // Honest caption (Review point 7)
  const isSample = Boolean(workspace?.lecture.sample_attached);
  const videoCaption = isSample
    ? 'Video bài giảng tham khảo và học liệu thực hành 50 giây'
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
      {/* 1. Header Section matching student concept PNG */}
      <div>
        <h1 className="text-[26px] sm:text-[30px] font-bold text-[#12213b] tracking-tight leading-tight">
          {workspace?.lecture.title || 'Duyệt đồ thị: BFS & DFS'}
        </h1>
        <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
          Học từ bài giảng đã được giảng viên duyệt.
        </p>
      </div>

      {progressNotice && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
          <span>{progressNotice}</span>
          <button onClick={() => setProgressNotice(null)} className="text-amber-800 font-bold p-1">
            ✕
          </button>
        </div>
      )}

      {/* 2. Main Grid: Left 60% vs Right 40% matching student concept PNG */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT 60% (~7 cols out of 12) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3.5">
          <h2 className="font-bold text-[20px] text-[#12213b]">
            Xem và khám phá bài giảng
          </h2>

          {/* Embedded Native Video Player (NO duplicate card wrapper) */}
          <VideoPlayer
            lectureId={currentLectureId}
            variant="embedded"
            seekTarget={videoSeekTarget}
            onClearSeekTarget={clearVideoSeek}
            sampleAttached={workspace?.lecture.sample_attached}
            onTimeUpdate={handleTimeUpdate}
            onPause={handlePause}
          />

          {/* Caption */}
          <div className="text-xs text-[#5f708b] font-medium">
            {videoCaption}
          </div>

          {/* Transcript clickable rows matching concept PNG: explicitly a section for practice materials */}
          <div className="space-y-1.5 pt-2 border-t border-[#e1e7ef]">
            <div className="flex items-center justify-between pb-1">
              <h3 className="font-bold text-xs sm:text-sm text-[#12213b]">
                {isSample ? 'Học liệu thực hành & lời thoại đối chiếu' : 'Lời thoại bài giảng'}
              </h3>
              <span className="text-[11px] text-[#5f708b] bg-slate-100 px-2 py-0.5 rounded-md font-medium">
                {isSample ? 'Biên soạn riêng (50s)' : 'Tài liệu bài giảng'}
              </span>
            </div>
            <div className="space-y-1">
              {transcript.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#5f708b] italic">
                  Chưa có dữ liệu lời thoại cho bài giảng này.
                </div>
              ) : (
                transcript.map((item, idx) => {
                  const isActive = activeTranscriptIndex === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        seekVideoTo(item.start);
                        setActiveTranscriptIndex(idx);
                      }}
                      className={`w-full p-2.5 sm:p-3 text-left rounded-xl transition-colors flex items-center gap-3 cursor-pointer ${
                        isActive
                          ? 'bg-[#eef4ff] text-[#12213b]'
                          : 'hover:bg-slate-50 text-[#12213b]'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-[#2959ea] text-white' : 'bg-slate-100 text-[#5f708b]'
                      }`}>
                        <Play className="w-3 h-3 fill-current ml-0.5" />
                      </div>
                      <span className="font-mono text-xs font-bold text-[#2959ea] shrink-0">
                        {formatTimestamp(item.start)}
                      </span>
                      <p className="text-sm leading-[22px] font-medium flex-1">
                        {item.text}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            <p className="text-xs text-[#5f708b] pt-1">
              {isSample
                ? 'Bấm vào một đoạn để chuyển sang học liệu thực hành và tua đúng phần minh họa.'
                : 'Bấm vào một đoạn để tua video đến đúng vị trí.'}
            </p>
          </div>

          {/* Collapsible: Ghi chú của tôi matching concept PNG */}
          <div className="border-t border-[#e1e7ef] pt-3">
            <button
              type="button"
              onClick={() => setIsNotesOpen(!isNotesOpen)}
              className="w-full flex items-center justify-between text-xs sm:text-sm font-bold text-[#12213b] hover:text-[#2959ea] transition-colors cursor-pointer py-1"
            >
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-[#2959ea]" />
                <span>Ghi chú của tôi ({bookmarks.length})</span>
              </div>
              {isNotesOpen ? (
                <ChevronUp className="w-4 h-4 text-[#5f708b]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#5f708b]" />
              )}
            </button>

            {isNotesOpen && (
              <div className="mt-3 p-3.5 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] space-y-3">
                {/* Add Bookmark Form */}
                <form onSubmit={handleAddBookmark} className="flex gap-2">
                  <input
                    type="text"
                    value={bookmarkLabel}
                    onChange={(e) => setBookmarkLabel(e.target.value)}
                    placeholder={`Ghi chú tại ${formatTimestamp(playerTime)}...`}
                    className="flex-1 bg-white border border-[#e1e7ef] rounded-lg px-3 py-1.5 text-xs text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea]"
                  />
                  <button
                    type="submit"
                    disabled={!bookmarkLabel.trim()}
                    className="min-h-[38px] px-3.5 bg-[#2959ea] text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Lưu</span>
                  </button>
                </form>

                {bookmarkError && (
                  <p className="text-xs text-red-600">{bookmarkError}</p>
                )}

                {/* Bookmark List */}
                <div className="space-y-1.5">
                  {bookmarks.length === 0 ? (
                    <p className="text-xs text-[#5f708b] italic">Chưa có ghi chú nào được lưu.</p>
                  ) : (
                    bookmarks.map((bm, bIdx) => (
                      <div
                        key={bIdx}
                        className="bg-white p-2.5 rounded-lg border border-[#e1e7ef] flex items-center justify-between text-xs"
                      >
                        <span className="text-[#12213b] font-medium">{bm.label}</span>
                        <button
                          type="button"
                          onClick={() => seekVideoTo(bm.seconds)}
                          className="font-mono text-xs text-[#2959ea] hover:underline font-bold flex items-center gap-1 min-h-[44px] px-2"
                        >
                          <Play className="w-3 h-3 fill-[#2959ea]" />
                          <span>{formatTimestamp(bm.seconds)}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT 40% (~5 cols out of 12) - MATCHING STUDENT CONCEPT PNG */}
        <div className="lg:col-span-5 space-y-4">
          {/* Chat Card */}
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs flex flex-col h-[560px]">
            {/* Header */}
            <div className="pb-3 border-b border-[#e1e7ef] shrink-0">
              <h2 className="font-bold text-[20px] text-[#12213b]">
                Hỏi về bài giảng
              </h2>
              <p className="text-xs text-[#5f708b] mt-0.5">
                Câu trả lời đi kèm đoạn nguồn để bạn kiểm tra.
              </p>
            </div>

            {/* Chat Messages Stream */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3.5 pr-1">
              {/* Empty state & Suggested questions (Review point 22: honest copy, no overclaim) */}
              {conversation.length === 0 && (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] text-sm leading-[22px] text-[#5f708b]">
                    Hỏi về nội dung bài giảng. Trợ lý tìm đoạn nguồn phù hợp; nếu thiếu căn cứ sẽ báo rõ.
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-bold text-[#12213b] block uppercase tracking-wider">
                      Gợi ý câu hỏi:
                    </span>
                    {suggestedQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setChatInput(q);
                          chatInputRef.current?.focus();
                        }}
                        className="w-full p-2.5 text-left bg-white border border-[#e1e7ef] hover:border-[#2959ea] hover:bg-blue-50/40 rounded-xl text-sm leading-[22px] text-[#12213b] transition-all cursor-pointer flex items-center justify-between group"
                      >
                        <span className="line-clamp-2">{q}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#5f708b] group-hover:text-[#2959ea] shrink-0 ml-1.5 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages stream matching student concept visual */}
              {conversation.map((msg) => (
                <div key={msg.id} className="space-y-1">
                  {msg.sender === 'student' ? (
                    /* User Question Bubble matching concept */
                    <div className="flex flex-col items-end">
                      <div className="bg-[#2959ea] text-white rounded-2xl rounded-tr-xs px-4 py-2.5 text-sm leading-[22px] font-medium max-w-[85%] shadow-2xs">
                        {msg.text}
                      </div>
                      {msg.timestamp && (
                        <span className="text-xs text-[#5f708b] mt-0.5 pr-1">
                          {msg.timestamp}
                        </span>
                      )}
                    </div>
                  ) : (
                    /* Tutor Response Bubble matching concept */
                    <div className="flex items-start gap-2.5 max-w-[92%]">
                      <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-[#2959ea] flex items-center justify-center shrink-0 mt-1">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="bg-[#f4f7fa] border border-[#e8edf3] rounded-2xl rounded-tl-xs p-3.5 text-sm leading-[22px] text-[#12213b] space-y-2">
                          <p>{msg.text}</p>

                          {/* Citations Pill Button matching concept: ▶ Xem đoạn nguồn 00:10 – 00:22 */}
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="pt-1">
                              {msg.citations.map((cite, cIdx) => (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() => {
                                    if (typeof cite.start === 'number' && cite.start >= 0) {
                                      seekVideoTo(cite.start);
                                    }
                                  }}
                                  className="min-h-[44px] inline-flex items-center gap-1.5 bg-blue-50/80 hover:bg-blue-100 text-[#2959ea] font-semibold text-xs px-3 py-2 rounded-xl border border-blue-200 transition-colors cursor-pointer"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>
                                    {isSample
                                      ? `Xem học liệu thực hành ${formatEvidenceLabel(cite)}`
                                      : (cite.kind === 'slide' ? `Xem trang slide ${cite.slide_page ?? 1}` : `Xem đoạn nguồn ${formatEvidenceLabel(cite)}`)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          {msg.limitation && (
                            <p className="text-xs text-[#5f708b] italic pt-1">
                              Lưu ý: {msg.limitation}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-[#5f708b] px-1">
                          <span>Dựa trên chú giải bài giảng đã duyệt.</span>
                          {msg.timestamp && <span>{msg.timestamp}</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {asking && (
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-50 text-[#2959ea] flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 animate-spin" />
                  </div>
                  <div className="bg-[#f4f7fa] border border-[#e8edf3] rounded-2xl rounded-tl-xs p-3 text-xs text-[#5f708b]">
                    AI Tutor đang đối chiếu nguồn bài giảng...
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Row: NO attachment icon! 44px send button */}
            <form
              onSubmit={(e) => { e.preventDefault(); handleSendQuestion(); }}
              className="pt-2 border-t border-[#e1e7ef] shrink-0"
            >
              <div className="flex items-center gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Hỏi một câu về bài giảng..."
                  disabled={asking}
                  className="flex-1 min-w-0 bg-white border border-[#e1e7ef] rounded-xl px-3.5 py-2.5 text-sm text-[#12213b] placeholder:text-[#5f708b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] min-h-[44px] shadow-2xs"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || asking}
                  className="min-h-[44px] min-w-[44px] bg-[#2959ea] hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors shadow-xs cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                  aria-label="Gửi câu hỏi"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>

          {/* Làm bài luyện tập Separate Card matching student concept PNG (Review point 22) */}
          {publishedAssessment ? (
            <button
              type="button"
              onClick={() => setCurrentView('assessment')}
              className="w-full text-left bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs hover:border-blue-200 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#12213b] group-hover:text-[#2959ea] transition-colors">
                    Làm bài luyện tập
                  </h3>
                  <p className="text-xs text-[#5f708b] truncate">
                    {publishedAssessment.title} ({publishedAssessment.questions.length} câu hỏi)
                  </p>
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-[#5f708b] group-hover:text-[#2959ea] group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs flex items-center justify-between gap-3 opacity-80">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#5f708b] flex items-center justify-center shrink-0 border border-slate-200">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
                    Làm bài luyện tập
                  </h3>
                  <p className="text-xs text-[#5f708b] truncate">
                    Giảng viên chưa xuất bản bài kiểm tra cho bài học này.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Footer matching student concept PNG */}
      <div className="pt-2 flex justify-center text-xs">
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

      {/* Accessible Dialog: "AI được dùng ở đâu?" using shared ModalDialog */}
      <ModalDialog
        isOpen={isHowDemoWorksOpen}
        onClose={() => setIsHowDemoWorksOpen(false)}
        title="AI được dùng ở đâu trong không gian học viên?"
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
              <p className="text-xs text-[#5f708b]">
                Trợ lý tìm đoạn nguồn đã được giảng viên duyệt. Nếu không tìm thấy căn cứ phù hợp, trợ lý sẽ báo rõ.
              </p>
            </div>

            <div className="bg-[#f6f8fc] p-3 rounded-xl border border-[#e1e7ef] space-y-1">
              <strong className="text-[#2959ea] block">Dẫn nguồn trực tiếp:</strong>
              <p className="text-xs text-[#5f708b]">
                Câu trả lời có căn cứ đi kèm trích dẫn. Bấm mốc thời gian để xem lại đoạn video nguồn.
              </p>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-[#5f708b]">
            Bản demo tìm nguồn theo từ khóa và trả về trích đoạn; chưa gọi mô hình AI bên ngoài.
          </p>

          <div className="flex justify-end pt-2 border-t border-[#e1e7ef]">
            <button
              type="button"
              onClick={() => setIsHowDemoWorksOpen(false)}
              className="min-h-[44px] px-5 py-2.5 bg-[#2959ea] text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </ModalDialog>
    </motion.div>
  );
};
