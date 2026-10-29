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

const HISTORY_COPY: Record<string, { title: string; summary: string }> = {
  created: { title: 'Tạo bài giảng', summary: 'Giảng viên đã đặt mục tiêu và tạo bản nháp.' },
  sample_attached: { title: 'Thêm học liệu mẫu', summary: 'Đã thêm bộ học liệu soạn sẵn; đây không phải nội dung tự nhận dạng từ video.' },
  asset_uploaded: { title: 'Tải học liệu lên', summary: 'Đã thêm học liệu mới; cần phân tích lại để tạo gợi ý từ nguồn này.' },
  observed_draft: { title: 'Tạo gợi ý nội dung', summary: 'Đã tạo gợi ý ý chính; giảng viên cần kiểm tra nguồn trước khi sử dụng.' },
  teacher_review: { title: 'Giảng viên duyệt nội dung', summary: 'Giảng viên đã quyết định với các ý chính và nguồn dẫn được gợi ý.' },
  analysis_verified: { title: 'Hoàn tất kiểm tra nội dung', summary: 'Nội dung đã qua bước kiểm tra và sẵn sàng để giảng viên xem xét xuất bản.' },
  evaluated: { title: 'Ghi nhận bài làm mới', summary: 'Đã ghi nhận lượt làm bài để tổng hợp kết quả học tập.' },
  scenario_evaluated: { title: 'Chạy thử phương án', summary: 'Đã tính kết quả phương án thử; bài gốc và điểm số học viên không thay đổi.' },
  scenario_draft_version: { title: 'Lưu phương án thành bản nháp', summary: 'Đã tạo bản nháp từ phương án; bản đã xuất bản vẫn giữ nguyên.' },
  draft_edited: { title: 'Cập nhật bản nháp', summary: 'Giảng viên đã chỉnh sửa thông tin bài giảng.' },
  concept_edited: { title: 'Chỉnh sửa ý chính', summary: 'Ý chính đã được sửa và cần giảng viên duyệt lại.' },
  prepared_publication: { title: 'Chuẩn bị bài mẫu', summary: 'Bài mẫu đã được chuẩn bị để học viên trải nghiệm.' },
  published: { title: 'Xuất bản bài giảng', summary: 'Giảng viên đã xuất bản nội dung hiện tại cho học viên.' },
};

export const LectureTwinView: React.FC = () => {
  const { workspace } = useApp();
  const shouldReduceMotion = useReducedMotion();

  const twin = workspace?.twin;
  const planned = workspace?.planned || twin?.planned;
  const lecture = workspace?.lecture;
  const snapshots = twin?.snapshots || [];

  const plannedMinutes = planned?.total_minutes ?? lecture?.total_minutes ?? null;
  const objectivesCount = planned?.objectives?.length ?? lecture?.objectives?.length ?? 0;
  const segments = planned?.segments || [];
  const isPreparedSample = lecture?.sample_attached === true;

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
          Tình hình bài giảng
        </h1>
        <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
          Xem kế hoạch, nội dung đã đối chiếu, kết quả bài làm và các phương án thử. Mỗi con số chỉ phản ánh dữ liệu hiện có của bài học.
        </p>
      </div>

      {/* 4 States Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 text-emerald-600 font-bold text-sm">
            <Target className="w-5 h-5" />
            <span>Kế hoạch bài học</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {plannedMinutes !== null ? `${plannedMinutes} phút dự kiến` : 'Chưa đặt thời lượng'}
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            {objectivesCount > 0 ? `${objectivesCount} mục tiêu học tập.` : 'Chưa có mục tiêu học tập.'}
            {segments.length > 0 ? ` Bài giảng được chia thành ${segments.length} phần.` : ''}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 text-amber-600 font-bold text-sm">
            <Eye className="w-5 h-5" />
            <span>Ý chính trong bài giảng</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {observedConcepts} ý chính
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            {isPreparedSample
              ? 'Nội dung và nguồn dẫn đã được chuẩn bị sẵn trong bài mẫu.'
              : `${verifiedConcepts} đã được giảng viên duyệt${openFindings > 0 ? `; ${openFindings} đang chờ duyệt` : ''}.`}
            {' '}Số này không đo mức độ học viên hiểu bài.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 text-[#2959ea] font-bold text-sm">
            <BarChart2 className="w-5 h-5" />
            <span>Bài làm của học viên</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {attemptCount} lượt đã nộp
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            {attemptCount > 0 && avgScore !== null && avgScore !== undefined
              ? `Điểm trung bình từ lượt nộp mới nhất của mỗi học viên cho từng bài kiểm tra: ${Math.round(avgScore)}/100.`
              : 'Chưa có lượt làm bài được nộp.'}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2 text-purple-600 font-bold text-sm">
            <FileCode className="w-5 h-5" />
            <span>Phương án thử</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {scenarioCount} phương án đã lưu
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            {scenarioCount > 0
              ? 'Các bản thử dùng để so sánh thay đổi, chưa áp dụng vào lớp.'
              : 'Chưa lưu phương án thử nào cho bài giảng này.'}
          </p>
        </div>
      </div>

      {/* Snapshot History */}
      <div className="bg-white rounded-xl border border-[#e1e7ef] p-6 shadow-2xs space-y-4">
        <h2 className="font-bold text-sm sm:text-base text-[#12213b] flex items-center space-x-2">
          <Clock className="w-4 h-4 text-[#2959ea]" />
          <span>Lịch sử cập nhật bài giảng ({snapshots.length})</span>
        </h2>

        {snapshots.length === 0 ? (
          <div className="text-center py-6 text-[#5f708b] text-xs italic">
            Chưa có cập nhật nào được ghi lại.
          </div>
        ) : (
          <div className="divide-y divide-[#e1e7ef]">
            {snapshots.map((snap) => (
              <div key={snap.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-[#2959ea] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      Phiên bản {snap.version}
                    </span>
                    <strong className="text-[#12213b]">{HISTORY_COPY[snap.event]?.title || 'Cập nhật bài giảng'}</strong>
                  </div>
                  <p className="text-[#5f708b] mt-1">{HISTORY_COPY[snap.event]?.summary || 'Có thay đổi được ghi lại cho bài giảng này.'}</p>
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
