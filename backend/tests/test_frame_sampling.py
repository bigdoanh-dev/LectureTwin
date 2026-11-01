from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from types import SimpleNamespace
import shutil
import subprocess

import pytest

from app import frame_sampling, perception_ai, workflows


def test_one_ffmpeg_call_preserves_selected_pts(monkeypatch, tmp_path):
    calls = []
    def run(command, **kwargs):
        calls.append(command)
        for n in range(2):
            (tmp_path / f'v2-scene-{n:04d}.jpg').write_bytes(b'image')
        return SimpleNamespace(stderr='[Parsed_showinfo_3] n: 0 pts: 0 pts_time:0\n'
            '[Parsed_showinfo_3] n: 1 pts: 31744 pts_time:3.1744\n')
    monkeypatch.setattr(frame_sampling.subprocess, 'run', run)
    frames, report = frame_sampling.scene_keyframes(Path('lecture.mp4'), tmp_path, 2, limit=2)
    assert len(calls) == 1 and 'gt(scene,0.18)' in calls[0][calls[0].index('-vf') + 1]
    assert [f['timestamp'] for f in frames] == [0, 3.174]
    assert report['limit_reached'] and report['first_frame_included']


def test_no_invented_timestamp_when_ffmpeg_lacks_showinfo(monkeypatch, tmp_path):
    monkeypatch.setattr(frame_sampling.subprocess, 'run', lambda *a, **k: SimpleNamespace(stderr=''))
    with pytest.raises(ValueError, match='mốc thời gian'):
        frame_sampling.scene_keyframes(Path('lecture.mp4'), tmp_path, 1)


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg unavailable')
def test_static_video_retains_first_frame_without_duplicate_samples(tmp_path):
    path = tmp_path / 'static.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
        '-i', 'color=c=blue:s=160x90:r=5:d=2', '-c:v', 'libx264', str(path)], check=True)
    frames, report = frame_sampling.scene_keyframes(path, tmp_path / 'frames', 1)
    assert len(frames) == 1 and frames[0]['timestamp'] == 0
    assert not report['limit_reached']


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg unavailable')
def test_scene_transition_has_real_playback_timestamp(tmp_path):
    path = tmp_path / 'transition.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=5:d=1',
        '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=5:d=1',
        '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]',
        '-c:v', 'libx264', str(path)], check=True)
    frames, _ = frame_sampling.scene_keyframes(path, tmp_path / 'frames', 1)
    assert [f['timestamp'] for f in frames] == [0, 1]


def test_ocr_dedup_retains_changed_number_and_counts_document_pages(monkeypatch):
    monkeypatch.setattr(perception_ai.ai_runtime, 'enabled', lambda: True)
    monkeypatch.setattr(perception_ai.ai_runtime, 'checkpoint', lambda: None)
    texts = iter(['result = 10', 'result = 10', 'result = 20'])
    monkeypatch.setattr(perception_ai.ai_runtime, 'read_image', lambda _: next(texts))
    lecture = {'id': 'frames-test', 'version': 1, 'assets': [{'id': 'video', 'kind': 'video'}],
        'transcript': [], 'slides': [{'page': 1, 'text': 'Document page', 'source_type': 'document_parser'},
                                   {'page': 99, 'text': 'stale', 'source_type': 'sampled_frame_ocr'}]}
    report = {'keyframes': [{'timestamp': i, 'file': str(i) + '.jpg'} for i in range(3)]}
    result = perception_ai.read_sources(lecture, report)
    assert result['slide_pages'] == 1 and result['sampled_frames'] == 3
    assert result['sampled_ocr_frames'] == 2 and result['duplicate_ocr_frames'] == 1
    assert [p['text'] for p in lecture['slides']] == ['Document page', 'result = 10', 'result = 20']


def test_interactive_pool_progresses_when_analysis_workers_occupied(monkeypatch):
    monkeypatch.delenv('VERCEL', raising=False)
    analysis = ThreadPoolExecutor(max_workers=2)
    interactive = ThreadPoolExecutor(max_workers=1)
    release, started, responded = Event(), Event(), Event()
    ids = ['sampling-analysis-1', 'sampling-analysis-2', 'sampling-tutor']
    def execute(jid):
        if jid == ids[-1]:
            responded.set()
        else:
            started.set()
            release.wait(2)
    monkeypatch.setattr(workflows, 'ANALYSIS_POOL', analysis)
    monkeypatch.setattr(workflows, 'INTERACTIVE_POOL', interactive)
    monkeypatch.setattr(workflows, 'execute', execute)
    monkeypatch.setattr(workflows.store, 'get', lambda table, jid: {'workflow': 'tutor' if jid == ids[-1] else 'analysis'})
    try:
        for jid in ids[:2]: workflows.schedule(jid)
        assert started.wait(1)
        workflows.schedule(ids[-1])
        assert responded.wait(1), 'Tutor was blocked behind video analysis'
    finally:
        release.set()
        analysis.shutdown(wait=True)
        interactive.shutdown(wait=True)
        workflows.SCHEDULED.difference_update(ids)


def test_ocr_dedup_keeps_changed_code_operators_and_negation():
    padding = ' '.join(f'word{i}' for i in range(100))
    assert not perception_ai.repeated_ocr_text(padding + ' x < y', padding + ' x > y')
    assert not perception_ai.repeated_ocr_text(padding + ' is valid', padding + ' is not valid')


@pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg unavailable')
def test_static_scene_has_bounded_gap_fallback(tmp_path):
    path = tmp_path / 'long-static.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
        '-i', 'color=c=blue:s=160x90:r=5:d=7', '-c:v', 'libx264', str(path)], check=True)
    frames, report = frame_sampling.scene_keyframes(path, tmp_path / 'frames', 1, max_gap_seconds=2)
    assert [f['timestamp'] for f in frames] == [0, 2, 4, 6]
    assert report['max_gap_seconds'] == 2
