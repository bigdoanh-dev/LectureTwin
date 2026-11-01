import React from 'react';
import {
  ShieldCheck,
  Clock,
  Video,
  Target,
  FileText,
  CheckSquare,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import type { Workspace } from '../types';
import type { studentLearningOverview } from '../student-model';
import { currentAssessments } from '../presentation';

interface StudentOverviewProps {
  workspace: Workspace | null;
  model: ReturnType<typeof studentLearningOverview>;
  onSelectTab: (tab: 'source' | 'knowledge' | 'notes') => void;
  onSelectConcept: (conceptId: string) => void;
  onNavigateToAssessment: () => void;
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return 'Chưa có thông tin thời lượng nguồn';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs} giây`;
  if (secs === 0) return `${mins} phút`;
  return `${mins} phút ${secs} giây`;
}

export const StudentOverview: React.FC<StudentOverviewProps> = ({
  workspace,
  model,
  onSelectTab,
  onSelectConcept,
  onNavigateToAssessment
}) => {
  // Only render when workspace exists
  if (!workspace) return null;

  const publishedAssessments = currentAssessments(workspace).filter(a => a.status === 'published');
  const activeAssessment = publishedAssessments[0] || null;

  // Source duration ONLY from model.primaryVideo.duration_seconds; no fabricated 1109 fallback
  const sourceDurationSeconds = model.primaryVideo?.duration_seconds ?? null;

  // Real planned duration
  const plannedMinutes = workspace.planned?.total_minutes;

  // Real published version
  const publishedVersion = workspace.lecture.published_version ?? workspace.lecture.version;

  // Verification status based on actual verified evidence & publication state
  const hasVerifiedEvidence = model.evidence.length > 0;
  const isPublished = workspace.lecture.status === 'published';

  return (
    <div className="bg-white rounded-2xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-5">
      {/* 1. Header Line: Title & Provenance Metadata */}
      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-bold text-[#12213b] tracking-tight">
          {workspace.lecture.title || 'Bài học'}
        </h2>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-[#5f708b] font-medium">
          {/* Status Badge based on actual evidence and publication */}
          {hasVerifiedEvidence ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[12px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Đã xác minh nguồn ({model.evidence.length} dẫn chứng)</span>
            </span>
          ) : isPublished ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-[#2959ea] border border-blue-200 font-semibold text-[12px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Giảng viên đã xuất bản</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-[12px]">
              <span>Bản nháp</span>
            </span>
          )}

          {publishedVersion && (
            <>
              <span className="hidden sm:inline text-slate-300">|</span>
              <span>Phiên bản v{publishedVersion}</span>
            </>
          )}

          {plannedMinutes != null && plannedMinutes > 0 && (
            <>
              <span className="hidden sm:inline text-slate-300">|</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{plannedMinutes} phút (kế hoạch)</span>
              </span>
            </>
          )}

          <span className="hidden sm:inline text-slate-300">|</span>

          <span className="inline-flex items-center gap-1">
            <Video className="w-3.5 h-3.5 text-slate-400" />
            <span>Thời lượng nguồn: {formatDuration(sourceDurationSeconds)}</span>
          </span>
        </div>
      </div>

      {/* Warning if sample notes are outdated */}
      {workspace.research?.sample_notes_outdated && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900 leading-relaxed">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Bản phát hành này dùng bộ ghi chú mẫu cũ. Mốc nguồn cần được giảng viên đối chiếu và cập nhật ở phiên bản tiếp theo.
          </span>
        </div>
      )}

      {/* 2. Three-column Horizontal Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {/* Card 1: Mục tiêu bài học (Objectives readable 14px body text) */}
        <div className="rounded-xl border border-[#e1e7ef] bg-[#fcfdfe] p-4 sm:p-5 flex flex-col justify-between space-y-3 hover:border-blue-200 transition-colors">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2959ea] flex items-center justify-center shrink-0">
                <Target className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-base text-[#12213b]">
                Mục tiêu bài học
              </h3>
            </div>

            {model.objectives.length === 0 ? (
              <p className="text-[13px] text-[#5f708b] italic">
                Chưa có mục tiêu cho bài học này.
              </p>
            ) : (
              <div className="space-y-3 pt-1">
                {model.objectives.map((obj) => (
                  <div key={obj.id} className="space-y-1.5">
                    <p className="text-[14px] font-semibold text-[#12213b] leading-relaxed">
                      • {obj.title}
                    </p>
                    {obj.hasConfirmedMapping ? (
                      obj.concepts.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 pl-3">
                          <span className="text-[12px] text-[#5f708b]">Nội dung bảo chứng:</span>
                          {obj.concepts.map((concept) => (
                            <button
                              key={concept.id}
                              type="button"
                              onClick={() => {
                                onSelectTab('knowledge');
                                onSelectConcept(concept.id);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-[#2959ea] font-medium text-[13px] border border-blue-200 transition-colors cursor-pointer"
                              title={`Xem chi tiết ${concept.label}`}
                            >
                              <span>{concept.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-[#5f708b] pl-3 italic">
                          Chưa có nội dung đã xác nhận cho mục tiêu này.
                        </p>
                      )
                    ) : (
                      <p className="text-[12px] text-[#5f708b] pl-3 italic">
                        Giảng viên chưa liên kết nguồn cho mục tiêu này.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[12px] text-[#5f708b] border-t border-slate-100 pt-2">
            Mục tiêu là định hướng học tập do giảng viên xác lập.
          </p>
        </div>

        {/* Card 2: Nội dung được học (Actual knowledge/descriptions only) */}
        <div className="rounded-xl border border-[#e1e7ef] bg-[#fcfdfe] p-4 sm:p-5 flex flex-col justify-between space-y-3 hover:border-blue-200 transition-colors">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2959ea] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-base text-[#12213b]">
                Nội dung được học
              </h3>
            </div>

            {model.knowledge.length === 0 ? (
              <p className="text-[13px] text-[#5f708b] italic">
                Chưa có nội dung bài học nào được duyệt để xuất bản.
              </p>
            ) : (
              <div className="space-y-2.5 pt-1 text-[#12213b]">
                <p className="text-[14px] text-[#5f708b] leading-relaxed">
                  {model.knowledge.map(c => c.label).join(', ')}.
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {model.knowledge.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelectTab('knowledge');
                        onSelectConcept(c.id);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-[#2959ea] text-[#12213b] font-medium text-[13px] transition-colors border border-slate-200 cursor-pointer"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => onSelectTab('knowledge')}
              className="text-[13px] font-semibold text-[#2959ea] hover:underline flex items-center gap-1 cursor-pointer min-h-[44px]"
            >
              <span>Mở bản đồ kiến thức · {model.knowledge.length} khái niệm</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card 3: Bài luyện tập (Count actual published assessments) */}
        <div className="rounded-xl border border-[#e1e7ef] bg-[#fcfdfe] p-4 sm:p-5 flex flex-col justify-between space-y-3 hover:border-blue-200 transition-colors">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2959ea] flex items-center justify-center shrink-0">
                <CheckSquare className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-base text-[#12213b]">
                Bài luyện tập
              </h3>
            </div>

            {activeAssessment ? (
              <div className="space-y-2 pt-1 text-[#12213b]">
                <p className="font-semibold text-[14px] text-[#12213b]">
                  {activeAssessment.title}
                </p>
                <p className="text-[13px] text-[#5f708b] leading-relaxed">
                  {publishedAssessments.length > 1
                    ? `Có ${publishedAssessments.length} bài luyện tập đã giao. Đang mở bài: ${activeAssessment.questions.length} câu hỏi bám sát nguồn đã duyệt.`
                    : `Làm bài kiểm tra gồm ${activeAssessment.questions.length} câu hỏi bám sát nguồn đã duyệt.`}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-[#5f708b] italic pt-1">
                Giảng viên chưa xuất bản bài kiểm tra cho bài học này.
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-2">
            {activeAssessment ? (
              <button
                type="button"
                onClick={onNavigateToAssessment}
                className="w-full min-h-[44px] px-3.5 py-2 bg-[#2959ea] hover:bg-blue-700 text-white rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <span>Làm bài luyện tập</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="text-[12px] text-slate-400 block py-1">
                Chưa giao bài luyện tập
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
