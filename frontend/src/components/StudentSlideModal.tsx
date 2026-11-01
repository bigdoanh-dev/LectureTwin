import React from 'react';
import { FileText, Play, X } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import { formatTimestamp } from '../presentation';

interface SlideItem {
  page: number;
  title: string;
  text: string;
  start: number;
  end: number;
}

interface StudentSlideModalProps {
  isOpen: boolean;
  onClose: () => void;
  slide: SlideItem | null;
  onSeek: (seconds: number) => void;
}

export const StudentSlideModal: React.FC<StudentSlideModalProps> = ({
  isOpen,
  onClose,
  slide,
  onSeek
}) => {
  if (!slide) return null;

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Nội dung Slide ${slide.page}: ${slide.title || 'Trang trình chiếu'}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4 text-xs sm:text-sm text-[#12213b]">
        <div className="flex items-center justify-between pb-2 border-b border-[#e1e7ef]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2959ea] flex items-center justify-center font-bold text-xs">
              p.{slide.page}
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-[#12213b]">
                {slide.title || `Trang ${slide.page}`}
              </h3>
              <p className="text-xs text-[#5f708b]">Học liệu bài giảng đã xuất bản</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slide Text Content */}
        <div className="p-4 rounded-xl bg-[#f6f8fc] border border-[#e1e7ef] text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-[#12213b]">
          {slide.text || 'Trang slide này không có văn bản trích xuất.'}
        </div>

        {/* Video sync button if timestamp exists */}
        {slide.start != null && slide.start >= 0 && (
          <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 flex items-center justify-between">
            <span className="text-xs text-[#2959ea] font-medium">
              Mốc video tương ứng: <strong>{formatTimestamp(slide.start)}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                onSeek(slide.start);
                onClose();
              }}
              className="min-h-[36px] px-3 py-1.5 bg-[#2959ea] hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Tua video đến đây</span>
            </button>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-[#e1e7ef]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#12213b] font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
