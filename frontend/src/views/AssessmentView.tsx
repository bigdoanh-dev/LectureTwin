import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BarChart2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Send,
  FileQuestion,
  Check,
  Edit3
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import { ModalDialog } from '../components/ModalDialog';
import { QuizSubmissionResult, Assessment, AssessmentQuestion } from '../types';
import { currentAssessments } from '../presentation';

export const AssessmentView: React.FC = () => {
  const { workspace, currentLectureId, role, refreshWorkspace, setCurrentView } = useApp();
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [submissionResult, setSubmissionResult] = useState<QuizSubmissionResult | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingQuestions, setEditingQuestions] = useState<AssessmentQuestion[] | null>(null);
  const [editError, setEditError] = useState('');
  const [savingQuestions, setSavingQuestions] = useState(false);
  const closeEditor = useCallback(() => { if (!savingQuestions) setEditingQuestions(null); }, [savingQuestions]);

  const shouldReduceMotion = useReducedMotion();
  const genAbortRef = useRef<AbortController | null>(null);

  // Current assessments for active lecture version, newest first (Review line 36)
  const assessments = currentAssessments(workspace);
  // For students, only show published assessments
  const activeAssessment: Assessment | null = role === 'student'
    ? (assessments.find(a => a.status === 'published') || null)
    : (assessments[0] || null);

  // Reset selected answers, submission result, and messages on lecture or assessment change (Review line 26)
  useEffect(() => {
    setSelectedAnswers({});
    setSubmissionResult(null);
    setMsg(null);
    setEditingQuestions(null);
  }, [currentLectureId, activeAssessment?.id]);

  // Abort ongoing generation on unmount (Review line 26)
  useEffect(() => {
    return () => {
      if (genAbortRef.current) {
        genAbortRef.current.abort();
        genAbortRef.current = null;
      }
    };
  }, []);

  const evaluated = workspace?.twin?.evaluated;
  const attemptCount = evaluated?.attempt_count ?? 0;
  const avgScore = evaluated?.average_score;

  const handleSelectOption = (qid: string, optId: string) => {
    if (submissionResult || role === 'teacher') return;
    setSelectedAnswers(prev => ({ ...prev, [qid]: optId }));
  };

  const handleSubmitQuiz = async () => {
    if (!activeAssessment || role === 'teacher') return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await api.submitQuiz(activeAssessment.id, selectedAnswers);
      setSubmissionResult(res);
      await refreshWorkspace();
    } catch (err: any) {
      setMsg(err.detail || err.message || 'Lỗi khi nộp bài kiểm tra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateAssessment = async () => {
    if (!currentLectureId) return;
    if (genAbortRef.current) {
      genAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    genAbortRef.current = abortCtrl;

    setGenerating(true);
    setMsg(null);
    try {
      const initialJob = await api.generateAssessment(currentLectureId);
      const asmtJob = await api.waitForJob(initialJob, abortCtrl.signal);

      if (asmtJob.status === 'completed') {
        await refreshWorkspace();
        setMsg('Đã tạo đề kiểm tra mới thành công từ bài giảng.');
      } else {
        setMsg(asmtJob.error || 'Không thể tạo đề kiểm tra.');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setMsg(err.detail || err.message || 'Lỗi tạo bài kiểm tra');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublishAssessment = async (id: string) => {
    try {
      await api.publishAssessment(id);
      await refreshWorkspace();
      setMsg('Đã xuất bản đề kiểm tra cho học viên.');
    } catch (err: any) {
      setMsg(err.detail || 'Lỗi xuất bản');
    }
  };

  const saveQuestions = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeAssessment || !editingQuestions) return;
    setSavingQuestions(true); setEditError('');
    try {
      await api.patchAssessment(activeAssessment.id, {questions: editingQuestions});
      await refreshWorkspace(); setEditingQuestions(null); setMsg('Đã lưu câu hỏi nháp. Kiểm tra lại nguồn và đáp án trước khi giao bài.');
    } catch (error: any) { setEditError(error.message); }
    finally { setSavingQuestions(false); }
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-[#12213b] tracking-tight leading-tight">
            {role === 'teacher' ? 'Bài kiểm tra và kết quả học viên' : 'Bài kiểm tra của bạn'}
          </h1>
          <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
            {role === 'teacher'
              ? 'Tạo câu hỏi, giao bài và xem số lượt nộp cùng kết quả thực tế của học viên.'
              : 'Làm bài kiểm tra đã được giảng viên giao và xem giải thích sau khi nộp.'}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-600">{workspace?.lecture.title}</p>
        </div>

        {role === 'teacher' && (
          <button
            type="button"
            onClick={handleGenerateAssessment}
            disabled={generating}
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 shadow-xs transition-colors cursor-pointer self-start sm:self-auto flex items-center gap-1.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
          >
            <Sparkles className="w-4 h-4" />
            <span>{generating ? 'Đang tạo câu hỏi...' : 'Tạo câu hỏi từ bài giảng'}</span>
          </button>
        )}
      </div>

      {msg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-[#12213b] flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="text-[#2959ea] font-bold p-1">✕</button>
        </div>
      )}

      {/* Teacher View: Class Analytics Summary (Actual Workspace Data ONLY, no placeholders) */}
      {role === 'teacher' && (
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <h2 className="font-bold text-sm sm:text-base text-[#12213b] flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-[#2959ea]" />
            <span>Kết quả từ bài làm đã nộp</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-[#f6f8fc] p-3.5 rounded-xl border border-[#e1e7ef]">
              <span className="text-[#5f708b] block text-xs font-medium">Lượt học viên đã nộp</span>
              <strong className="text-lg text-[#12213b] mt-1 block font-bold">
                {attemptCount > 0 ? `${attemptCount} lượt` : '0 lượt'}
              </strong>
            </div>

            <div className="bg-[#f6f8fc] p-3.5 rounded-xl border border-[#e1e7ef]">
              <span className="text-[#5f708b] block text-xs font-medium">Điểm trung bình</span>
              <strong className="text-lg text-[#2959ea] mt-1 block font-bold">
                {attemptCount > 0 && avgScore != null
                  ? `${Math.round(avgScore)} / 100`
                  : 'Chưa có kết quả'}
              </strong>
              <span className="mt-1 block text-[11px] leading-snug text-[#5f708b]">
                Tính từ lượt nộp mới nhất của mỗi học viên cho từng bài kiểm tra thuộc phiên bản {workspace?.lecture.version}.
              </span>
            </div>

            <div className="bg-[#f6f8fc] p-3.5 rounded-xl border border-[#e1e7ef]">
              <span className="text-[#5f708b] block text-xs font-medium">Ý chính có trong câu hỏi</span>
              <strong className="text-sm sm:text-base text-[#12213b] mt-1 block font-bold break-words">
                {activeAssessment?.questions.length
                  ? [...new Set(activeAssessment.questions.map(q => workspace?.concepts.find(c => c.id === q.concept_id)?.label || q.concept_id))].join(', ')
                  : 'Chưa có câu hỏi'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Area */}
      {!activeAssessment ? (
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-8 text-center shadow-2xs space-y-3">
          <FileQuestion className="w-10 h-10 text-[#5f708b] mx-auto opacity-40" />
          <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
            {role === 'student'
              ? 'Giảng viên chưa xuất bản bài kiểm tra cho bài học này.'
              : 'Chưa có bài kiểm tra nào được tạo.'}
          </h3>
          <p className="text-xs text-[#5f708b] max-w-md mx-auto">
            {role === 'student'
              ? 'Vui lòng quay lại sau khi giảng viên hoàn tất thẩm định và xuất bản câu hỏi.'
              : 'Chọn “Tạo câu hỏi từ bài giảng”, kiểm tra câu hỏi được gợi ý rồi xuất bản cho lớp.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#e1e7ef] gap-2">
            <div>
              <span className="text-xs text-[#5f708b] block">Phiên bản {activeAssessment.version} · {activeAssessment.questions.length} câu hỏi</span>
              <h2 className="font-bold text-base sm:text-lg text-[#12213b] mt-0.5">
                {activeAssessment.title}
              </h2>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full self-start sm:self-auto ${
              activeAssessment.status === 'published'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {activeAssessment.status === 'published' ? 'Đã giao cho học viên' : 'Bản nháp, chưa giao'}
            </span>
          </div>

          {/* Questions list */}
          <div className="space-y-4">
            {activeAssessment.questions.map((q, idx) => {
              const resultItem = submissionResult?.feedback?.find(f => f.question_id === q.id);

              return (
                <div key={q.id} className="bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-4 sm:p-5 space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-[#2959ea] text-white font-bold flex items-center justify-center shrink-0 text-xs">
                      {idx + 1}
                    </span>
                    <div className="flex-1 font-bold text-xs sm:text-sm text-[#12213b] leading-snug">
                      {q.text}
                    </div>
                  </div>

                  {/* Options: Read-only preview for Teacher, Interactive buttons for Student */}
                  {role === 'teacher' ? (
                    <div className="space-y-2 pl-0 sm:pl-8">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oIdx) => {
                          const optText = typeof opt === 'string' ? opt : (opt as any).text;
                          const optVal = typeof opt === 'string' ? opt : (opt as any).id;
                          const isCorrect = optVal === q.correct_option_id;

                          return (
                            <div
                              key={oIdx}
                              className={`p-3 rounded-xl border text-left font-medium text-xs flex items-center justify-between ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                                  : 'bg-white border-[#e1e7ef] text-[#12213b]'
                              }`}
                            >
                              <span>{optText}</span>
                              {isCorrect && (
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-md shrink-0 ml-2">
                                  Đáp án đúng
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 text-xs text-[#12213b] leading-relaxed">
                          <span className="font-bold text-[#2959ea] block mb-0.5">Giải thích dẫn chứng:</span>
                          <p>{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 pl-0 sm:pl-8">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oIdx) => {
                          const optText = typeof opt === 'string' ? opt : (opt as any).text;
                          const optVal = typeof opt === 'string' ? opt : (opt as any).id;
                          const isSelected = selectedAnswers[q.id] === optVal;
                          return (
                            <button
                              key={oIdx}
                              type="button"
                              onClick={() => handleSelectOption(q.id, optVal)}
                              disabled={!!submissionResult}
                              className={`min-h-[44px] p-3 rounded-xl border text-left font-semibold text-xs transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
                                isSelected
                                  ? 'bg-[#2959ea] text-white border-[#2959ea] shadow-2xs'
                                  : 'bg-white text-[#12213b] border-[#e1e7ef] hover:bg-slate-50'
                              }`}
                            >
                              {optText}
                            </button>
                          );
                        })}
                      </div>

                      {/* Feedback Explanation after student submit */}
                      {resultItem && (
                        <div className={`mt-3 p-3.5 rounded-xl border text-xs leading-relaxed ${
                          resultItem.correct ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
                        }`}>
                          <div className="font-bold flex items-center space-x-1.5 mb-1">
                            {resultItem.correct ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>Chính xác!</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4 text-rose-600" />
                                <span>Chưa chính xác!</span>
                              </>
                            )}
                          </div>
                          <p>{resultItem.explanation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Actions: Teacher (read-only actions) vs Student (submit actions) */}
          {role === 'teacher' ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-[#e1e7ef] gap-3">
              {activeAssessment.status === 'draft' && <button
                type="button"
                onClick={() => {setEditError(''); setEditingQuestions(structuredClone(activeAssessment.questions));}}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[#2959ea] hover:bg-blue-50 border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Edit3 className="w-4 h-4" />
                <span>Chỉnh sửa câu hỏi</span>
              </button>}

              {activeAssessment.status !== 'published' && (
                <button
                  type="button"
                  onClick={() => handlePublishAssessment(activeAssessment.id)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer self-start sm:self-auto"
                >
                  <Check className="w-4 h-4" />
                  <span>Duyệt câu hỏi và giao bài</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-[#e1e7ef] gap-3">
              {submissionResult ? (
                <div className="text-xs font-bold text-[#12213b]">
                  Kết quả bài làm: <strong className="text-[#2959ea] text-base">{submissionResult.score}/100</strong> ({submissionResult.correct_count}/{submissionResult.total} câu đúng)
                </div>
              ) : (
                <span className="text-xs text-[#5f708b]">
                  Chọn các phương án và bấm nộp bài để nhận phản hồi giải thích.
                </span>
              )}

              {!submissionResult && (
                <button
                  type="button"
                  onClick={handleSubmitQuiz}
                  disabled={submitting || Object.keys(selectedAnswers).length < activeAssessment.questions.length}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 disabled:opacity-40 shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Đang chấm điểm...' : 'Nộp bài kiểm tra'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <ModalDialog isOpen={editingQuestions !== null} onClose={closeEditor} title="Chỉnh sửa câu hỏi nháp" maxWidth="max-w-2xl">
        <form onSubmit={saveQuestions} className="space-y-5">
          <p className="text-sm leading-relaxed text-slate-500">Câu hỏi giữ liên kết với khái niệm và nguồn ban đầu. Giảng viên cần kiểm tra lại nội dung thay đổi trước khi giao bài.</p>
          {editingQuestions?.map((q, index) => <fieldset key={q.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-bold">Câu {index + 1}</legend>
            <label className="block text-sm">Nội dung câu hỏi<textarea required minLength={3} value={q.text} onChange={e=>setEditingQuestions(questions=>questions!.map((item,i)=>i===index?{...item,text:e.target.value}:item))} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm"/></label>
            {q.options.map(option=><label key={option.id} className="flex items-center gap-3 text-sm"><input type="radio" required name={`correct-${q.id}`} checked={q.correct_option_id===option.id} onChange={()=>setEditingQuestions(questions=>questions!.map((item,i)=>i===index?{...item,correct_option_id:option.id}:item))} aria-label={`Đặt đáp án ${option.id} cho câu ${index+1}`}/><input required value={option.text} aria-label={`Phương án ${option.id} câu ${index+1}`} onChange={e=>setEditingQuestions(questions=>questions!.map((item,i)=>i===index?{...item,options:item.options.map(o=>o.id===option.id?{...o,text:e.target.value}:o)}:item))} className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-200 px-3"/></label>)}
            <label className="block text-sm">Giải thích dựa trên nguồn<textarea value={q.explanation || ''} onChange={e=>setEditingQuestions(questions=>questions!.map((item,i)=>i===index?{...item,explanation:e.target.value}:item))} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm"/></label>
          </fieldset>)}
          {editError && <p role="alert" className="text-sm text-red-700">{editError}</p>}
          <button disabled={savingQuestions} className="min-h-[44px] rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{savingQuestions?'Đang lưu…':'Lưu câu hỏi nháp'}</button>
        </form>
      </ModalDialog>
    </motion.div>
  );
};
