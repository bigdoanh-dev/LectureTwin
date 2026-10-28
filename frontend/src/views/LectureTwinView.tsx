import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Target,
  Eye,
  BarChart2,
  FileCode,
  Clock
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LectureTwinView: React.FC = () => {
  const { workspace } = useApp();
  const shouldReduceMotion = useReducedMotion();

  const twin = workspace?.twin;
  const planned = workspace?.planned || twin?.planned;
  const lecture = workspace?.lecture;
  const snapshots = twin?.snapshots || [];

  const plannedMinutes = planned?.total_minutes || lecture?.total_minutes || 50;
  const objectivesCount = planned?.objectives?.length || lecture?.objectives?.length || 0;
  const segments = planned?.segments || [];

  const observedConcepts = twin?.observed?.concepts ?? workspace?.concepts?.length ?? 0;
  const verifiedConcepts = twin?.observed?.verified ?? workspace?.concepts?.filter(c => c.verified).length ?? 0;
  const openFindings = twin?.observed?.open_findings ?? workspace?.findings?.filter(f => f.status === 'pending').length ?? 0;

  const attemptCount = twin?.evaluated?.attempt_count ?? 0;
  const avgScore = twin?.evaluated?.average_score;
  const scenarioCount = workspace?.scenarios?.length ?? twin?.scenarios?.count ?? 0;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      <div>
        <h1 className="text-[26px] sm:text-[30px] font-bold text-[#12213b] tracking-tight leading-tight">
          Lecture Digital Twin — 4 trạng thái số
        </h1>
        <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
          Bản sao số phản ánh trung thực từ Đề cương dự kiến, Thực tế diễn ra trong video, Đánh giá học viên và Kịch bản thử nghiệm.
        </p>
      </div>

      {/* 4 States Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* State 1: Kế hoạch (Planned) */}
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 text-emerald-600 font-bold text-sm">
            <Target className="w-5 h-5" />
            <span>1. Planned State</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {plannedMinutes} phút
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            {objectivesCount} mục tiêu học tập (CLO) đã khai báo.
            {segments.length > 0 ? ` Gồm ${segments.length} phân đoạn bài giảng.` : ' Chưa phân chia phân đoạn chi tiết.'}
          </p>
        </div>

        {/* State 2: Quan sát thực tế (Observed) */}
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 text-amber-600 font-bold text-sm">
            <Eye className="w-5 h-5" />
            <span>2. Observed State</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {observedConcepts} Khái niệm
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            Bóc tách từ nguồn bài giảng. {verifiedConcepts} đã xác minh, {openFindings} cần thẩm định.
          </p>
        </div>

        {/* State 3: Đánh giá học viên (Evaluated) */}
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 text-[#2959ea] font-bold text-sm">
            <BarChart2 className="w-5 h-5" />
            <span>3. Evaluated State</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {attemptCount} Lượt nộp
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            {attemptCount > 0 && avgScore !== null && avgScore !== undefined
              ? `Điểm trung bình thực tế: ${Math.round(avgScore)}/100.`
              : 'Chưa có kết quả làm bài trắc nghiệm từ học viên.'}
          </p>
        </div>

        {/* State 4: Kịch bản cải tiến (Scenario) */}
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 text-purple-600 font-bold text-sm">
            <FileCode className="w-5 h-5" />
            <span>4. Scenario State</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {scenarioCount} Kịch bản
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            {scenarioCount > 0
              ? `${scenarioCount} kịch bản thử nghiệm phân bổ thời lượng.`
              : 'Chưa tạo kịch bản mô phỏng nào cho bài giảng này.'}
          </p>
        </div>
      </div>

      {/* Snapshot History */}
      <div className="bg-white rounded-xl border border-[#e1e7ef] p-6 shadow-2xs space-y-4">
        <h2 className="font-bold text-sm sm:text-base text-[#12213b] flex items-center space-x-2">
          <Clock className="w-4 h-4 text-[#2959ea]" />
          <span>Lịch sử các phiên bản Bản sao số (Snapshots — {snapshots.length})</span>
        </h2>

        {snapshots.length === 0 ? (
          <div className="text-center py-6 text-[#5f708b] text-xs italic">
            Chưa có snapshot nào được tạo cho bài giảng này.
          </div>
        ) : (
          <div className="divide-y divide-[#e1e7ef]">
            {snapshots.map((snap) => (
              <div key={snap.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-[#2959ea] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      v{snap.version}
                    </span>
                    <strong className="text-[#12213b]">{snap.event}</strong>
                  </div>
                  <p className="text-[#5f708b] mt-1">{snap.summary}</p>
                </div>
                <span className="font-mono text-[#5f708b] text-[11px] shrink-0">
                  {new Date(snap.created_at).toLocaleString('vi-VN')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
