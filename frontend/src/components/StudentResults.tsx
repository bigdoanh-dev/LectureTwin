import React from 'react';
import { Award, FileText, ArrowRight, RotateCcw } from 'lucide-react';
import type { Workspace, ConceptNode } from '../types';
import { currentAssessments } from '../presentation';

interface StudentResultsProps {
  workspace: Workspace | null;
  reviewConcepts: Array<{
    concept: ConceptNode;
    result: { concept_id: string; correct: number; total: number };
  }>;
  onSelectTab: (tab: 'source' | 'knowledge' | 'notes') => void;
  onSelectConcept: (conceptId: string) => void;
  onNavigateToAssessment: () => void;
}

export const StudentResults: React.FC<StudentResultsProps> = ({
  workspace,
  reviewConcepts,
  onSelectTab,
  onSelectConcept,
  onNavigateToAssessment
}) => {
  const evaluated = workspace?.twin?.evaluated;
  const attemptCount = evaluated?.attempt_count ?? 0;
  const averageScore = evaluated?.average_score;
  const conceptResults = evaluated?.concept_results ?? [];
  const hasAssessment = currentAssessments(workspace).some(assessment => assessment.status === 'published');

  return (
    <div className="bg-white rounded-2xl border border-[#e1e7ef] p-5 shadow-2xs space-y-4">
      {/* 1. Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#e1e7ef]">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#2959ea]" />
          <h3 className="font-bold text-base text-[#12213b]">
            Kết quả luyện tập của bạn
          </h3>
        </div>
        {attemptCount > 0 && (
          <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-[#2959ea] border border-blue-200">
            {attemptCount} lượt làm bài
          </span>
        )}
      </div>

      {/* 2. Body: Empty State vs Scored State */}
      {attemptCount === 0 ? (
        <div className="p-6 rounded-xl border border-dashed border-[#e1e7ef] bg-[#fafbfd] flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-base text-[#12213b]">
              Chưa có lượt làm bài
            </p>
            <p className="text-[13px] text-[#5f708b] max-w-xs leading-relaxed">
              Hãy xem video bài học và làm bài luyện tập để kiểm tra mức độ hiểu bài của bạn.
            </p>
          </div>
          {hasAssessment ? <button
            type="button"
            onClick={onNavigateToAssessment}
            className="mt-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#2959ea] hover:bg-blue-700 text-white font-semibold text-[13px] flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <span>Làm bài luyện tập</span>
            <ArrowRight className="w-4 h-4" />
          </button> : <p className="text-[13px] text-[#5f708b]">Giảng viên chưa giao bài luyện tập.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Score highlight */}
          <div className="p-4 rounded-xl bg-[#f6f8fc] border border-[#e1e7ef] flex items-center justify-between">
            <div>
              <span className="text-[12px] text-[#5f708b] font-medium block">
                Điểm trung bình của bạn
              </span>
              <span className="text-2xl font-bold text-[#12213b]">
                {averageScore != null ? `${averageScore}/100` : '--/100'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2959ea] flex items-center justify-center border border-blue-200">
              <Award className="w-5 h-5" />
            </div>
          </div>

          {/* Breakdown per concept */}
          {conceptResults.length > 0 && (
            <div className="space-y-2">
              <span className="text-[12px] font-bold text-[#12213b] uppercase tracking-wider block">
                Kết quả theo từng ý chính:
              </span>
              <div className="space-y-1.5">
                {conceptResults.map((cr) => {
                  const concept = workspace?.concepts.find(c => c.id === cr.concept_id);
                  const label = concept?.label || cr.concept_id;
                  const isPerfect = cr.correct === cr.total;

                  return (
                    <div
                      key={cr.concept_id}
                      className="p-2.5 rounded-lg border border-[#e1e7ef] bg-white flex items-center justify-between text-[13px]"
                    >
                      <span className="font-medium text-[#12213b]">{label}</span>
                      <span className={`font-semibold px-2 py-0.5 rounded-md text-[12px] ${
                        isPerfect
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {cr.correct}/{cr.total} đúng
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review recommendation concepts */}
          {reviewConcepts.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-amber-900">
                <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                <span>Nội dung nên xem lại theo bài làm</span>
              </div>
              <p className="text-[12px] text-amber-800 leading-tight">
                Các câu trả lời chưa chính xác trong bài làm gần nhất:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {reviewConcepts.map(({ concept, result }) => (
                  <button
                    key={concept.id}
                    type="button"
                    onClick={() => {
                      onSelectTab('knowledge');
                      onSelectConcept(concept.id);
                    }}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300 hover:border-blue-300 text-[13px] font-medium text-[#12213b] hover:text-[#2959ea] transition-colors cursor-pointer"
                  >
                    <span>{concept.label}</span>
                    <span className="text-[12px] text-red-600 font-semibold">
                      ({result.correct}/{result.total})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-[12px] text-[#5f708b] leading-relaxed">
            Kết quả tính từ các bài nộp của riêng bạn, không phản ánh toàn lớp.
          </p>

          <button
            type="button"
            onClick={onNavigateToAssessment}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-[#e1e7ef] text-[#2959ea] font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>Xem lại bài kiểm tra</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
