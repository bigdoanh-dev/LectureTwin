import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Search,
  Play,
  Bookmark,
  Clock,
  Plus,
  ExternalLink,
  BookOpen,
  Info,
  Layers,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import type { Workspace, Evidence, ConceptEdge } from '../types';
import type { studentLearningOverview } from '../student-model';
import { parseStudentTimestamp } from '../student-model';
import { formatTimestamp, formatEvidenceLabel } from '../presentation';
import { api } from '../api';
import { KnowledgeMap } from './KnowledgeMap';

interface StudentResourceTabsProps {
  workspace: Workspace | null;
  model: ReturnType<typeof studentLearningOverview>;
  activeTab: 'source' | 'knowledge' | 'notes';
  onChangeTab: (tab: 'source' | 'knowledge' | 'notes') => void;
  selectedConceptId: string | null;
  onSelectConcept: (conceptId: string | null) => void;
  playerTime: number;
  playerDuration: number;
  onSeek: (seconds: number) => void;
  onSeekEvidence: (evidence: Evidence) => void;
  onViewSlide: (page: number) => void;
  draftNoteTime: number | null;
  onSetDraftNoteTime: (time: number | null) => void;
  onRefreshWorkspace: () => Promise<void>;
}

export const StudentResourceTabs: React.FC<StudentResourceTabsProps> = ({
  workspace,
  model,
  activeTab,
  onChangeTab,
  selectedConceptId,
  onSelectConcept,
  playerTime,
  playerDuration,
  onSeek,
  onSeekEvidence,
  onViewSlide,
  draftNoteTime,
  onSetDraftNoteTime,
  onRefreshWorkspace
}) => {
  // Search transcript state
  const [transcriptQuery, setTranscriptQuery] = useState<string>('');

  // Bookmark form state
  const [bookmarkLabel, setBookmarkLabel] = useState<string>('');
  const [manualTimeString, setManualTimeString] = useState<string>('');
  const [savingBookmark, setSavingBookmark] = useState<boolean>(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [bookmarkSuccess, setBookmarkSuccess] = useState<string | null>(null);

  // Guard against late response after lecture change
  const activeLectureIdRef = useRef<string | undefined>(workspace?.lecture.id);
  useEffect(() => {
    activeLectureIdRef.current = workspace?.lecture.id;
    setBookmarkError(null);
    setBookmarkSuccess(null);
    setBookmarkLabel('');
    setManualTimeString('');
    setTranscriptQuery('');
    return () => { activeLectureIdRef.current = undefined; };
  }, [workspace?.lecture.id]);

  const transcript = workspace?.transcript || [];
  const slides = workspace?.slides || [];
  const assets = workspace?.assets || [];
  const bookmarks = workspace?.progress?.bookmarks || [];

  // Filter transcript rows
  const filteredTranscript = transcript.filter(item => {
    if (!transcriptQuery.trim()) return true;
    return item.text.toLowerCase().includes(transcriptQuery.toLowerCase());
  });

  // Safe external URL helper (no javascript:)
  const isSafeUrl = (url?: string): boolean => {
    if (!url) return false;
    const clean = url.trim().toLowerCase();
    return clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/api/');
  };

  // Keyboard navigation for accessible tabs (ArrowLeft, ArrowRight, Home, End)
  const handleTabKeyDown = (e: React.KeyboardEvent, currentTab: 'source' | 'knowledge' | 'notes') => {
    const tabs: Array<'source' | 'knowledge' | 'notes'> = ['source', 'knowledge', 'notes'];
    const currentIndex = tabs.indexOf(currentTab);
    let targetTab: 'source' | 'knowledge' | 'notes' | null = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetTab = tabs[(currentIndex + 1) % tabs.length];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetTab = tabs[0];
    } else if (e.key === 'End') {
      e.preventDefault();
      targetTab = tabs[tabs.length - 1];
    }

    if (targetTab) {
      onChangeTab(targetTab);
      const targetElement = document.getElementById(`tab-${targetTab}`);
      targetElement?.focus();
    }
  };

  // Parse manual mm:ss to seconds
  const parseTimeString = (str: string): number | null => {
    return parseStudentTimestamp(str);
  };

  // Handle bookmark submission guarded by current lecture id ref
  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace) return;
    const currentScopeId = workspace.lecture.id;
    setBookmarkError(null);
    setBookmarkSuccess(null);

    let targetSeconds: number;

    if (model.canTrackVideo) {
      // Native player: use measured playback time
      targetSeconds = Math.round(playerTime);
    } else {
      // YouTube: require explicit manual time or draft time, validated against duration
      const parsed = manualTimeString ? parseTimeString(manualTimeString) : (draftNoteTime ?? null);
      if (parsed === null || parsed < 0) {
        setBookmarkError('Vui lòng nhập mốc thời gian hợp lệ (định dạng mm:ss, ví dụ: 03:45).');
        return;
      }
      const maxDuration = model.primaryVideo?.duration_seconds;
      if (maxDuration != null && parsed > maxDuration) {
        setBookmarkError(`Mốc thời gian không được vượt quá thời lượng video (${formatTimestamp(maxDuration)}).`);
        return;
      }
      targetSeconds = parsed;
    }

    if (!bookmarkLabel.trim()) {
      setBookmarkError('Vui lòng nhập nội dung ghi chú.');
      return;
    }

    setSavingBookmark(true);
    try {
      await api.addBookmark(currentScopeId, {
        seconds: targetSeconds,
        label: bookmarkLabel.trim()
      });

      // Ignore if user navigated away while request was in-flight
      if (activeLectureIdRef.current !== currentScopeId) return;

      setBookmarkLabel('');
      setManualTimeString('');
      onSetDraftNoteTime(null);
      setBookmarkSuccess(`Đã lưu ghi chú tại ${formatTimestamp(targetSeconds)}.`);
      await onRefreshWorkspace();
    } catch (err: any) {
      if (activeLectureIdRef.current !== currentScopeId) return;
      setBookmarkError(err.detail || err.message || 'Không thể lưu ghi chú.');
    } finally {
      if (activeLectureIdRef.current === currentScopeId) {
        setSavingBookmark(false);
      }
    }
  };

  // Determine active concept in knowledge tab
  const activeConcept = model.knowledge.find(c => c.id === selectedConceptId) || model.knowledge[0] || null;

  // Format relation edge in Vietnamese (no technical prerequisite/related enum)
  const formatEdgeLabel = (edge: ConceptEdge): string => {
    if (edge.label) return edge.label;
    if (edge.type === 'prerequisite') return 'Tiên quyết cho';
    if (edge.type === 'related') return 'Liên quan đến';
    return 'Liên kết với';
  };

  // Format asset kind in Vietnamese (no raw enum)
  const formatAssetKind = (kind: string): string => {
    if (kind === 'video') return 'Video bài giảng';
    if (kind === 'slides') return 'Tài liệu trình chiếu';
    if (kind === 'transcript') return 'Bản ghi lời thoại';
    return 'Học liệu bài giảng';
  };

  return (
    <div className="bg-white rounded-2xl border border-[#e1e7ef] shadow-2xs overflow-hidden">
      {/* Accessible Tab Navigation with Keyboard Arrow/Home/End Support */}
      <div
        role="tablist"
        aria-label="Tài nguyên bài học"
        className="grid grid-cols-3 sm:flex items-stretch border-b border-[#e1e7ef] bg-[#fcfdfe] px-2 sm:px-4 pt-2 gap-1 sm:gap-2"
      >
        <button
          type="button"
          role="tab"
          id="tab-source"
          aria-selected={activeTab === 'source'}
          aria-controls="panel-source"
          tabIndex={activeTab === 'source' ? 0 : -1}
          onClick={() => onChangeTab('source')}
          onKeyDown={(e) => handleTabKeyDown(e, 'source')}
          className={`min-h-[56px] sm:min-h-[44px] px-1 sm:px-4 text-[12px] sm:text-[14px] font-semibold transition-all border-b-2 flex flex-wrap sm:flex-nowrap items-center justify-center gap-1 sm:gap-2 whitespace-normal sm:whitespace-nowrap cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
            activeTab === 'source'
              ? 'border-[#2959ea] text-[#2959ea]'
              : 'border-transparent text-[#5f708b] hover:text-[#12213b]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Nội dung & nguồn</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-knowledge"
          aria-selected={activeTab === 'knowledge'}
          aria-controls="panel-knowledge"
          tabIndex={activeTab === 'knowledge' ? 0 : -1}
          onClick={() => onChangeTab('knowledge')}
          onKeyDown={(e) => handleTabKeyDown(e, 'knowledge')}
          className={`min-h-[56px] sm:min-h-[44px] px-1 sm:px-4 text-[12px] sm:text-[14px] font-semibold transition-all border-b-2 flex flex-wrap sm:flex-nowrap items-center justify-center gap-1 sm:gap-2 whitespace-normal sm:whitespace-nowrap cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
            activeTab === 'knowledge'
              ? 'border-[#2959ea] text-[#2959ea]'
              : 'border-transparent text-[#5f708b] hover:text-[#12213b]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Bản đồ kiến thức</span>
          {model.knowledge.length > 0 && (
            <span className="text-[12px] px-1.5 py-0.5 rounded-full bg-blue-50 text-[#2959ea] font-bold">
              {model.knowledge.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-notes"
          aria-selected={activeTab === 'notes'}
          aria-controls="panel-notes"
          tabIndex={activeTab === 'notes' ? 0 : -1}
          onClick={() => onChangeTab('notes')}
          onKeyDown={(e) => handleTabKeyDown(e, 'notes')}
          className={`min-h-[56px] sm:min-h-[44px] px-1 sm:px-4 text-[12px] sm:text-[14px] font-semibold transition-all border-b-2 flex flex-wrap sm:flex-nowrap items-center justify-center gap-1 sm:gap-2 whitespace-normal sm:whitespace-nowrap cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
            activeTab === 'notes'
              ? 'border-[#2959ea] text-[#2959ea]'
              : 'border-transparent text-[#5f708b] hover:text-[#12213b]'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Ghi chú của tôi</span>
          {bookmarks.length > 0 && (
            <span className="text-[12px] px-1.5 py-0.5 rounded-full bg-slate-100 text-[#5f708b] font-bold">
              {bookmarks.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      <div className="p-4 sm:p-5">
        {/* TAB 1: NỘI DUNG & NGUỒN */}
        {activeTab === 'source' && (
          <div
            role="tabpanel"
            id="panel-source"
            aria-labelledby="tab-source"
            tabIndex={0}
            className="space-y-6 focus:outline-hidden"
          >
            {/* Transcript section */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base text-[#12213b]">
                    Bản ghi nội dung video
                  </h3>
                  <p className="text-[12px] text-[#5f708b]">
                    Bấm vào mốc thời gian để tua video đến đúng đoạn học liệu.
                  </p>
                </div>

                {/* Search input */}
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={transcriptQuery}
                    onChange={(e) => setTranscriptQuery(e.target.value)}
                    placeholder="Tìm trong bản ghi..."
                    aria-label="Tìm trong bản ghi"
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl pl-9 pr-8 py-2 text-[13px] text-[#12213b] placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] min-h-[44px]"
                  />
                  {transcriptQuery && (
                    <button
                      type="button"
                      onClick={() => setTranscriptQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs p-1 min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer"
                      title="Xóa tìm kiếm"
                      aria-label="Xóa tìm kiếm"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Transcript list */}
              <div className="space-y-1 border border-[#e1e7ef] rounded-xl p-2 max-h-[380px] overflow-y-auto bg-[#fafbfd]">
                {transcript.length === 0 ? (
                  <p className="p-4 text-center text-[13px] text-[#5f708b] italic">
                    Chưa có dữ liệu lời thoại cho bài giảng này.
                  </p>
                ) : filteredTranscript.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <p className="text-[13px] text-[#5f708b]">
                      Không tìm thấy nội dung phù hợp với từ khóa "<strong>{transcriptQuery}</strong>".
                    </p>
                    <button
                      type="button"
                      onClick={() => setTranscriptQuery('')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-50 text-[#2959ea] hover:bg-blue-100 text-[12px] font-semibold cursor-pointer transition-colors"
                    >
                      Xóa bộ lọc tìm kiếm
                    </button>
                  </div>
                ) : (
                  filteredTranscript.map((item, idx) => {
                    const isActive = model.canTrackVideo && playerTime >= item.start && playerTime < item.end;

                    return (
                      <div
                        key={item.id || idx}
                        className={`w-full p-2.5 rounded-xl transition-colors flex items-start gap-3 ${
                          isActive
                            ? 'bg-[#eef4ff] text-[#12213b] border border-blue-200'
                            : 'hover:bg-white text-[#12213b]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSeek(item.start);
                            onSetDraftNoteTime(item.start);
                          }}
                          className={`min-h-[44px] min-w-[72px] px-2.5 py-1.5 rounded-xl font-mono text-[13px] font-bold shrink-0 flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-[#2959ea] text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-blue-50 text-[#2959ea] hover:text-blue-700'
                          }`}
                          title={`Tua đến ${formatTimestamp(item.start)}`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          <span>{formatTimestamp(item.start)}</span>
                        </button>

                        <p className="text-[14px] leading-relaxed font-medium flex-1 pt-1">
                          {item.text}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Slides Preview Section */}
            {slides.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-[#e1e7ef]">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#12213b]">
                    Trang trình chiếu bài học ({slides.length} slide)
                  </h4>
                  <span className="text-[12px] text-[#5f708b]">Bấm để xem nội dung chi tiết</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {slides.map((slide) => (
                    <button
                      key={slide.page}
                      type="button"
                      onClick={() => onViewSlide(slide.page)}
                      className="p-3 text-left rounded-xl border border-[#e1e7ef] bg-white hover:border-blue-300 hover:bg-blue-50/20 transition-all cursor-pointer space-y-1.5 min-h-[44px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#2959ea] font-bold text-[12px]">
                          Slide {slide.page}
                        </span>
                        {slide.start != null && slide.start >= 0 && (
                          <span className="text-[12px] font-mono text-slate-500">
                            {formatTimestamp(slide.start)}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-[13px] text-[#12213b] line-clamp-1">
                        {slide.title || `Trang ${slide.page}`}
                      </p>
                      <p className="text-[12px] text-[#5f708b] line-clamp-2 leading-relaxed">
                        {slide.text}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Assets List */}
            {assets.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-[#e1e7ef]">
                <h4 className="font-bold text-sm text-[#12213b]">
                  Tệp học liệu đính kèm ({assets.length})
                </h4>
                <div className="space-y-2">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="p-3 rounded-xl border border-[#e1e7ef] bg-white flex items-center justify-between text-[13px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-[#5f708b]" />
                        <span className="font-semibold text-[#12213b]">{asset.name}</span>
                        <span className="text-[12px] text-[#5f708b] bg-slate-100 px-2 py-0.5 rounded-md">
                          {formatAssetKind(asset.kind)}
                        </span>
                        {asset.notes && (
                          <span className="text-[12px] text-[#5f708b] hidden sm:inline">({asset.notes})</span>
                        )}
                      </div>

                      {isSafeUrl(asset.url) && (
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] text-[#2959ea] hover:underline flex items-center gap-1 font-semibold text-[13px] px-2"
                        >
                          <span>Mở nguồn</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: KIẾN THỨC CHÍNH */}
        {activeTab === 'knowledge' && (
          <div
            role="tabpanel"
            id="panel-knowledge"
            aria-labelledby="tab-knowledge"
            tabIndex={0}
            className="space-y-5 focus:outline-hidden"
          >
            {model.knowledge.length === 0 ? (
              <p className="text-[13px] text-[#5f708b] italic py-4">
                Chưa có nội dung kiến thức nào được duyệt trong bản xuất bản này.
              </p>
            ) : (
              <div className="space-y-4">
                <KnowledgeMap
                  concepts={model.knowledge}
                  edges={model.edges}
                  selectedConceptId={activeConcept?.id ?? null}
                  onSelectConcept={onSelectConcept}
                  notice="Bản đồ từ phiên bản bài giảng đã được giảng viên duyệt và xuất bản."
                />
                {/* Concept Selector Pills */}
                <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-[#e1e7ef]">
                  <span className="text-[13px] font-bold text-[#12213b]">Chọn ý chính:</span>
                  {model.knowledge.map((c) => {
                    const isSelected = activeConcept?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectConcept(c.id)}
                        aria-pressed={isSelected}
                        className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#2959ea] text-white shadow-2xs'
                            : 'bg-[#f6f8fc] hover:bg-slate-200 text-[#12213b] border border-[#e1e7ef]'
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Concept Details */}
                {activeConcept && (
                  <div className="p-4 rounded-xl border border-blue-100 bg-[#fbfdff] space-y-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-base text-[#12213b]">
                          {activeConcept.label}
                        </h4>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[12px] font-semibold">
                          Giảng viên đã xác nhận
                        </span>
                      </div>
                      <p className="text-[14px] text-[#5f708b] leading-relaxed">
                        {activeConcept.description}
                      </p>
                    </div>

                    {/* Linked Objectives */}
                    {(() => {
                      const linkedObjs = model.objectives.filter(o =>
                        o.concepts.some(c => c.id === activeConcept.id)
                      );
                      if (linkedObjs.length === 0) return null;
                      return (
                        <div className="space-y-1.5 border-t border-slate-100 pt-3">
                          <span className="text-[13px] font-bold text-[#12213b] block">
                            Mục tiêu học tập liên kết:
                          </span>
                          <div className="space-y-1">
                            {linkedObjs.map(o => (
                              <p key={o.id} className="text-[13px] text-[#5f708b]">
                                • {o.title}
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Citations & Evidence (show citation text even if slide page extraction is missing) */}
                    <div className="space-y-2.5 border-t border-slate-100 pt-3">
                      <span className="text-[13px] font-bold text-[#12213b] block">
                        Đoạn nguồn minh chứng trong bài giảng:
                      </span>
                      {activeConcept.sources.length === 0 ? (
                        <p className="text-[13px] text-[#5f708b] italic">
                          Chưa có trích đoạn nguồn cụ thể được liên kết.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {activeConcept.sources.map((src, sIdx) => {
                            const isSlide = src.kind === 'slide';
                            const slideExists = isSlide && src.slide_page != null && slides.some(s => s.page === src.slide_page);

                            return (
                              <div
                                key={src.id || sIdx}
                                className="p-3 rounded-lg border border-[#e1e7ef] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px]"
                              >
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-semibold text-[#5f708b]">
                                      {isSlide ? 'Trang trình chiếu slide' : 'Lời thoại bài giảng'}
                                    </span>
                                    {isSlide && !slideExists && (
                                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">
                                        Slide {src.slide_page ?? 1} (chưa trích xuất trang)
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[#12213b] font-medium leading-relaxed">
                                    "{src.text}"
                                  </p>
                                </div>

                                <div className="shrink-0">
                                  {isSlide && slideExists && src.slide_page != null ? (
                                    <button
                                      type="button"
                                      onClick={() => onViewSlide(src.slide_page!)}
                                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-50 text-[#2959ea] hover:bg-blue-100 font-semibold text-[13px] flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <FileText className="w-4 h-4" />
                                      <span>Xem Slide {src.slide_page}</span>
                                    </button>
                                  ) : !isSlide && src.start != null ? (
                                    <button
                                      type="button"
                                      onClick={() => onSeekEvidence(src)}
                                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#2959ea] text-white hover:bg-blue-700 font-semibold text-[13px] flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                    >
                                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                      <span>Tua đến {formatEvidenceLabel(src)}</span>
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Relationships between verified concepts (all in Vietnamese) */}
                {model.edges.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-[#e1e7ef]">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#2959ea]" />
                      <h4 className="font-bold text-sm text-[#12213b]">
                        Mối quan hệ giữa các kiến thức
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {model.edges.map((edge) => {
                        const sourceConcept = model.knowledge.find(c => c.id === edge.source);
                        const targetConcept = model.knowledge.find(c => c.id === edge.target);
                        if (!sourceConcept || !targetConcept) return null;

                        return (
                          <div
                            key={edge.id}
                            className="p-3 rounded-xl border border-[#e1e7ef] bg-white flex flex-wrap items-center justify-between gap-2 text-[13px]"
                          >
                            <button
                              type="button"
                              onClick={() => onSelectConcept(sourceConcept.id)}
                              className="font-semibold text-[#12213b] hover:text-[#2959ea] transition-colors cursor-pointer text-left"
                            >
                              {sourceConcept.label}
                            </button>

                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[#5f708b] text-[11px] font-semibold shrink-0">
                              <span>{formatEdgeLabel(edge)}</span>
                              <ArrowRight className="w-3 h-3" />
                            </div>

                            <button
                              type="button"
                              onClick={() => onSelectConcept(targetConcept.id)}
                              className="font-semibold text-[#12213b] hover:text-[#2959ea] transition-colors cursor-pointer text-right"
                            >
                              {targetConcept.label}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GHI CHÚ CỦA TÔI */}
        {activeTab === 'notes' && (
          <div
            role="tabpanel"
            id="panel-notes"
            aria-labelledby="tab-notes"
            tabIndex={0}
            className="space-y-5 focus:outline-hidden"
          >
            {/* Notice for YouTube vs Native */}
            {!model.canTrackVideo && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    Chưa tự lưu vị trí từ YouTube. Nhập mốc video để lưu ghi chú.
                  </p>
                  <p className="text-[12px] text-amber-800 leading-relaxed">
                    Bạn có thể bấm vào một mốc trong phần lời thoại ở tab "Nội dung & nguồn" để chọn nhanh mốc thời gian muốn lưu.
                  </p>
                </div>
              </div>
            )}

            {/* Add Bookmark Form */}
            <form onSubmit={handleAddBookmark} className="space-y-3 p-4 rounded-xl border border-[#e1e7ef] bg-[#fafbfd]">
              <span className="font-bold text-[13px] text-[#12213b] block">
                Thêm ghi chú bài học mới:
              </span>

              <div className="flex flex-col sm:flex-row gap-2.5">
                {/* Manual timestamp input for YouTube, or auto-display for native */}
                {!model.canTrackVideo ? (
                  <div className="w-full sm:w-40">
                    <input
                      type="text"
                      value={manualTimeString || (draftNoteTime != null ? formatTimestamp(draftNoteTime) : '')}
                      onChange={(e) => { setManualTimeString(e.target.value); onSetDraftNoteTime(null); }}
                      placeholder="mm:ss (vd: 02:15)"
                      aria-label="Mốc video cho ghi chú"
                      className="w-full bg-white border border-[#e1e7ef] rounded-xl px-3 py-2 text-[13px] font-mono text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] min-h-[44px]"
                    />
                  </div>
                ) : (
                  <div className="px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl text-[13px] font-mono font-bold text-[#2959ea] flex items-center justify-center shrink-0 min-h-[44px]">
                    <Clock className="w-4 h-4 mr-1 text-[#2959ea]" />
                    <span>{formatTimestamp(playerTime)}</span>
                  </div>
                )}

                <input
                  type="text"
                  value={bookmarkLabel}
                  onChange={(e) => setBookmarkLabel(e.target.value)}
                  placeholder="Nhập nội dung ghi chú..."
                  aria-label="Nội dung ghi chú"
                  className="flex-1 bg-white border border-[#e1e7ef] rounded-xl px-3 py-2 text-[14px] text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] min-h-[44px]"
                />

                <button
                  type="submit"
                  disabled={savingBookmark || !bookmarkLabel.trim()}
                  className="min-h-[44px] px-5 bg-[#2959ea] hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>{savingBookmark ? 'Đang lưu...' : 'Lưu ghi chú'}</span>
                </button>
              </div>

              {bookmarkError && (
                <p className="text-[12px] text-red-600 font-medium">{bookmarkError}</p>
              )}
              {bookmarkSuccess && (
                <p className="text-[12px] text-emerald-600 font-medium">{bookmarkSuccess}</p>
              )}
            </form>

            {/* Bookmarks List */}
            <div className="space-y-2">
              <span className="font-bold text-[13px] text-[#12213b] uppercase tracking-wider block">
                Ghi chú đã lưu ({bookmarks.length}):
              </span>

              {bookmarks.length === 0 ? (
                <p className="p-4 text-center text-[13px] text-[#5f708b] italic border border-dashed border-[#e1e7ef] rounded-xl">
                  Chưa có ghi chú nào được lưu cho bài học này.
                </p>
              ) : (
                <div className="space-y-2">
                  {bookmarks.map((bm, bIdx) => (
                    <div
                      key={bm.id || bIdx}
                      className="p-3 bg-white rounded-xl border border-[#e1e7ef] flex items-center justify-between gap-3 text-[13px]"
                    >
                      <span className="text-[#12213b] font-medium leading-relaxed">
                        {bm.label}
                      </span>

                      <button
                        type="button"
                        onClick={() => onSeek(bm.seconds)}
                        className="font-mono text-[13px] font-bold text-[#2959ea] hover:bg-blue-50 px-3 py-2 rounded-xl border border-blue-200 flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer min-h-[44px]"
                        title={`Tua đến ${formatTimestamp(bm.seconds)}`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{formatTimestamp(bm.seconds)}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
