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
  const [note, setNote] = useState<string>('');
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
      setErrorMessage(err.detail || err.message || 'Không lưu được quyết định. Vui lòng thử lại.');
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
                Hãy xem nội dung và nguồn dẫn trước khi quyết định đưa chúng vào bài học.
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

        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-2 leading-relaxed">
          <div className="font-bold flex items-center space-x-1.5 text-amber-900">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>Điều sẽ xảy ra khi bạn xác nhận:</span>
          </div>
          <p>
            Khi bạn lưu quyết định, {supportedCount} ý có nguồn hợp lệ sẽ được chấp nhận; {unsupportedCount} ý chưa có nguồn hợp lệ sẽ bị loại khỏi bài dành cho học viên. Hãy mở từng nguồn để kiểm tra trước khi xác nhận.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="teacher-review-note" className="block text-xs font-bold text-[#12213b] mb-1.5">
              Ghi chú cho quyết định <span className="text-rose-600">(bắt buộc)</span>:
            </label>
            <textarea
              id="teacher-review-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-3 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea] leading-relaxed resize-none"
              placeholder="Ví dụ: Đã kiểm tra các ý chính và nguồn dẫn kèm theo."
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
              <span>{submitting ? 'Đang lưu quyết định...' : 'Lưu quyết định duyệt'}</span>
            </button>
          </div>
        </form>
      </div>
    </ModalDialog>
  );
};
