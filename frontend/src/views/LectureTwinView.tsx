import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Target,
  Eye,
  BarChart2,
  FileCode,
  Clock
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';

const HISTORY_COPY: Record<string, { title: string; summary: string }> = {
  guided_demo_created: { title: 'Tạo bài thực hành từng bước', summary: 'Đã sao chép học liệu sang bản thực hành riêng để quan sát xử lý; giữ nguyên bài gốc.' },
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
  teaching_strategy_reviewed: { title: 'Đối chiếu đề xuất dạy học', summary: 'Hướng ôn nguồn và luyện tập đã được giảng viên xem xét; khi được xác nhận, trợ lý học tập chỉ dùng hướng dẫn cho phản hồi liên quan. Không tự sửa bài học.' },
  prepared_publication: { title: 'Chuẩn bị bài mẫu', summary: 'Bài mẫu đã được chuẩn bị để học viên trải nghiệm.' },
  published: { title: 'Xuất bản bài giảng', summary: 'Giảng viên đã xuất bản nội dung hiện tại cho học viên.' },
  clo_mapping_reviewed: { title: 'Đối chiếu chuẩn đầu ra', summary: 'Giảng viên đã xác nhận liên kết kiến thức với CLO theo nguồn của phiên bản này.' },
};

export const LectureTwinView: React.FC = () => {
  const { workspace, currentLectureId, refreshWorkspace } = useApp();
  const shouldReduceMotion = useReducedMotion();

  const twin = workspace?.twin;
  const planned = workspace?.planned || twin?.planned;
  const lecture = workspace?.lecture;
  const snapshots = twin?.snapshots || [];
  const learner = twin?.learner;

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
  const [proposalNotes, setProposalNotes] = useState<Record<string, string>>({});
  const [proposalBusyId, setProposalBusyId] = useState<string | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [localProposalDecisions, setLocalProposalDecisions] = useState<Record<string, 'confirm' | 'reject'>>({});
  const proposalRequestRef = useRef(0);
  const selectedLectureRef = useRef({ id: currentLectureId, version: lecture?.version });
  selectedLectureRef.current = { id: currentLectureId, version: lecture?.version };

  useEffect(() => {
    proposalRequestRef.current++;
    setProposalNotes({});
    setProposalBusyId(null);
    setProposalError(null);
    setLocalProposalDecisions({});
  }, [currentLectureId, lecture?.version]);

  const decideProposal = async (proposalId: string, decision: 'confirm' | 'reject') => {
    const selected = selectedLectureRef.current;
    const stateId = learner?.state_id;
    const note = proposalNotes[proposalId]?.trim() || '';
    if (!selected.id || selected.version == null || !stateId || note.length < 3 || proposalBusyId) return;
    const requestId = ++proposalRequestRef.current;
    setProposalBusyId(proposalId);
    setProposalError(null);
    try {
      await api.decideTeachingProposal(selected.id, proposalId, decision, note, stateId);
      const stillSelected = selectedLectureRef.current.id === selected.id && selectedLectureRef.current.version === selected.version && requestId === proposalRequestRef.current;
      if (!stillSelected) return;
      setLocalProposalDecisions(previous => ({ ...previous, [proposalId]: decision }));
      await refreshWorkspace();
    } catch (error: any) {
      const stillSelected = selectedLectureRef.current.id === selected.id && selectedLectureRef.current.version === selected.version && requestId === proposalRequestRef.current;
      if (stillSelected) setProposalError(error.detail || error.message || 'Không thể ghi nhận quyết định cho đề xuất này.');
    } finally {
      const stillSelected = selectedLectureRef.current.id === selected.id && selectedLectureRef.current.version === selected.version && requestId === proposalRequestRef.current;
      if (stillSelected) setProposalBusyId(null);
    }
  };

  const reviewedProposalIds = new Set([
    ...(learner?.reviewed_proposals || []).map(item => item.proposal_id),
    ...(learner?.approved_strategy || []).map(item => item.proposal_id).filter((id): id is string => Boolean(id)),
    ...Object.keys(localProposalDecisions),
  ]);
  const learnerNeedsRebase = Boolean(learner?.requires_rebase || (learner?.source_version != null && learner.source_version !== learner.current_draft_version));
  const learnerStatusLabel = learner?.status === 'observed' ? 'Có câu trả lời được ghi nhận' : learner?.status === 'unavailable' ? 'Dữ liệu không khả dụng' : 'Chưa đủ dữ liệu';
  const learnerReasonLabel = (reason: string | null | undefined) => ({
    no_published_source: 'Chưa có phiên bản bài giảng đã xuất bản để đối chiếu.',
    no_eligible_assessment_answers: 'Chưa có câu trả lời từ bài kiểm tra đã xuất bản phù hợp với nguồn.',
    requested_version_is_not_active_publication: 'Dữ liệu chỉ có cho phiên bản bài giảng đang xuất bản.',
    lecture_owner_required: 'Chỉ giảng viên phụ trách bài này mới xem được dữ liệu lớp.',
    academic_view_not_available_for_role: 'Màn hình này không cung cấp dữ liệu học tập cho vai trò hiện tại.',
  }[reason || ''] || 'Chưa có dữ liệu phù hợp để hiển thị.');

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      <div>
        <h1 className="text-[26px] sm:text-[30px] font-bold text-[#12213b] tracking-tight leading-tight">
          Lecture Twin của bài giảng
        </h1>
        <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
          Mô hình liên kết nội dung, đoạn nguồn, chuẩn đầu ra, bài làm và các phiên bản. Cập nhật khi có học liệu hoặc phản hồi học tập mới.
        </p>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-5 text-sm leading-relaxed text-slate-600">
        <strong className="text-slate-800">Liên kết chuẩn đầu ra </strong>
        {workspace?.research?.objectives.filter(o => o.status === 'confirmed').length ?? 0}/{workspace?.research?.objectives.length ?? 0} CLO đã được giảng viên đối chiếu.
        {' '}Trạng thái này xác nhận liên kết với học liệu, chưa chứng nhận học viên đạt CLO. Khoảng nguồn và kết quả từng kiến thức được xem tại Hiểu bài giảng.
      </div>

      {learner && <section aria-labelledby="learner-twin-title" className="space-y-4 rounded-xl border border-[#e1e7ef] bg-white p-5 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="learner-twin-title" className="text-base font-bold text-[#12213b]">LearnerTwin · Bài làm theo phiên bản</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {learner.scope === 'class' ? 'Ghi nhận của lớp từ bài kiểm tra đã xuất bản.' : learner.scope === 'self' ? 'Ghi nhận bài làm của bạn từ bài kiểm tra đã xuất bản.' : 'Phạm vi dữ liệu học tập chưa được cấp.'}
              {learner.source_version != null ? ` Nguồn đã xuất bản v${learner.source_version}; bản nháp hiện tại v${learner.current_draft_version}.` : ' Chưa có nguồn đã xuất bản.'}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${learner.status === 'observed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{learnerStatusLabel}</span>
        </div>

        {learner.status !== 'observed' ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">{learnerReasonLabel(learner.reason)}</p> : <>
          {learnerNeedsRebase && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">Bài làm thuộc phiên bản đã xuất bản v{learner.source_version}; bản nháp đã đổi. Cần đối chiếu lại nguồn trước khi xem xét đề xuất cho bản nháp.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Lượt làm hợp lệ</p><p className="mt-1 font-bold text-[#12213b]">{learner.observed.attempt_count}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Câu trả lời gần nhất</p><p className="mt-1 font-bold text-[#12213b]">{learner.observed.latest_answer_count}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Đúng / chưa đúng</p><p className="mt-1 font-bold text-[#12213b]">{learner.observed.correct} / {learner.observed.incorrect}</p></div>
            {learner.scope === 'class' && <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Người học có ghi nhận</p><p className="mt-1 font-bold text-[#12213b]">{learner.observed.unique_learners}</p></div>}
          </div>
          <p className="text-xs leading-relaxed text-slate-500">Các số đếm mô tả câu trả lời đã lưu, không đo năng lực hay mức thành thạo. {learner.observed.repeat_attempt_count} lượt làm là lượt thử lại; ghi nhận đúng/sai tính câu trả lời mới nhất cho từng câu hỏi.</p>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[#12213b]">Theo nội dung đã được giảng viên duyệt</h3>
            {!learner.concept_observations.length ? <p className="text-sm text-slate-500">Chưa có nội dung đã duyệt để nhóm câu trả lời.</p> : learner.concept_observations.map(item => (
              <div key={item.concept_id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2.5 text-sm">
                <span className="font-medium text-[#12213b]">{item.label}</span>
                <span className="text-xs text-slate-600">{item.state === 'no_observations' ? 'Chưa có câu trả lời đủ điều kiện' : `${item.latest_correct} đúng · ${item.latest_incorrect} chưa đúng trong ${item.latest_total} câu gần nhất`}{learner.scope === 'class' ? ` · ${item.observed_learners} người học` : ''}</span>
              </div>
            ))}
          </div>

          {!!learner.audit_rows?.length && <details className="rounded-lg border border-slate-200 px-3">
            <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-[#12213b]">Câu trả lời được tính ({learner.audit_rows.length})</summary>
            <ul className="divide-y divide-slate-100 pb-2">
              {learner.audit_rows.map((row, index) => {
                const conceptLabel = learner.concept_observations.find(item => item.concept_id === row.concept_id)?.label || 'Nội dung đã duyệt';
                const stamp = new Date(row.submitted_at);
                return <li key={`${row.attempt_id}-${row.question_id}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-xs text-slate-600"><span>{conceptLabel} · {row.correct ? 'Đúng' : 'Chưa đúng'}</span><time dateTime={row.submitted_at}>{Number.isNaN(stamp.getTime()) ? 'Thời gian không rõ' : stamp.toLocaleString('vi-VN')}</time></li>;
              })}
              {!!learner.audit_omitted_rows && <li className="pt-2 text-xs text-slate-500">Còn {learner.audit_omitted_rows} dòng không hiển thị trong phần tóm tắt này.</li>}
            </ul>
          </details>}

          {!!learner.adaptive_proposals.length && <div className="space-y-3 border-t border-slate-200 pt-4">
            <div>
              <h3 className="text-sm font-semibold text-[#12213b]">Đề xuất để giảng viên xem xét ({learner.adaptive_proposals.length})</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Dựa trên câu trả lời đã ghi nhận; chưa xác định nguyên nhân và không tự áp dụng vào bài học.</p>
            </div>
            {proposalError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{proposalError}</p>}
            {learner.adaptive_proposals.map(proposal => {
              const review = learner.reviewed_proposals?.find(item => item.proposal_id === proposal.id);
              const localDecision = localProposalDecisions[proposal.id];
              const approved = learner.approved_strategy?.some(item => item.proposal_id === proposal.id) || false;
              const decision = review?.decision || localDecision;
              const disabled = learnerNeedsRebase || proposal.requires_rebase || proposal.source_version !== learner.source_version || !learner.state_id || proposalBusyId !== null;
              return <article key={proposal.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-sm text-[#12213b]">{proposal.title}</h4><span className="text-xs font-semibold text-amber-800">{decision === 'confirm' || approved ? 'Đã xác nhận' : decision === 'reject' ? 'Đã loại' : 'Bản nháp cần duyệt'}</span></div>
                <p className="text-sm leading-relaxed text-slate-600">{proposal.reason}</p>
                {review?.note && <p className="text-xs text-slate-500">Ghi chú quyết định: {review.note}</p>}
                {!review && !decision && !approved && <>
                  <label htmlFor={`proposal-note-${proposal.id}`} className="block text-xs font-medium text-slate-600">Ghi chú quyết định (tối thiểu 3 ký tự)
                    <textarea id={`proposal-note-${proposal.id}`} value={proposalNotes[proposal.id] || ''} onChange={event => setProposalNotes(previous => ({ ...previous, [proposal.id]: event.target.value }))} rows={2} minLength={3} maxLength={1000} className="mt-1 min-h-[72px] w-full resize-y rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-[#12213b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" placeholder="Ví dụ: Đã đối chiếu với câu trả lời và nguồn đã xuất bản." /></label>
                  {disabled && <p className="text-xs text-amber-800">{learnerNeedsRebase || proposal.requires_rebase ? 'Đề xuất thuộc phiên bản cũ; cần cập nhật và phân tích lại trước khi ghi nhận.' : 'Chưa thể ghi nhận quyết định cho trạng thái này.'}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={disabled || (proposalNotes[proposal.id] || '').trim().length < 3} onClick={() => void decideProposal(proposal.id, 'confirm')} className="min-h-[42px] rounded-lg bg-[#2959ea] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{proposalBusyId === proposal.id ? 'Đang lưu…' : 'Xác nhận đề xuất'}</button>
                    <button type="button" disabled={disabled || (proposalNotes[proposal.id] || '').trim().length < 3} onClick={() => void decideProposal(proposal.id, 'reject')} className="min-h-[42px] rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Loại đề xuất</button>
                  </div>
                </>}
              </article>;
            })}
          </div>}
        </>}
      </section>}

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
            <span>Thuật ngữ và mã được nhận diện</span>
          </div>
          <div className="text-2xl font-bold text-[#12213b]">
            {observedConcepts} mục trong đồ thị
          </div>
          <p className="text-xs text-[#5f708b] leading-relaxed">
            {isPreparedSample
              ? 'Các mục trong đồ thị và nguồn dẫn đã được chuẩn bị sẵn trong bài mẫu.'
              : `${verifiedConcepts} mục đã được giảng viên duyệt${openFindings > 0 ? `; ${openFindings} đang chờ duyệt` : ''}.`}
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
