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
  sampleAttached = true,
  onTimeUpdate,
  onPause,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [hasVideoError, setHasVideoError] = useState<boolean>(false);
  const [retryKey, setRetryKey] = useState<number>(0);

  // Reset video state when lecture changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setHasVideoError(false);
    pendingSeekRef.current = null;
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [lectureId]);

  // Handle external seek target
  useEffect(() => {
    if (seekTarget !== undefined && seekTarget !== null) {
      if (videoRef.current && videoRef.current.readyState >= 1) {
        try {
          videoRef.current.currentTime = seekTarget;
          setCurrentTime(seekTarget);
          if (onClearSeekTarget) onClearSeekTarget();
        } catch (err) {
          console.warn('Seek error:', err);
        }
      } else {
        pendingSeekRef.current = seekTarget;
      }
    }
  }, [seekTarget, onClearSeekTarget]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    setDuration(vid.duration);
    if (pendingSeekRef.current !== null) {
      try {
        vid.currentTime = pendingSeekRef.current;
        setCurrentTime(pendingSeekRef.current);
        if (onClearSeekTarget) onClearSeekTarget();
      } catch (err) {
        console.warn('Pending seek error:', err);
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

  const activeEvidence = selectedEvidence || defaultEvidence;
  const isSlideOnly = activeEvidence?.kind === 'slide';

  const formatSeconds = (sec: number | undefined | null) => {
    if (sec === undefined || sec === null || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const seekToEvidence = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const videoSrc = `/api/lectures/${lectureId}/video`;

  // Embedded Variant: Native video + error fallback only (NO outer duplicate cards or duplicate quote boxes)
  if (variant === 'embedded') {
    return (
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
                Video bài giảng hiện không khả dụng
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
    );
  }

  // Full Variant: Used in ExecutionCenter and Knowledge advanced views
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Video className="w-4 h-4 text-[#2959ea]" />
          <h3 className="font-extrabold text-sm text-[#12213b]">
            Bằng chứng đang xem
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
            Chưa chọn bằng chứng
          </span>
        )}
      </div>

      {/* Video Container: Native Video Controls */}
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
                Video bài giảng hiện không khả dụng
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

      {/* Video metadata distinction */}
      <div className="flex items-center justify-between text-xs text-[#5f708b] px-0.5">
        <span>Trích đoạn video thực tế: {formatSeconds(duration || 50)}</span>
        <span>Kế hoạch bài giảng: 50 phút</span>
      </div>

      {/* Synchronized Quote Box */}
      <div className="bg-[#f6f8fc] border-l-4 border-[#2959ea] rounded-r-xl p-3 text-xs leading-relaxed text-[#12213b] font-medium">
        {activeEvidence?.text ? (
          <>“{activeEvidence.text}”</>
        ) : (
          <span className="text-[#5f708b] italic font-normal">
            Chưa chọn bằng chứng cụ thể. Bấm vào khái niệm, liên kết đồ thị hoặc đoạn bóc tách để xem bằng chứng đồng bộ.
          </span>
        )}
      </div>

      {/* Footer Info & Provenance */}
      <div className="flex items-center justify-between pt-1 text-xs text-[#5f708b]">
        <span className="text-xs text-[#5f708b]">
          {activeEvidence?.source_type === 'prepared_demo_annotation'
            ? 'Nguồn: Chú giải chuẩn bị sẵn (Prepared, không qua ASR)'
            : (activeEvidence?.source_type || 'Nguồn: Bài giảng')}
        </span>

        {activeEvidence && !isSlideOnly && typeof activeEvidence.start === 'number' && (
          <button
            type="button"
            onClick={() => seekToEvidence(activeEvidence.start!)}
            className="text-[#2959ea] hover:text-blue-800 font-semibold text-xs flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Tua đến mốc này ({formatSeconds(activeEvidence.start)})</span>
          </button>
        )}
      </div>
    </div>
  );
};
