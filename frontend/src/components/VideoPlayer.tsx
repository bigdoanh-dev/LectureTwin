import React, { useRef, useEffect, useState } from 'react';
import {
  Video,
  Clock,
  AlertCircle,
  RefreshCw,
  FileText,
  ExternalLink
} from 'lucide-react';
import { Evidence } from '../types';

interface VideoPlayerProps {
  lectureId: string;
  variant?: 'full' | 'embedded';
  seekTarget?: number | null;
  onClearSeekTarget?: () => void;
  selectedEvidence?: Evidence | null;
  defaultEvidence?: Evidence | null;
  sampleAttached?: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPause?: (currentTime: number) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  lectureId,
  variant = 'full',
  seekTarget,
  onClearSeekTarget,
  selectedEvidence,
  defaultEvidence,
  sampleAttached = false,
  onTimeUpdate,
  onPause,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  const [youtubeSeekRequest, setYoutubeSeekRequest] = useState<{ seconds: number; revision: number } | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [hasVideoError, setHasVideoError] = useState<boolean>(false);
  const [retryKey, setRetryKey] = useState<number>(0);
  const activeEvidence = selectedEvidence || defaultEvidence;
  const isSlideOnly = activeEvidence?.kind === 'slide';

  // Reset video state when lecture or sampleAttached changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setHasVideoError(false);
    pendingSeekRef.current = null;
    setYoutubeSeekRequest(null);
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [lectureId, sampleAttached]);

  // Handle external seek target (evidence citation / transcript click)
  useEffect(() => {
    if (seekTarget !== undefined && seekTarget !== null) {
      if (sampleAttached) {
        setYoutubeSeekRequest((previous) => ({ seconds: Math.floor(seekTarget), revision: (previous?.revision ?? 0) + 1 }));
        if (onClearSeekTarget) onClearSeekTarget();
        return;
      }
      pendingSeekRef.current = seekTarget;
      if (videoRef.current && videoRef.current.readyState >= 1) {
        try {
          videoRef.current.currentTime = seekTarget;
          setCurrentTime(seekTarget);
          pendingSeekRef.current = null;
          if (onClearSeekTarget) onClearSeekTarget();
        } catch (err) {
          console.warn('Seek error:', err);
        }
      }
    }
  }, [seekTarget, onClearSeekTarget, sampleAttached]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    setDuration(vid.duration);
    if (pendingSeekRef.current !== null) {
      try {
        vid.currentTime = pendingSeekRef.current;
        setCurrentTime(pendingSeekRef.current);
        if (onClearSeekTarget) onClearSeekTarget();
      } catch (err) {
        console.warn('Pending seek error on loadedmetadata:', err);
      }
      pendingSeekRef.current = null;
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const time = e.currentTarget.currentTime;
    const dur = e.currentTarget.duration;
    setCurrentTime(time);
    if (onTimeUpdate) {
      onTimeUpdate(time, dur);
    }
  };

  const handlePause = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (onPause) {
      onPause(e.currentTarget.currentTime);
    }
  };

  const formatSeconds = (sec: number | undefined | null) => {
    if (sec === undefined || sec === null || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const seekToEvidence = (seconds: number) => {
    if (sampleAttached) {
      setYoutubeSeekRequest((previous) => ({ seconds: Math.floor(seconds), revision: (previous?.revision ?? 0) + 1 }));
      return;
    }
    pendingSeekRef.current = seconds;
    if (videoRef.current && videoRef.current.readyState >= 1) {
      try {
        videoRef.current.currentTime = seconds;
        setCurrentTime(seconds);
        pendingSeekRef.current = null;
      } catch (err) {
        console.warn('Seek error:', err);
      }
    }
  };

  const videoSrc = `/api/lectures/${lectureId}/video`;

  // Render the real YouTube source used by the curated, time-stamped notes.
  const renderYouTubePlayer = () => (
    <div className="space-y-2.5">
      <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center border border-slate-800">
        <iframe
          key={youtubeSeekRequest?.revision ?? 0}
          src={`https://www.youtube-nocookie.com/embed/pcKY4hjDrxk?start=${youtubeSeekRequest?.seconds ?? 0}&autoplay=${youtubeSeekRequest ? 1 : 0}`}
          title="5.1 Graph Traversals - BFS & DFS - Abdul Bari"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full h-full border-0"
        />
      </div>

      {/* Attribution & Honest Disclaimer */}
      <div className="space-y-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[#5f708b] gap-1 px-0.5">
          <span className="font-medium text-[#12213b]">
            Nguồn: Abdul Bari · 5.1 Graph Traversals - BFS & DFS (18:29)
          </span>
          <a
            href={`https://www.youtube.com/watch?v=pcKY4hjDrxk${activeEvidence?.start != null ? `&t=${Math.floor(activeEvidence.start)}s` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#2959ea] hover:text-blue-800 font-semibold"
          >
            <span>Mở trên YouTube</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <p className="text-[11px] sm:text-xs text-[#5f708b] italic px-0.5 leading-relaxed">
          Ghi chú tiếng Việt được biên soạn theo phụ đề tự động tiếng Anh của video. Demo chưa tự nghe hoặc phân tích hình ảnh.
        </p>
      </div>
    </div>
  );

  // Render Practice Local Clip or Uploaded Video Panel
  const renderPracticePlayer = () => (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center border border-slate-800">
        {!hasVideoError ? (
          <video
            key={`${lectureId}-${retryKey}`}
            ref={videoRef}
            src={videoSrc}
            controls
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPause={handlePause}
            onError={() => {
              setHasVideoError(true);
            }}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full p-6 flex flex-col items-center justify-center text-center space-y-3 bg-slate-900 text-white select-none">
            <AlertCircle className="w-7 h-7 text-amber-400" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-200">
                Video học liệu hiện không khả dụng
              </div>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Máy chủ chưa phát được luồng video hoặc file media chưa được chuẩn bị cho bài giảng này.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setHasVideoError(false);
                setRetryKey(k => k + 1);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#2959ea] hover:bg-blue-700 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Thử kết nối lại</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-[#5f708b] px-0.5">
        <span className="font-semibold text-slate-700">
          Video đã tải lên
        </span>
        <span className="font-mono text-[11px]">
          {currentTime > 0 ? formatSeconds(currentTime) : '00:00'} / {duration > 0 ? formatSeconds(duration) : '--:--'}
        </span>
      </div>
    </div>
  );

  // Embedded Variant: used inside Teacher Workspace & Student views
  if (variant === 'embedded') {
    return (
      <div className="space-y-2.5">
        {sampleAttached ? renderYouTubePlayer() : renderPracticePlayer()}
      </div>
    );
  }

  // Full Variant: Used in ExecutionCenter and Knowledge advanced views
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Video className="w-4 h-4 text-[#2959ea]" />
          <h3 className="font-extrabold text-sm text-[#12213b]">
            Học liệu thực hành
          </h3>
        </div>

        {activeEvidence ? (
          <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg flex items-center space-x-1">
            {isSlideOnly ? (
              <>
                <FileText className="w-3.5 h-3.5 text-[#5f708b]" />
                <span>Trang slide {activeEvidence.slide_page ?? 1}</span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-[#5f708b]" />
                <span>{formatSeconds(activeEvidence.start)} — {formatSeconds(activeEvidence.end)}</span>
              </>
            )}
          </span>
        ) : (
          <span className="text-xs text-[#5f708b] bg-slate-50 px-2 py-0.5 rounded-md">
            Chưa chọn đoạn nguồn
          </span>
        )}
      </div>

      {sampleAttached ? renderYouTubePlayer() : renderPracticePlayer()}

      <div className="text-xs text-[#5f708b] px-0.5">
        {sampleAttached ? 'Thời lượng học liệu: 18:29' : `Thời lượng video: ${duration > 0 ? formatSeconds(duration) : '--:--'}`}
      </div>

      {/* Synchronized Quote Box */}
      <div className="bg-[#f6f8fc] border-l-4 border-[#2959ea] rounded-r-xl p-3 text-xs leading-relaxed text-[#12213b] font-medium space-y-1">
        <div className="text-[11px] font-bold text-[#5f708b]">
          {sampleAttached
            ? 'Ghi chú học liệu thực hành'
            : (isSlideOnly ? 'Trích dẫn trang slide' : 'Trích đoạn nguồn bài giảng')}
        </div>
        {activeEvidence?.text ? (
          <div>“{activeEvidence.text}”</div>
        ) : (
          <span className="text-[#5f708b] italic font-normal">
            Chưa chọn bằng chứng cụ thể. Bấm vào khái niệm hoặc liên kết thời gian để xem trích đoạn minh họa.
          </span>
        )}
      </div>

      {/* Footer Info & Provenance */}
      <div className="flex items-center justify-between pt-1 text-xs text-[#5f708b]">
        <span>
          {sampleAttached
            ? 'Nguồn nội dung: ghi chú thủ công theo phụ đề tự động của Abdul Bari; bản demo chưa tự nhận dạng lời nói hoặc phân tích hình ảnh.'
            : 'Ghi chú: Video do giảng viên tải lên.'}
        </span>

        {activeEvidence && !isSlideOnly && typeof activeEvidence.start === 'number' && (
          <button
            type="button"
            onClick={() => seekToEvidence(activeEvidence.start!)}
            className="text-[#2959ea] hover:text-blue-800 font-semibold text-xs flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{sampleAttached && activeEvidence.source_type === 'youtube_caption_annotation' ? 'Mở video tại' : 'Tua đến'} mốc {formatSeconds(activeEvidence.start)}</span>
          </button>
        )}
      </div>
    </div>
  );
};
