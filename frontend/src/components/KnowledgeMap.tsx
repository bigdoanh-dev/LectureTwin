import React, { useState, useMemo, useRef } from 'react';
import {
  Network,
  Search,
  CheckCircle2,
  Info,
  MoveRight,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import type { ConceptNode, ConceptEdge } from '../types';
import {
  knowledgeMapLayout,
  knowledgeNodeSize,
  knowledgeRelationLabel,
  knowledgeSearchText
} from '../knowledge-map-model';

export interface KnowledgeMapProps {
  concepts: ConceptNode[];
  edges: ConceptEdge[];
  selectedConceptId: string | null;
  onSelectConcept: (id: string) => void;
  title?: string;
  subtitle?: string;
  notice?: string;
  className?: string;
  isTeacherView?: boolean;
}

export const KnowledgeMap: React.FC<KnowledgeMapProps> = ({
  concepts,
  edges,
  selectedConceptId,
  onSelectConcept,
  title = 'Bản đồ kiến thức',
  subtitle = 'Mô hình tri thức và liên kết giữa các khái niệm chính trong bài học.',
  notice,
  className = '',
  isTeacherView = false
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Layout computed deterministically via knowledgeMapLayout
  const layout = useMemo(() => knowledgeMapLayout(concepts, edges), [concepts, edges]);

  // Concept lookup map
  const conceptMap = useMemo(
    () => new Map(layout.nodes.map(n => [n.id, n])),
    [layout.nodes]
  );

  // Compute neighbor concept IDs for the selected concept
  const neighborIds = useMemo(() => {
    if (!selectedConceptId) return new Set<string>();
    const neighbors = new Set<string>();
    layout.edges.forEach(e => {
      if (e.source === selectedConceptId) neighbors.add(e.target);
      if (e.target === selectedConceptId) neighbors.add(e.source);
    });
    return neighbors;
  }, [selectedConceptId, layout.edges]);

  // Accent-insensitive search
  const normalizedQuery = useMemo(
    () => knowledgeSearchText(searchQuery),
    [searchQuery]
  );

  const matchedConceptIds = useMemo(() => {
    if (!normalizedQuery) return new Set<string>();
    const matches = new Set<string>();
    layout.nodes.forEach(c => {
      const fullText = `${c.label} ${c.description || ''}`;
      if (knowledgeSearchText(fullText).includes(normalizedQuery)) {
        matches.add(c.id);
      }
    });
    return matches;
  }, [layout.nodes, normalizedQuery]);

  const verifiedCount = useMemo(
    () => layout.nodes.filter(c => c.verified).length,
    [layout.nodes]
  );

  const selectedConcept = useMemo(
    () => layout.nodes.find(c => c.id === selectedConceptId) || null,
    [layout.nodes, selectedConceptId]
  );

  const { width: nodeW, height: nodeH } = knowledgeNodeSize;

  return (
    <div
      className={`bg-white rounded-2xl border border-[#e1e7ef] p-4 sm:p-5 shadow-2xs space-y-4 ${className}`}
      role="region"
      aria-label={title}
    >
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#2959ea] flex items-center justify-center border border-blue-100 shrink-0">
              <Network className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-base text-[#12213b] tracking-tight">
              {title}
            </h3>
          </div>
          <p className="text-xs text-[#5f708b] leading-normal">
            {subtitle}
          </p>
        </div>

        {/* Local Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm khái niệm..."
            aria-label="Tìm trên bản đồ kiến thức"
            className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl pl-8 pr-8 py-1.5 text-xs text-[#12213b] placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] focus:bg-white min-h-[44px] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 text-xs cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Xóa tìm kiếm"
              aria-label="Xóa tìm kiếm bản đồ"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-[#12213b] flex items-start gap-2.5 leading-relaxed">
          <Info className="w-4 h-4 text-[#2959ea] shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* Compact Legend & Help Text */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 px-3 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef]/80">
        <div className="flex items-center gap-3 text-[#5f708b] text-xs font-medium flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2959ea]" />
            <strong className="text-[#12213b]">{layout.nodes.length}</strong> khái niệm
          </span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <strong className="text-[#12213b]">{layout.edges.length}</strong> mối quan hệ
          </span>
          <span>·</span>
          <span className="flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{verifiedCount} đã duyệt</span>
          </span>
        </div>

        <div className="text-xs text-[#2959ea] font-medium italic">
          * Chọn một khái niệm để xem giải thích và dẫn chứng
        </div>
      </div>

      {normalizedQuery && matchedConceptIds.size > 0 && <p role="status" className="text-sm text-[#5f708b]">{matchedConceptIds.size} khái niệm phù hợp được làm nổi bật trên bản đồ.</p>}
      {/* Search No Results Warning */}
      {searchQuery.trim() !== '' && matchedConceptIds.size === 0 && (
        <div role="status" className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
          <span>Không tìm thấy khái niệm nào phù hợp với từ khóa &ldquo;{searchQuery}&rdquo;.</span>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-amber-800 font-semibold hover:underline cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Đặt lại tìm kiếm</span>
          </button>
        </div>
      )}

      {/* Graph Display Area */}
      {layout.nodes.length === 0 ? (
        <div className="py-12 text-center space-y-2 border border-dashed border-[#e1e7ef] rounded-xl p-6 bg-[#fbfdff]">
          <Network className="w-8 h-8 text-[#5f708b]/40 mx-auto" />
          <p className="text-xs font-semibold text-[#12213b]">
            Chưa có khái niệm nào trong bản đồ tri thức bài học này.
          </p>
          <p className="text-xs text-[#5f708b]">
            {isTeacherView
              ? 'Vui lòng chạy luồng phân tích bài giảng để tác nhân trích xuất đồ thị tri thức.'
              : 'Nội dung bản đồ sẽ hiển thị khi bài giảng được giảng viên phê duyệt và xuất bản.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile horizontal scroll hint */}
          <div className="sm:hidden flex items-center justify-between text-xs text-[#5f708b] px-1">
            <span className="flex items-center gap-1">
              <MoveRight className="w-3 h-3 text-[#2959ea]" />
              <span>Cuộn ngang để xem đầy đủ mạng lưới</span>
            </span>
            <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">Bản đồ tương tác</span>
          </div>

          {/* Interactive Scrollable Canvas Container */}
          <div
            ref={containerRef}
            tabIndex={0}
            role="region"
            aria-label="Sơ đồ đồ thị tri thức"
            className="overflow-auto max-h-[640px] border border-[#e1e7ef] rounded-xl bg-[#fafbfe] relative focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] select-none"
            style={{ minHeight: `${Math.min(layout.height, 640)}px` }}
          >
            {/* SVG Connector Layer */}
            <svg
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              width={layout.width}
              height={layout.height}
              style={{ minWidth: `${layout.width}px`, minHeight: `${layout.height}px` }}
            >
              <defs>
                {/* Default arrow */}
                <marker
                  id="km-arrow-default"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#94a3b8" />
                </marker>

                {/* Active arrow */}
                <marker
                  id="km-arrow-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#2959ea" />
                </marker>

                {/* Neighbor arrow */}
                <marker
                  id="km-arrow-neighbor"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3b82f6" />
                </marker>
              </defs>

              {/* Draw Edges */}
              {layout.edges.map(edge => {
                const src = conceptMap.get(edge.source);
                const tgt = conceptMap.get(edge.target);
                if (!src || !tgt) return null;

                const isConnectedToSelected =
                  selectedConceptId != null &&
                  (edge.source === selectedConceptId || edge.target === selectedConceptId);
                const isNeighborEdge =
                  selectedConceptId != null &&
                  neighborIds.has(edge.source) &&
                  neighborIds.has(edge.target);

                const label = knowledgeRelationLabel(edge);

                // Self loop handling
                if (src.id === tgt.id) {
                  const loopX = src.x + nodeW / 2;
                  const loopY = src.y;
                  const loopPath = `M ${loopX - 18} ${loopY} C ${loopX - 32} ${loopY - 36}, ${loopX + 32} ${loopY - 36}, ${loopX + 18} ${loopY}`;
                  return (
                    <g key={edge.id} className="transition-all duration-150">
                      <path
                        d={loopPath}
                        fill="none"
                        stroke={isConnectedToSelected ? '#2959ea' : '#cbd5e1'}
                        strokeWidth={isConnectedToSelected ? 2.5 : 1.5}
                        markerEnd={isConnectedToSelected ? 'url(#km-arrow-active)' : 'url(#km-arrow-default)'}
                      />
                      <g transform={`translate(${loopX}, ${loopY - 40})`}>
                        <rect
                          x="-35"
                          y="-9"
                          width="70"
                          height="18"
                          rx="4"
                          fill="#ffffff"
                          stroke={isConnectedToSelected ? '#2959ea' : '#e2e8f0'}
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          fontSize="12"
                          fontWeight="600"
                          fill={isConnectedToSelected ? '#2959ea' : '#5f708b'}
                        >
                          {label}
                        </text>
                      </g>
                    </g>
                  );
                }

                // Two distinct nodes
                let x1: number;
                let y1: number;
                let x2: number;
                let y2: number;

                const srcCenterX = src.x + nodeW / 2;
                const srcCenterY = src.y + nodeH / 2;
                const tgtCenterX = tgt.x + nodeW / 2;
                const tgtCenterY = tgt.y + nodeH / 2;

                const dx = tgtCenterX - srcCenterX;
                const dy = tgtCenterY - srcCenterY;

                // Pick connection ports based on relative direction
                if (Math.abs(dx) >= Math.abs(dy)) {
                  // Primarily horizontal
                  if (dx > 0) {
                    x1 = src.x + nodeW;
                    y1 = srcCenterY;
                    x2 = tgt.x;
                    y2 = tgtCenterY;
                  } else {
                    x1 = src.x;
                    y1 = srcCenterY;
                    x2 = tgt.x + nodeW;
                    y2 = tgtCenterY;
                  }
                } else {
                  // Primarily vertical
                  if (dy > 0) {
                    x1 = srcCenterX;
                    y1 = src.y + nodeH;
                    x2 = tgtCenterX;
                    y2 = tgt.y;
                  } else {
                    x1 = srcCenterX;
                    y1 = src.y;
                    x2 = tgtCenterX;
                    y2 = tgt.y + nodeH;
                  }
                }

                const dist = Math.hypot(x2 - x1, y2 - y1);
                const curveFactor = Math.min(60, Math.max(25, dist * 0.3));

                // Control points
                let c1x = x1;
                let c1y = y1;
                let c2x = x2;
                let c2y = y2;

                if (Math.abs(dx) >= Math.abs(dy)) {
                  c1x = x1 + (dx > 0 ? curveFactor : -curveFactor);
                  c2x = x2 - (dx > 0 ? curveFactor : -curveFactor);
                } else {
                  c1y = y1 + (dy > 0 ? curveFactor : -curveFactor);
                  c2y = y2 - (dy > 0 ? curveFactor : -curveFactor);
                }

                const pathData = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;

                // Spread labels along converging edges so distinct relation labels stay readable.
                const incoming = layout.edges.filter(item => item.target === edge.target);
                const order = incoming.indexOf(edge);
                const t = incoming.length > 1 ? 0.35 + 0.3 * order / (incoming.length - 1) : 0.5;
                const u = 1 - t;
                const midX = u ** 3 * x1 + 3 * u ** 2 * t * c1x + 3 * u * t ** 2 * c2x + t ** 3 * x2;
                const midY = u ** 3 * y1 + 3 * u ** 2 * t * c1y + 3 * u * t ** 2 * c2y + t ** 3 * y2;

                return (
                  <g key={edge.id} className="transition-all duration-150">
                    <path
                      d={pathData}
                      fill="none"
                      stroke={
                        isConnectedToSelected
                          ? '#2959ea'
                          : isNeighborEdge
                          ? '#60a5fa'
                          : '#cbd5e1'
                      }
                      strokeWidth={isConnectedToSelected ? 2.5 : isNeighborEdge ? 2 : 1.5}
                      markerEnd={
                        isConnectedToSelected
                          ? 'url(#km-arrow-active)'
                          : isNeighborEdge
                          ? 'url(#km-arrow-neighbor)'
                          : 'url(#km-arrow-default)'
                      }
                    />

                    {/* Relation label pill */}
                    <g transform={`translate(${midX}, ${midY})`}>
                      <rect
                        x={-Math.max(76, label.length * 7 + 18) / 2}
                        y="-10"
                        width={Math.max(76, label.length * 7 + 18)}
                        height="20"
                        rx="5"
                        fill="#ffffff"
                        stroke={isConnectedToSelected ? '#2959ea' : '#e2e8f0'}
                        strokeWidth={isConnectedToSelected ? 1.5 : 1}
                        className="shadow-2xs"
                      />
                      <text
                        x="0"
                        y="3.5"
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="600"
                        fill={isConnectedToSelected ? '#2959ea' : '#5f708b'}
                        className="select-none pointer-events-none"
                      >
                        {label}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* HTML Node Buttons Layer */}
            <div
              className="relative"
              style={{ width: `${layout.width}px`, height: `${layout.height}px` }}
            >
              {layout.nodes.map(concept => {
                const isSelected = concept.id === selectedConceptId;
                const isNeighbor = neighborIds.has(concept.id);
                const isSearchMatch = matchedConceptIds.has(concept.id);
                const evidenceCount = concept.evidence_ids?.length || 0;

                return (
                  <button
                    key={concept.id}
                    type="button"
                    onClick={() => onSelectConcept(concept.id)}
                    aria-label={`Xem khái niệm: ${concept.label}`}
                    aria-pressed={isSelected}
                    title={`${concept.label}: ${concept.description || 'Chưa có mô tả'}`}
                    style={{
                      left: `${concept.x}px`,
                      top: `${concept.y}px`,
                      width: `${nodeW}px`,
                      height: `${nodeH}px`
                    }}
                    className={`absolute rounded-xl border text-left p-2.5 cursor-pointer flex flex-col justify-between transition-all select-none min-h-[44px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
                      isSelected
                        ? 'bg-blue-50/95 border-[#2959ea] ring-2 ring-[#2959ea] shadow-sm z-20'
                        : isSearchMatch
                        ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300 shadow-2xs z-10'
                        : isNeighbor
                        ? 'bg-blue-50/40 border-blue-300 shadow-2xs z-10'
                        : 'bg-white border-[#e1e7ef] hover:border-blue-300 hover:bg-slate-50 z-0 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 w-full">
                      <span
                        className={`font-bold text-[13px] truncate flex-1 ${
                          isSelected ? 'text-[#2959ea]' : 'text-[#12213b]'
                        }`}
                      >
                        {concept.label}
                      </span>
                      {concept.verified ? (
                        <span aria-label="Đã được giảng viên duyệt">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isSelected ? 'text-[#2959ea]' : 'text-emerald-600'
                            }`}
                            aria-hidden="true"
                          />
                        </span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#5f708b] w-full pt-1 border-t border-slate-100/80">
                      <span>{evidenceCount > 0 ? `${evidenceCount} minh chứng` : 'Ý chính'}</span>
                      {isSearchMatch && (
                        <span className="text-xs font-bold text-amber-700 bg-amber-100 px-1 rounded">
                          Khớp
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-xs font-bold text-[#2959ea]">
                          Đang chọn
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accessible DOM description for screen readers */}
          <div className="sr-only" aria-live="polite">
            Bản đồ gồm {layout.nodes.length} khái niệm và {layout.edges.length} mối quan hệ.
            {selectedConcept ? ` Khái niệm đang chọn: ${selectedConcept.label}.` : ''}
            Các mối liên kết: {layout.edges.map(e => `${conceptMap.get(e.source)?.label || e.source} ${knowledgeRelationLabel(e)} ${conceptMap.get(e.target)?.label || e.target}`).join('; ')}.
          </div>
        </div>
      )}
    </div>
  );
};
export default KnowledgeMap;
