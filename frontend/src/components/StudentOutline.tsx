import React from 'react';
import { Clock, Play, ArrowRight, FileText } from 'lucide-react';
import type { PlannedSegment, Evidence } from '../types';
import { formatTimestamp } from '../presentation';

interface StudentOutlineProps {
  outline: Array<PlannedSegment & { evidence: Evidence | null }>;
  totalMinutes: number;
  onSeekEvidence: (evidence: Evidence) => void;
  hasPublishedAssessment: boolean;
  onNavigateToAssessment: () => void;
}

export const StudentOutline: React.FC<StudentOutlineProps> = ({
  outline,
  totalMinutes,
  onSeekEvidence,
  hasPublishedAssessment,
  onNavigateToAssessment
}) => {
  return (
    <div className="bg-white rounded-2xl border border-[#e1e7ef] p-5 shadow-2xs space-y-4">
      {/* 1. Header with Clock and Total Minutes - Flex wraps cleanly at 320px */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#e1e7ef]">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-[#2959ea]" />
          <h3 className="font-bold text-base text-[#12213b]">
            Lộ trình bài học
          </h3>
        </div>
        {totalMinutes > 0 && (
          <span className="text-[12px] font-semibold text-[#5f708b] bg-[#f6f8fc] px-2.5 py-1 rounded-md border border-[#e1e7ef]">
            Tổng thời lượng: {totalMinutes} phút
          </span>
        )}
      </div>

      <p className="text-[12px] text-[#5f708b] leading-relaxed">
        Thời lượng trên lớp; mốc video nằm trong phần nguồn.
      </p>

      {/* 2. Ordered Planned Segments List - titles wrap, min 44px touch button */}
      <div className="space-y-2">
        {outline.length === 0 ? (
          <p className="text-[13px] text-[#5f708b] italic py-2">
            Chưa có lộ trình bài học cho phiên bản này.
          </p>
        ) : (
          outline.map((segment, idx) => {
            const hasEvidence = Boolean(segment.evidence && segment.evidence.start !== null);

            return (
              <div
                key={segment.id}
                className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                  hasEvidence
                    ? 'border-[#e1e7ef] hover:border-blue-200 bg-white hover:bg-blue-50/30'
                    : 'border-slate-100 bg-[#fbfcfd]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Step Index Number */}
                  <div className="w-7 h-7 rounded-full bg-[#eef4ff] text-[#2959ea] font-bold text-xs flex items-center justify-center shrink-0 border border-blue-100 mt-0.5">
                    {idx + 1}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Title wraps cleanly, never truncates important topics */}
                    <p className="text-[14px] font-semibold text-[#12213b] break-words leading-snug">
                      {segment.title}
                    </p>
                    {hasEvidence && segment.evidence?.start != null && (
                      <span className="text-[12px] font-mono text-[#2959ea] flex items-center gap-1">
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Mốc nguồn: {formatTimestamp(segment.evidence.start)}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[13px] font-medium text-[#5f708b] whitespace-nowrap">
                    {segment.minutes} phút
                  </span>

                  {hasEvidence && segment.evidence && (
                    <button
                      type="button"
                      onClick={() => onSeekEvidence(segment.evidence!)}
                      className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-[#2959ea] hover:bg-blue-100 bg-blue-50 transition-colors flex items-center justify-center cursor-pointer shadow-2xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                      title={`Tua video đến ${formatTimestamp(segment.evidence.start)}`}
                      aria-label={`Tua video đến đoạn ${segment.title} (${formatTimestamp(segment.evidence.start)})`}
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. Bottom CTA Button */}
      <div className="pt-2">
        {hasPublishedAssessment ? (
          <button
            type="button"
            onClick={onNavigateToAssessment}
            className="w-full min-h-[44px] px-4 py-2.5 bg-[#2959ea] hover:bg-blue-700 text-white font-semibold text-[13px] rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
          >
            <FileText className="w-4 h-4" />
            <span>Làm bài luyện tập</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-full min-h-[44px] px-4 py-2.5 bg-slate-100 text-slate-400 font-semibold text-[12px] rounded-xl flex items-center justify-center gap-2 select-none border border-slate-200">
            <span>Chưa có bài luyện tập được giao</span>
          </div>
        )}
      </div>
    </div>
  );
};
