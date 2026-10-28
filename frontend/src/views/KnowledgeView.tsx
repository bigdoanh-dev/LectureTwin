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

  const filteredConcepts = concepts.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.description.toLowerCase().includes(query.toLowerCase())
  );

  const activeConceptId = selectedConceptId || concepts[0]?.id || '';
  const selectedConcept = concepts.find(c => c.id === activeConceptId) || concepts[0] || null;

  // Evidences associated with selected concept
  const conceptEvidences = selectedConcept
    ? evidences.filter(e => selectedConcept.evidence_ids?.includes(e.id) || e.concept_id === selectedConcept.id)
    : [];

  const handleBulkReview = async (note: string) => {
    try {
      await api.bulkReview(currentLectureId, note);
      await refreshWorkspace();
      setActionMsg('Đã hoàn tất thẩm định toàn bộ bằng chứng.');
    } catch (err: any) {
      setActionMsg(err.detail || 'Lỗi thẩm định');
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
      setActionMsg('Đã cập nhật khái niệm thành công (yêu cầu thẩm định lại).');
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
            Bản đồ tri thức & Bằng chứng
          </h1>
          <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
            Mỗi nút khái niệm đều liên kết trực tiếp với đoạn trích video, slide và bằng chứng xác minh.
          </p>
        </div>

        {role === 'teacher' && (
          <button
            type="button"
            onClick={() => setIsReviewModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 shadow-xs transition-colors cursor-pointer self-start sm:self-auto min-h-[44px]"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Thẩm định bằng chứng (Review Gate)</span>
          </button>
        )}
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
          placeholder="Tìm kiếm khái niệm (BFS, DFS, Queue, Stack...)"
          className="w-full bg-white border border-[#e1e7ef] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] shadow-2xs min-h-[44px]"
        />
      </div>

      {/* 2-Column: Knowledge Nodes List & Video/Evidence Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Concept Nodes (6 Cols) */}
        <div className="lg:col-span-6 space-y-3">
          <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
            Các khái niệm trong bài giảng ({filteredConcepts.length})
          </h2>

          {concepts.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e1e7ef] p-8 text-center space-y-2 shadow-2xs">
              <Network className="w-8 h-8 text-[#5f708b] mx-auto opacity-40" />
              <div className="font-bold text-sm text-[#12213b]">Chưa có khái niệm được bóc tách</div>
              <p className="text-xs text-[#5f708b] max-w-sm mx-auto">
                Hãy chuyển sang trang <strong>AI hỗ trợ</strong> và bắt đầu phân tích bài giảng để xây dựng đồ thị tri thức.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredConcepts.map((c) => {
                const isSelected = c.id === activeConceptId;
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedConceptId(c.id);
                      setEditingConcept(false);
                      const ev = evidences.find(e => c.evidence_ids?.includes(e.id) || e.concept_id === c.id);
                      if (ev) setSelectedEvidence(ev);
                    }}
                    className={`p-4 rounded-xl border text-xs cursor-pointer transition-all ${
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
                            <span>Đã xác minh</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Cần xác minh</span>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-[#5f708b] text-xs mt-1 leading-relaxed">
                      {c.description}
                    </p>
                  </div>
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
              selectedEvidence={selectedEvidence}
              defaultEvidence={conceptEvidences[0] || evidences[0] || null}
            />
          </div>

          {/* Evidence List for Selected Concept */}
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
                Bằng chứng cho khái niệm: {selectedConcept ? selectedConcept.label : 'Chưa chọn'}
              </h3>

              {role === 'teacher' && selectedConcept && !editingConcept && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-[#2959ea] hover:text-blue-800 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Sửa khái niệm</span>
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
                  placeholder="Tên khái niệm"
                  className="w-full bg-white border border-[#e1e7ef] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#12213b]"
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Mô tả khái niệm"
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
                    <span>Lưu & Mở lại xác minh</span>
                  </button>
                </div>
              </div>
            )}

            {conceptEvidences.length === 0 ? (
              <div className="text-[#5f708b] py-3 text-center italic">
                Khái niệm này chưa có đoạn dẫn chứng cụ thể được trích xuất.
              </div>
            ) : (
              <div className="space-y-2">
                {conceptEvidences.map((ev) => {
                  const hasTime = typeof ev.start === 'number';
                  return (
                    <div
                      key={ev.id}
                      className="p-3 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center space-x-1.5 font-bold text-[#12213b]">
                          {hasTime ? (
                            <>
                              <Clock className="w-3.5 h-3.5 text-[#2959ea] shrink-0" />
                              <span>Transcript mốc {formatTimestamp(ev.start)} — {formatTimestamp(ev.end)}</span>
                            </>
                          ) : (
                            <>
                              <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              <span>Trang slide {ev.slide_page ?? 1}</span>
                            </>
                          )}
                        </div>
                        <p className="text-[#5f708b] mt-1 italic leading-relaxed">
                          “{ev.text}”
                        </p>
                      </div>

                      {hasTime && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEvidence(ev);
                            if (typeof ev.start === 'number') {
                              seekVideoTo(ev.start);
                            }
                          }}
                          className="text-[#2959ea] hover:underline font-bold ml-2 shrink-0 cursor-pointer whitespace-nowrap text-xs"
                        >
                          Tua tới {formatTimestamp(ev.start)} →
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
      />
    </motion.div>
  );
};
