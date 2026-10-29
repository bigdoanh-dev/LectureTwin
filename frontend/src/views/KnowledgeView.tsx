import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Search,
  Clock,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Network,
  Edit2,
  Check,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VideoPlayer } from '../components/VideoPlayer';
import { ReviewModal } from '../components/ReviewModal';
import { api } from '../api';
import { Evidence } from '../types';
import { formatTimestamp, formatEvidenceLabel } from '../presentation';

export const KnowledgeView: React.FC = () => {
  const {
    workspace,
    currentLectureId,
    seekVideoTo,
    videoSeekTarget,
    clearVideoSeek,
    refreshWorkspace,
    role
  } = useApp();

  const [query, setQuery] = useState<string>('');
  const [selectedConceptId, setSelectedConceptId] = useState<string>('');
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [editingConcept, setEditingConcept] = useState<boolean>(false);
  const [editLabel, setEditLabel] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');

  const shouldReduceMotion = useReducedMotion();

  const concepts = workspace?.concepts || [];
  const evidences = workspace?.evidence || [];
  const isPreparedSample = workspace?.lecture.sample_attached === true;
  const pendingFindings = workspace?.findings.filter(finding => finding.status === 'pending') || [];
  const unsupportedPendingCount = pendingFindings.filter(finding => !finding.has_evidence).length;

  const filteredConcepts = concepts.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.description.toLowerCase().includes(query.toLowerCase())
  );

  const activeConceptId = selectedConceptId || concepts[0]?.id || '';
  const selectedConcept = concepts.find(c => c.id === activeConceptId) || concepts[0] || null;

  // Evidences associated with selected concept
  const conceptEvidences = selectedConcept
    ? evidences
      .filter(e => selectedConcept.evidence_ids?.includes(e.id) || e.concept_id === selectedConcept.id)
      .filter((evidence, index, all) => all.findIndex(item => item.id === evidence.id) === index)
    : [];
  const conceptEvidenceGroups = conceptEvidences.reduce<{ key: string; items: Evidence[] }[]>((groups, evidence) => {
    const key = `${evidence.text}|${evidence.start ?? ''}|${evidence.end ?? ''}`;
    const group = groups.find(item => item.key === key);
    if (group) group.items.push(evidence);
    else groups.push({ key, items: [evidence] });
    return groups;
  }, []);

  const handleBulkReview = async (note: string) => {
    try {
      await api.bulkReview(currentLectureId, note);
      await refreshWorkspace();
      setActionMsg('Đã lưu quyết định. Các ý có nguồn hợp lệ được duyệt; ý thiếu nguồn bị loại khỏi bài giao cho học viên.');
    } catch (err: any) {
      setActionMsg(err.detail || 'Không lưu được quyết định. Vui lòng thử lại.');
      throw err;
    }
  };

  const handleStartEdit = () => {
    if (!selectedConcept) return;
    setEditLabel(selectedConcept.label);
    setEditDesc(selectedConcept.description);
    setEditingConcept(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedConcept || !editLabel.trim()) return;
    try {
      await api.patchConcept(currentLectureId, selectedConcept.id, {
        label: editLabel.trim(),
        description: editDesc.trim()
      });
      setEditingConcept(false);
      await refreshWorkspace();
      setActionMsg('Đã cập nhật ý chính. Giảng viên cần duyệt lại trước khi sử dụng.');
    } catch (err: any) {
      setActionMsg(err.detail || err.message || 'Lỗi khi cập nhật khái niệm');
    }
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-[#12213b] tracking-tight leading-tight">
            Ý chính và nguồn của bài giảng
          </h1>
          <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
            Mỗi ý chính có đoạn video hoặc trang slide đi kèm để giảng viên đối chiếu trước khi sử dụng.
          </p>
        </div>

        {role === 'teacher' && pendingFindings.length > 0 ? (
          <button
            type="button"
            onClick={() => setIsReviewModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 shadow-xs transition-colors cursor-pointer self-start sm:self-auto min-h-[44px]"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Kiểm tra {pendingFindings.length} ý đang chờ duyệt</span>
          </button>
        ) : role === 'teacher' && concepts.length > 0 ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 self-start sm:self-auto">
            {isPreparedSample ? 'Ý chính trong bài mẫu đã được chuẩn bị sẵn.' : 'Không còn ý chính nào đang chờ duyệt.'}
          </p>
        ) : null}
      </div>

      {actionMsg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-[#12213b] flex items-center justify-between">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-[#2959ea] font-bold cursor-pointer p-1">✕</button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[#5f708b] absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm ý chính trong bài giảng..."
          className="w-full bg-white border border-[#e1e7ef] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] shadow-2xs min-h-[44px]"
        />
      </div>

      {/* 2-Column: Knowledge Nodes List & Video/Evidence Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Concept Nodes (6 Cols) */}
        <div className="lg:col-span-6 space-y-3">
          <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
            Ý chính trong bài giảng ({filteredConcepts.length})
          </h2>

          {concepts.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e1e7ef] p-8 text-center space-y-2 shadow-2xs">
              <Network className="w-8 h-8 text-[#5f708b] mx-auto opacity-40" />
              <div className="font-bold text-sm text-[#12213b]">Chưa có ý chính để xem</div>
              <p className="text-xs text-[#5f708b] max-w-sm mx-auto">
                Mở trang <strong>AI hỗ trợ</strong> và chọn <strong>Phân tích bài giảng</strong> để tạo gợi ý từ học liệu.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredConcepts.map((c) => {
                const isSelected = c.id === activeConceptId;
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      setSelectedConceptId(c.id);
                      setEditingConcept(false);
                      const ev = evidences.find(e => c.evidence_ids?.includes(e.id) || e.concept_id === c.id);
                      if (ev) setSelectedEvidence(ev);
                    }}
                    aria-pressed={isSelected}
                    className={`w-full p-4 rounded-xl border text-left text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2959ea] focus-visible:ring-offset-1 ${
                      isSelected
                        ? 'bg-blue-50/70 border-[#2959ea] ring-2 ring-blue-100 shadow-2xs'
                        : 'bg-white border-[#e1e7ef] hover:bg-[#f6f8fc]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[#12213b]">
                        {c.label}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center space-x-1 ${
                        c.verified ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {c.verified ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{isPreparedSample ? 'Có sẵn trong bài mẫu' : 'Giảng viên đã duyệt'}</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Chờ giảng viên duyệt</span>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-[#5f708b] text-xs mt-1 leading-relaxed">
                      {c.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Synchronized Video & Evidence Inspector (6 Cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-xl overflow-hidden border border-[#e1e7ef] bg-black">
            <VideoPlayer
              lectureId={currentLectureId}
              seekTarget={videoSeekTarget}
              onClearSeekTarget={clearVideoSeek}
              sampleAttached={workspace?.lecture.sample_attached}
              selectedEvidence={selectedEvidence}
              defaultEvidence={conceptEvidences[0] || evidences[0] || null}
            />
          </div>

          {/* Evidence List for Selected Concept */}
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
                Nguồn cho ý chính: {selectedConcept ? selectedConcept.label : 'Chưa chọn'}
              </h3>

              {role === 'teacher' && selectedConcept && !editingConcept && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-[#2959ea] hover:text-blue-800 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Sửa ý chính</span>
                </button>
              )}
            </div>

            {/* Inline Concept Edit for Teacher */}
            {editingConcept && (
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="Tên ý chính"
                  className="w-full bg-white border border-[#e1e7ef] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#12213b]"
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Mô tả ý chính"
                  rows={2}
                  className="w-full bg-white border border-[#e1e7ef] rounded-lg p-2 text-xs text-[#12213b]"
                />
                <div className="flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditingConcept(false)}
                    className="px-2.5 py-1 rounded-lg text-[#5f708b] hover:bg-slate-100 text-xs"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-3 py-1 bg-[#2959ea] text-white rounded-lg text-xs font-semibold flex items-center space-x-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Lưu & yêu cầu duyệt lại</span>
                  </button>
                </div>
              </div>
            )}

            {conceptEvidenceGroups.length === 0 ? (
              <div className="text-[#5f708b] py-3 text-center italic">
                Chưa có đoạn nguồn gắn với ý chính này.
              </div>
            ) : (
              <div className="space-y-2">
                {conceptEvidenceGroups.map((group) => {
                  const representative = group.items[0];
                  const videoSource = group.items.find(evidence => evidence.kind !== 'slide' && typeof evidence.start === 'number');
                  const slideSources = group.items.filter(evidence => evidence.kind === 'slide');
                  return (
                    <div
                      key={group.key}
                      className="p-3 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] space-y-2"
                    >
                      <div className="flex flex-wrap gap-2">
                        {videoSource && (
                          <span className="inline-flex items-center gap-1.5 font-bold text-[#2959ea] bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            {videoSource.source_type === 'youtube_caption_annotation'
                              ? 'Học liệu thực hành'
                              : isPreparedSample ? 'Học liệu thực hành' : 'Video bài giảng'} · {formatTimestamp(videoSource.start)}
                          </span>
                        )}
                        {slideSources.map((slide) => (
                          <span key={slide.id} className="inline-flex items-center gap-1.5 font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-1 rounded-lg">
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            Trang slide {slide.slide_page ?? 1}
                          </span>
                        ))}
                        {!videoSource && slideSources.length === 0 && (
                          <span className="font-bold text-[#5f708b]">Nguồn học liệu</span>
                        )}
                      </div>
                      <p className="text-[#5f708b] italic leading-relaxed">“{representative.text}”</p>

                      {videoSource && videoSource.start !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEvidence(videoSource);
                            seekVideoTo(videoSource.start as number);
                          }}
                          className="inline-flex items-center min-h-[40px] text-[#2959ea] hover:underline font-bold cursor-pointer whitespace-nowrap text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2959ea] rounded-md"
                        >
                          {videoSource.source_type === 'youtube_caption_annotation'
                            ? `Mở học liệu tại ${formatTimestamp(videoSource.start)} →`
                            : `Mở đoạn video từ ${formatTimestamp(videoSource.start)} →`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onConfirm={handleBulkReview}
        pendingCount={pendingFindings.length}
        unsupportedCount={unsupportedPendingCount}
      />
    </motion.div>
  );
};
