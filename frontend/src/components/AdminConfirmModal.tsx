import React from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import type { User } from '../types';

interface AdminConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onConfirm: () => Promise<void>;
  isPending: boolean;
  error: string | null;
}

export const AdminConfirmModal: React.FC<AdminConfirmModalProps> = ({
  isOpen,
  onClose,
  user,
  onConfirm,
  isPending,
  error
}) => {
  if (!user) return null;

  const isLocking = user.is_active;
  const title = isLocking ? 'Xác nhận tạm khóa tài khoản' : 'Xác nhận kích hoạt tài khoản';

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    await onConfirm();
  };

  return (
    <ModalDialog isOpen={isOpen} onClose={() => { if (!isPending) onClose(); }} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${isLocking ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
            {isLocking ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-[#12213b]">{title}</h3>
            <p className="text-xs text-[#5f708b] mt-1 leading-relaxed">
              {isLocking ? (
                <>
                  Bạn có chắc chắn muốn tạm khóa tài khoản <span className="font-bold text-[#12213b]">{user.full_name}</span> (<span className="font-mono text-[#2959ea]">@{user.username}</span>)? Người dùng này sẽ không thể đăng nhập hoặc thực hiện bất kỳ thao tác nào cho đến khi được kích hoạt lại.
                </>
              ) : (
                <>
                  Bạn có chắc chắn muốn kích hoạt lại tài khoản <span className="font-bold text-[#12213b]">{user.full_name}</span> (<span className="font-mono text-[#2959ea]">@{user.username}</span>)? Người dùng sẽ có thể đăng nhập bình thường.
                </>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-normal">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#e1e7ef]">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm font-semibold text-[#5f708b] hover:text-[#12213b] hover:bg-slate-100 rounded-xl min-h-[44px] transition-colors cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl min-h-[44px] shadow-2xs transition-colors cursor-pointer disabled:opacity-50 ${
              isLocking
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{isLocking ? 'Xác nhận tạm khóa' : 'Xác nhận kích hoạt'}</span>
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
