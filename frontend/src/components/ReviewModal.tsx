import React, { useState } from 'react';
import { ShieldCheck, AlertCircle, X, Check } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
  pendingCount?: number;
  unsupportedCount?: number;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  pendingCount = 0,
  unsupportedCount = 0,
  triggerRef
}) => {
  const [note, setNote] = useState<string>(
    'Đã đối chiếu các khái niệm có trích dẫn video/transcript hợp lệ; loại trừ các phát hiện thiếu bằng chứng trước khi xuất bản cho học viên.'
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(note);
      onClose();
    } catch (err: any) {
      // Keep modal open on error per review specification!
      setErrorMessage(err.detail || err.message || 'Lỗi khi lưu quyết định thẩm định. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const supportedCount = Math.max(pendingCount - unsupportedCount, 0);

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Kiểm tra nội dung trước khi giao"
      maxWidth="max-w-lg"
      triggerRef={triggerRef}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-[#12213b]">
                Kiểm tra nội dung trước khi giao
              </h3>
              <p className="text-xs text-[#5f708b] mt-0.5">
                Thẩm định các đề xuất từ học liệu trước khi xuất bản cho người học
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-[#12213b] min-h-[44px] min-w-[44px] p-2 flex items-center justify-center rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] transition-colors"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Fact breakdown: uses "chỉ giao nội dung đã được giảng viên kiểm tra" */}
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-2 leading-relaxed">
          <div className="font-bold flex items-center space-x-1.5 text-amber-900">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Nội dung thẩm định trước khi xuất bản:</span>
          </div>
          <p>
            Hệ thống sẽ <strong>xác nhận các khái niệm có dẫn nguồn</strong> ({supportedCount} nội dung hợp lệ), đồng thời <strong>loại trừ các nhận định thiếu bằng chứng</strong> ({unsupportedCount} nhận định chưa được kiểm chứng trong video/slide) để <strong>chỉ giao nội dung đã được giảng viên kiểm tra</strong> cho học viên.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="teacher-review-note" className="block text-xs font-bold text-[#12213b] mb-1.5">
              Ghi chú thẩm định & lý do loại trừ:
            </label>
            <textarea
              id="teacher-review-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-3 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] leading-relaxed resize-none"
              placeholder="Nhập ghi chú hoặc lý do phê duyệt/loại trừ..."
              required
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[#e1e7ef]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 min-h-[44px] text-xs sm:text-sm font-semibold text-[#5f708b] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || !note.trim()}
              className="px-4 py-2 min-h-[44px] text-xs sm:text-sm font-semibold bg-[#2959ea] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? 'Đang lưu quyết định...' : 'Xác nhận duyệt và loại nội dung thiếu nguồn'}</span>
            </button>
          </div>
        </form>
      </div>
    </ModalDialog>
  );
};
