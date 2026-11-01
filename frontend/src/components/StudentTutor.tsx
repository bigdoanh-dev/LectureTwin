import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, BookOpen, Play, FileText, ArrowRight } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { api } from '../api';
import type { ConceptNode, Evidence, Workspace } from '../types';
import { formatEvidenceLabel } from '../presentation';

interface ChatItem {
  id: string;
  sender: 'student' | 'tutor';
  text: string;
  timestamp?: string;
  citations?: Evidence[];
  limitation?: string;
  isError?: boolean;
}

interface StudentTutorProps {
  lectureId: string;
  verifiedConcepts: ConceptNode[];
  slides?: Workspace['slides'];
  onSeekEvidence: (evidence: Evidence) => void;
  onViewSlide: (page: number) => void;
  focusTutor?: boolean;
}

export const StudentTutor: React.FC<StudentTutorProps> = ({
  lectureId,
  verifiedConcepts,
  slides = [],
  onSeekEvidence,
  onViewSlide,
  focusTutor = false
}) => {
  const [chatInput, setChatInput] = useState<string>('');
  const [asking, setAsking] = useState<boolean>(false);
  const [conversation, setConversation] = useState<ChatItem[]>([]);

  const shouldReduceMotion = useReducedMotion();
  const tutorAbortRef = useRef<AbortController | null>(null);
  const lectureIdRef = useRef<string>(lectureId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Keep lectureIdRef strictly in sync with current scope
  useEffect(() => {
    lectureIdRef.current = lectureId;
  }, [lectureId]);

  // Focus input when focusTutor is true
  useEffect(() => {
    if (focusTutor) {
      containerRef.current?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' });
      inputRef.current?.focus();
    }
  }, [focusTutor, shouldReduceMotion]);

  // Cancel pending job & clear conversation only when lecture changes
  useEffect(() => {
    if (tutorAbortRef.current) {
      tutorAbortRef.current.abort();
      tutorAbortRef.current = null;
    }
    setAsking(false);
    setConversation([]);

    return () => {
      if (tutorAbortRef.current) {
        tutorAbortRef.current.abort();
        tutorAbortRef.current = null;
      }
    };
  }, [lectureId]);

  // Scroll to bottom on conversation update
  useEffect(() => {
    if (conversation.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' });
    }
  }, [conversation, shouldReduceMotion]);

  // Dynamic suggestions based on actual verified concepts
  const getSuggestedQuestions = (): string[] => {
    if (!verifiedConcepts || verifiedConcepts.length === 0) {
      return ['Khái niệm cốt lõi của bài học này là gì?'];
    }

    const hasBFS = verifiedConcepts.some(c => c.id.toLowerCase().includes('bfs'));
    const hasDFS = verifiedConcepts.some(c => c.id.toLowerCase().includes('dfs'));

    if (hasBFS && hasDFS) {
      return [
        'Tại sao BFS dùng Queue thay vì Stack?',
        'Khi nào nên ưu tiên dùng BFS thay vì DFS để tìm đường đi ngắn nhất?',
        'Đoạn nào trong bài học giải thích chi tiết thuật toán DFS?'
      ];
    }

    const suggestions: string[] = [];
    if (verifiedConcepts[0]) {
      suggestions.push(`Khái niệm cốt lõi của ${verifiedConcepts[0].label} là gì?`);
    }
    if (verifiedConcepts[1]) {
      suggestions.push(`Sự khác biệt chính giữa ${verifiedConcepts[0]?.label} và ${verifiedConcepts[1].label}?`);
    }
    if (verifiedConcepts[2]) {
      suggestions.push(`Cách áp dụng ${verifiedConcepts[2].label} trong bài học?`);
    }
    return suggestions.length > 0 ? suggestions : ['Nội dung chính của bài giảng này là gì?'];
  };

  const suggestedQuestions = getSuggestedQuestions();

  const handleSendQuestion = async (textToSend?: string) => {
    const query = (textToSend || chatInput).trim();
    if (!query || asking) return;
    setChatInput('');

    const targetLecture = lectureId;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setConversation(prev => [
      ...prev,
      { id: `s-${Date.now()}`, sender: 'student', text: query, timestamp: timeStr }
    ]);
    setAsking(true);

    if (tutorAbortRef.current) {
      tutorAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    tutorAbortRef.current = abortCtrl;

    try {
      const initialJob = await api.askTutor(targetLecture, query);

      // Check aborted or scope change immediately after initial API request before waiting
      if (abortCtrl.signal.aborted || lectureIdRef.current !== targetLecture) {
        return;
      }

      const tutorJob = await api.waitForJob(initialJob, abortCtrl.signal);

      // Check aborted or scope change immediately after wait finishes
      if (abortCtrl.signal.aborted || lectureIdRef.current !== targetLecture) {
        return;
      }

      const respTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (tutorJob.status === 'completed' && tutorJob.result) {
        const ans = tutorJob.result.answer || 'Không tìm thấy thông tin phù hợp trong nguồn bài giảng.';
        const cites: Evidence[] = tutorJob.result.citations || [];
        const limitNote: string | undefined = tutorJob.result.limitation;

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
        const errMsg = tutorJob.error || 'Trợ lý không thể trả lời câu hỏi này dựa trên các nguồn bài giảng đã xuất bản.';
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
      // Must ignore all aborted callbacks even if error name differs
      if (abortCtrl.signal.aborted || lectureIdRef.current !== targetLecture || err.name === 'AbortError') {
        return;
      }

      const respTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setConversation(prev => [
        ...prev,
        {
          id: `t-${Date.now()}`,
          sender: 'tutor',
          text: `Không thể kết nối với Trợ lý: ${err.detail || err.message || 'Lỗi mạng'}`,
          timestamp: respTimeStr,
          isError: true,
        }
      ]);
    } finally {
      if (!abortCtrl.signal.aborted && lectureIdRef.current === targetLecture) {
        setAsking(false);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-2xl border border-[#e1e7ef] p-5 shadow-2xs flex flex-col space-y-4"
    >
      {/* 1. Header */}
      <div className="pb-3 border-b border-[#e1e7ef]">
        <h3 className="font-bold text-base text-[#12213b]">
          Hỏi về bài học
        </h3>
        <p className="text-[12px] text-[#5f708b] mt-0.5">
          Câu trả lời đi kèm đoạn nguồn để bạn kiểm tra.
        </p>
      </div>

      {/* 2. Chat Stream */}
      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {conversation.length === 0 && (
          <div className="space-y-3 pt-1">
            <div className="p-3 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] text-[13px] text-[#5f708b] leading-relaxed">
              Hỏi về nội dung bài giảng. Trợ lý tìm đoạn nguồn phù hợp; nếu thiếu căn cứ sẽ báo rõ.
            </div>

            <div className="space-y-1.5">
              <span className="text-[12px] font-bold text-[#12213b] uppercase tracking-wider block">
                Gợi ý câu hỏi:
              </span>
              {suggestedQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setChatInput(q);
                    inputRef.current?.focus();
                  }}
                  className="w-full p-2.5 text-left bg-white border border-[#e1e7ef] hover:border-[#2959ea] hover:bg-blue-50/40 rounded-xl text-[13px] text-[#12213b] transition-all cursor-pointer flex items-center justify-between group min-h-[44px]"
                >
                  <span className="line-clamp-2 leading-relaxed">{q}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#5f708b] group-hover:text-[#2959ea] shrink-0 ml-1.5 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {conversation.map((msg) => (
          <div key={msg.id} className="space-y-1">
            {msg.sender === 'student' ? (
              <div className="flex flex-col items-end">
                <div className="bg-[#2959ea] text-white rounded-2xl rounded-tr-xs px-3.5 py-2 text-[14px] leading-relaxed font-medium max-w-[85%] shadow-2xs">
                  {msg.text}
                </div>
                {msg.timestamp && (
                  <span className="text-[11px] text-[#5f708b] mt-0.5 pr-1">
                    {msg.timestamp}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2.5 max-w-[95%]">
                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-[#2959ea] flex items-center justify-center shrink-0 mt-0.5">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className={`p-3.5 rounded-2xl rounded-tl-xs text-[14px] leading-relaxed space-y-2 border ${
                    msg.isError
                      ? 'bg-red-50/70 border-red-200 text-red-900'
                      : 'bg-[#f6f8fc] border-[#e8edf3] text-[#12213b]'
                  }`}>
                    <p>{msg.text}</p>

                    {/* Citations Pill Buttons */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.citations.map((cite, cIdx) => {
                          const isSlide = cite.kind === 'slide';
                          const slidePageExists = isSlide && cite.slide_page != null && slides.some(s => s.page === cite.slide_page);

                          if (isSlide) {
                            if (slidePageExists && cite.slide_page != null) {
                              return (
                                <button
                                  key={cIdx}
                                  type="button"
                                  onClick={() => onViewSlide(cite.slide_page!)}
                                  className="min-h-[44px] inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-[#2959ea] font-semibold text-[13px] px-3 py-1.5 rounded-xl border border-blue-200 transition-colors cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5 text-[#2959ea]" />
                                  <span>Xem Slide {cite.slide_page}</span>
                                </button>
                              );
                            }
                            // Slide page has no extracted viewer page: show citation text without broken click
                            return (
                              <span
                                key={cIdx}
                                className="inline-flex items-center gap-1.5 bg-slate-100 text-[#12213b] font-medium text-[12px] px-2.5 py-1 rounded-lg border border-slate-200"
                              >
                                <FileText className="w-3 h-3 text-slate-500" />
                                <span>Trang slide {cite.slide_page ?? 1}</span>
                              </span>
                            );
                          }

                          if (cite.start != null) {
                            return (
                              <button
                                key={cIdx}
                                type="button"
                                onClick={() => onSeekEvidence(cite)}
                                className="min-h-[44px] inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-[#2959ea] font-semibold text-[13px] px-3 py-1.5 rounded-xl border border-blue-200 transition-colors cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                <span>Xem đoạn nguồn {formatEvidenceLabel(cite)}</span>
                              </button>
                            );
                          }

                          return null;
                        })}
                      </div>
                    )}

                    {msg.limitation && (
                      <p className="text-[12px] text-[#5f708b] italic pt-1 border-t border-slate-200/60">
                        Lưu ý: {msg.limitation}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#5f708b] px-1">
                    <span>Dựa trên bài giảng đã duyệt</span>
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
            <div className="bg-[#f6f8fc] border border-[#e8edf3] rounded-2xl rounded-tl-xs p-3 text-[13px] text-[#5f708b]">
              Trợ lý đang đối chiếu nguồn bài giảng...
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <p className="text-[12px] text-[#5f708b] leading-tight pt-1">
        Nội dung câu hỏi được tổng hợp cho giảng viên để điều chỉnh bài dạy; biểu đồ không hiển thị tên tài khoản.
      </p>

      {/* 3. Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendQuestion();
        }}
        className="pt-2 border-t border-[#e1e7ef]"
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Nhập câu hỏi về nội dung bài học..."
            disabled={asking}
            className="flex-1 min-w-0 bg-white border border-[#e1e7ef] rounded-xl px-3.5 py-2 text-[14px] text-[#12213b] placeholder:text-[#5f708b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] min-h-[44px]"
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
  );
};
