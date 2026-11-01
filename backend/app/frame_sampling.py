"""Bounded scene-change keyframes with playback-relative FFmpeg timestamps."""
import re
import subprocess
from pathlib import Path


def scene_keyframes(path: Path, folder: Path, version: int, limit: int = 24, max_gap_seconds: float = 15):
    if not 1 <= limit <= 120:
        raise ValueError('Keyframe limit must be between 1 and 120')
    if max_gap_seconds <= 0:
        raise ValueError('Maximum keyframe gap must be positive')
    folder.mkdir(parents=True, exist_ok=True)
    prefix = f'v{version}-scene-'
    # Include the first decoded frame so static slides still have visual evidence.
    # showinfo is after select: its n matches the emitted image sequence exactly.
    pattern = folder / (prefix + '%04d.jpg')
    result = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'info', '-y', '-i', str(path),
        '-an', '-vf', f"setpts=PTS-STARTPTS,select='eq(n,0)+gt(scene,0.18)+gte(t-prev_selected_t,{max_gap_seconds})',scale=640:-2,showinfo",
        '-fps_mode', 'vfr', '-frames:v', str(limit), '-start_number', '0', str(pattern)],
        capture_output=True, text=True, timeout=180, check=True)
    timestamps = {int(n): float(pts) for n, pts in re.findall(
        r'\bn:\s*(\d+)\s+pts:.*?\bpts_time:([-+\d.eE]+)', result.stderr)}
    frames = []
    for index in range(limit):
        output = folder / f'{prefix}{index:04d}.jpg'
        if index in timestamps and output.exists():
            frames.append({'timestamp': round(timestamps[index], 3), 'file': output.name})
    if not frames:
        raise ValueError('FFmpeg không trả khung hình có mốc thời gian hợp lệ.')
    return frames, {'method': 'scene_change_with_max_gap', 'scene_threshold': 0.18, 'max_gap_seconds': max_gap_seconds, 'max_frames': limit,
        'limit_reached': len(frames) == limit, 'first_frame_included': True,
        'note': 'Chọn khung đầu, cảnh thay đổi và mốc dự phòng khi khoảng cách quá dài; giới hạn số khung có thể bỏ sót phần sau. Không chứng nhận đã đọc toàn bộ video.'}
