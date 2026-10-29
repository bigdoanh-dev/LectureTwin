import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Plus,
  Upload,
  Paperclip,
  CheckCircle2,
  FileText,
  Video,
  AlertCircle,
  Edit2,
  Check,
  X,
  RefreshCw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';

export const LecturesView: React.FC = () => {
  const {
    bootstrap,
    workspace,
    currentLectureId,
    selectLecture,
    refreshBootstrap,
    refreshWorkspace,
    role
  } = useApp();

  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('Duyệt đồ thị: BFS & DFS');
  const [objectives, setObjectives] = useState<string>(
    'Giải thích duyệt đồ thị và đánh dấu đỉnh đã thăm\nMô tả BFS với hàng đợi FIFO và DFS với ngăn xếp/đệ quy\nSo sánh thứ tự duyệt BFS và DFS trên cùng đồ thị'
  );
  const [totalMinutes, setTotalMinutes] = useState<number>(50);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Edit draft title/objectives
  const [isEditingDraft, setIsEditingDraft] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editObjectives, setEditObjectives] = useState<string>('');

  // Asset upload state
  const [uploadKind, setUploadKind] = useState<'video' | 'slides' | 'transcript'>('video');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  const shouldReduceMotion = useReducedMotion();
  const lectures = bootstrap?.lectures || [];
  const courses = bootstrap?.courses || [];
  const currentLecture = lectures.find(l => l.id === currentLectureId) || workspace?.lecture;
  const assets = workspace?.assets || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setMsg(null);
    try {
      const objList = objectives.split('\n').map(s => s.trim()).filter(Boolean);
      const courseId = selectedCourseId || courses[0]?.id || '';
      if (!courseId) {
        throw new Error('Chưa có học phần nào để gắn bài giảng');
      }

      const newLec = await api.createLecture({
        title: title.trim(),
        course_id: courseId,
        objectives: objList,
        total_minutes: totalMinutes,
      });
      await refreshBootstrap();
      await selectLecture(newLec.id);
      setShowCreateModal(false);
      setMsg(`Đã tạo bài giảng "${newLec.title}" thành công.`);
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Lỗi khi tạo bài giảng');
    } finally {
      setLoading(false);
    }
  };

  const handleAttachSample = async (id: string) => {
    setLoading(true);
    setErrorMsg(null);
    setMsg(null);
    try {
      await api.attachSample(id);
      await refreshBootstrap();
      await refreshWorkspace();
      setMsg('Đã gắn học liệu thực hành BFS & DFS cùng 8 ghi chú theo mốc.');
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Lỗi gắn dữ liệu mẫu');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (id: string) => {
    setLoading(true);
    setErrorMsg(null);
    setMsg(null);
    try {
      await api.publishLecture(id);
      await refreshBootstrap();
      await refreshWorkspace();
      setMsg('Đã xuất bản bài giảng cho học viên.');
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Lỗi xuất bản bài giảng (Cần xác minh toàn bộ bằng chứng trước khi xuất bản)');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditDraft = () => {
    if (!currentLecture) return;
    setEditTitle(currentLecture.title);
    setEditObjectives((currentLecture.objectives || []).join('\n'));
    setIsEditingDraft(true);
  };

  const handleSaveDraftEdit = async () => {
    if (!currentLectureId || !editTitle.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const objList = editObjectives.split('\n').map(s => s.trim()).filter(Boolean);
      await api.patchLecture(currentLectureId, {
        title: editTitle.trim(),
        objectives: objList
      });
      setIsEditingDraft(false);
      await refreshBootstrap();
      await refreshWorkspace();
      setMsg('Đã cập nhật thông tin bài giảng.');
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Lỗi cập nhật bài giảng');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLectureId || !uploadFile) return;
    setUploading(true);
    setErrorMsg(null);
    setMsg(null);
    try {
      await api.uploadAsset(currentLectureId, uploadFile, uploadKind);
      setUploadFile(null);
      await refreshWorkspace();
      setMsg(`Đã tải lên tệp ${uploadKind} thành công.`);
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Lỗi khi tải lên học liệu');
    } finally {
      setUploading(false);
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
            Quản lý bài giảng & Học liệu
          </h1>
          <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
            Phân biệt rõ: Trích đoạn video mẫu 50 GIÂY và Thời lượng kế hoạch giảng dạy 50 PHÚT.
          </p>
        </div>

        {role === 'teacher' && (
          <button
            type="button"
            onClick={() => {
              if (courses.length > 0 && !selectedCourseId) {
                setSelectedCourseId(courses[0].id);
              }
              setShowCreateModal(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 shadow-xs transition-colors cursor-pointer self-start sm:self-auto min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo bài giảng mới</span>
          </button>
        )}
      </div>

      {msg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-[#12213b] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#2959ea] shrink-0" />
            <span>{msg}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-[#2959ea] font-bold p-1">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs sm:text-sm text-rose-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-700 font-bold p-1">✕</button>
        </div>
      )}

      {/* Lectures Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {lectures.map((lec) => {
          const isSelected = lec.id === currentLectureId;
          return (
            <div
              key={lec.id}
              className={`bg-white rounded-xl border p-5 shadow-2xs space-y-4 transition-all ${
                isSelected ? 'border-[#2959ea] ring-2 ring-blue-100' : 'border-[#e1e7ef] hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono text-[#5f708b] block">{lec.id}</span>
                  <h3 className="font-bold text-base text-[#12213b] mt-0.5">
                    {lec.title}
                  </h3>
                </div>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  lec.status === 'published'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-[#5f708b] border border-slate-200'
                }`}>
                  {lec.status === 'published' ? 'Đã xuất bản' : 'Bản thảo'}
                </span>
              </div>

              {/* Badges / Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs text-[#5f708b] pt-2 border-t border-[#e1e7ef]">
                <div className="bg-[#f6f8fc] p-2.5 rounded-lg border border-[#e1e7ef]">
                  <span className="text-xs text-[#5f708b] block">Kế hoạch</span>
                  <strong className="text-[#12213b]">{lec.total_minutes} phút</strong>
                </div>
                <div className="bg-[#f6f8fc] p-2.5 rounded-lg border border-[#e1e7ef]">
                  <span className="text-xs text-[#5f708b] block">Học liệu mẫu</span>
                  <strong className="text-[#12213b]">{lec.sample_attached ? 'Học liệu thực hành' : 'Chưa gắn'}</strong>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#e1e7ef]">
                <button
                  type="button"
                  onClick={() => selectLecture(lec.id)}
                  className={`flex-1 min-h-[40px] py-1.5 px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#2959ea] text-white' : 'bg-[#f6f8fc] hover:bg-slate-200 text-[#12213b] border border-[#e1e7ef]'
                  }`}
                >
                  {isSelected ? 'Đang chọn' : 'Chọn bài giảng'}
                </button>

                {role === 'teacher' && !lec.sample_attached && (
                  <button
                    type="button"
                    onClick={() => handleAttachSample(lec.id)}
                    className="min-h-[40px] py-1.5 px-3 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer"
                  >
                    Gắn mẫu BFS
                  </button>
                )}

                {role === 'teacher' && lec.status !== 'published' && (
                  <button
                    type="button"
                    onClick={() => handlePublish(lec.id)}
                    className="min-h-[40px] py-1.5 px-3 rounded-xl text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-[#2959ea] border border-blue-200 cursor-pointer"
                  >
                    Xuất bản
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Lecture Detail & Asset Management */}
      {currentLecture && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Metadata & Objectives (6 Cols) */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#e1e7ef]">
              <div>
                <span className="text-xs font-mono text-[#5f708b] block">{currentLecture.id}</span>
                <h2 className="font-bold text-base text-[#12213b]">
                  {currentLecture.title}
                </h2>
              </div>

              {role === 'teacher' && currentLecture.status === 'draft' && !isEditingDraft && (
                <button
                  type="button"
                  onClick={handleStartEditDraft}
                  className="text-[#2959ea] hover:text-blue-800 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Sửa thông tin</span>
                </button>
              )}
            </div>

            {isEditingDraft ? (
              <div className="space-y-3 text-xs bg-[#f6f8fc] p-4 rounded-xl border border-[#e1e7ef]">
                <div>
                  <label className="block font-bold text-[#12213b] mb-1">Tên bài giảng:</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="w-full bg-white border border-[#e1e7ef] rounded-lg p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#12213b] mb-1">Mục tiêu học tập:</label>
                  <textarea
                    rows={3}
                    value={editObjectives}
                    onChange={e => setEditObjectives(e.target.value)}
                    className="w-full bg-white border border-[#e1e7ef] rounded-lg p-2 text-xs"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingDraft(false)}
                    className="px-3 py-1.5 text-[#5f708b] hover:bg-slate-100 rounded-lg"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraftEdit}
                    className="px-3.5 py-1.5 bg-[#2959ea] text-white rounded-lg font-semibold flex items-center space-x-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Lưu thay đổi</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-bold text-[#12213b] block mb-1">Mục tiêu học tập (CLO):</span>
                  <ul className="list-disc list-inside space-y-1 text-[#5f708b]">
                    {currentLecture.objectives?.map((obj, i) => (
                      <li key={i}>{obj}</li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#e1e7ef] text-[#5f708b]">
                  <div>
                    <span className="text-xs text-[#5f708b] block">Thời lượng:</span>
                    <strong className="text-[#12213b]">{currentLecture.total_minutes} phút</strong>
                  </div>
                  <div>
                    <span className="text-xs text-[#5f708b] block">Khái niệm phát hiện:</span>
                    <strong className="text-[#12213b]">{currentLecture.concept_count} khái niệm</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Upload & Assets List (6 Cols) */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#e1e7ef]">
              <div className="flex items-center space-x-2">
                <Paperclip className="w-4 h-4 text-[#2959ea]" />
                <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
                  Học liệu & Tệp nguồn ({assets.length})
                </h2>
              </div>
            </div>

            {/* Upload Area for Teacher */}
            {role === 'teacher' && (
              <form onSubmit={handleUploadAsset} className="bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-3.5 space-y-3 text-xs">
                <div className="flex items-center space-x-2">
                  <label className="font-bold text-[#12213b]">Loại tệp:</label>
                  <select
                    value={uploadKind}
                    onChange={(e) => setUploadKind(e.target.value as any)}
                    className="bg-white border border-[#e1e7ef] rounded-lg px-2 py-1 text-xs"
                  >
                    <option value="video">Video (MP4)</option>
                    <option value="slides">Bài giảng trình chiếu (PDF / PPTX / JSON)</option>
                    <option value="transcript">Bản ghi lời nói (VTT / TXT / JSON)</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="flex-1 text-xs text-[#5f708b] file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#2959ea] hover:file:bg-blue-100"
                  />
                  <button
                    type="submit"
                    disabled={!uploadFile || uploading}
                    className="px-3 py-1.5 bg-[#2959ea] hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-semibold flex items-center space-x-1 cursor-pointer shrink-0 min-h-[38px]"
                  >
                    {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>Tải lên</span>
                  </button>
                </div>
              </form>
            )}

            {/* Assets List */}
            {assets.length === 0 ? (
              <div className="text-center py-6 text-[#5f708b] text-xs italic">
                Chưa có tệp học liệu nào được gắn vào bài giảng này.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {assets.map((ast) => (
                  <div key={ast.id} className="p-2.5 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      {ast.kind === 'video' ? (
                        <Video className="w-4 h-4 text-[#2959ea] shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                      )}
                      <div>
                        <span className="font-bold text-[#12213b]">{ast.name}</span>
                        <div className="text-xs text-[#5f708b]">
                          {ast.kind} · {ast.source_type}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs bg-slate-200/80 text-[#12213b] font-mono px-2 py-0.5 rounded">
                      {ast.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-[#12213b]/60 backdrop-blur-xs" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-2xl max-w-md w-full p-6 border border-[#e1e7ef] shadow-xl space-y-4 z-10">
            <div className="flex items-center justify-between border-b border-[#e1e7ef] pb-2">
              <h3 className="font-bold text-base text-[#12213b]">Tạo bài giảng mới</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-[#12213b]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#12213b] mb-1">Học phần:</label>
                <select
                  value={selectedCourseId}
                  onChange={e => setSelectedCourseId(e.target.value)}
                  className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#12213b] mb-1">Tên bài giảng:</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-[#12213b] mb-1">Mục tiêu học tập (mỗi dòng 1 mục tiêu):</label>
                <textarea
                  rows={3}
                  value={objectives}
                  onChange={e => setObjectives(e.target.value)}
                  className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#12213b] mb-1">Thời lượng kế hoạch (phút):</label>
                <input
                  type="number"
                  value={totalMinutes}
                  onChange={e => setTotalMinutes(Number(e.target.value))}
                  className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                  min={10}
                  max={180}
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#e1e7ef]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 text-[#5f708b] hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-[#2959ea] hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs min-h-[44px]"
                >
                  Tạo bài giảng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
};
