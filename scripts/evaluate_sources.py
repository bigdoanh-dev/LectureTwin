#!/usr/bin/env python3
"""Run uploaded videos through the real pipeline, leaving academic results unapproved."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import store, workflows, ai_runtime
from app.fixtures import seed, new_lecture


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    if not ai_runtime.enabled():
        raise SystemExit('Bật LECTURE_AI_PROVIDER=ollama trước khi chạy thí nghiệm thật.')
    store.initialize()
    seed()
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for source in json.loads(args.manifest.read_text())[:args.limit]:
        path = Path(source['local_path'])
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        lid = 'source-' + digest[:16]
        lecture = store.get('lectures', lid)
        prior = store.items('jobs', lid)
        if prior and prior[-1]['status'] == 'needs_review':
            job = prior[-1]
        else:
            lecture = new_lecture(lid, 'teacher', 'course-algo', Path(source['name']).stem,
                ['Giải thích các khái niệm và cách sử dụng trong bài giảng Python'], 50)
            target = store.DATA / 'media' / (digest + '.mp4')
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copyfile(path, target)
            lecture.update(sample_attached=False, transcript=[], slides=[], concepts=[], edges=[], evidence=[], findings=[],
                assets=[{'id': 'asset-' + digest[:16], 'kind': 'video', 'name': source['name'],
                    'path': target.name, 'url': f'/api/lectures/{lid}/video', 'status': 'ready', 'source_type': 'user_upload',
                    'duration_seconds': source['seconds'], 'sha256': digest, 'origin_url': source['source_url']}])
            store.put('lectures', lecture)
            started = time.perf_counter()
            print(json.dumps({'event': 'started', 'source': source['name'], 'lecture_id': lid}), flush=True)
            job = workflows.create_job(store.get('users', 'teacher'), lecture, 'analysis', run_async=False)
            print(json.dumps({'event': 'finished', 'source': source['name'], 'status': job['status'],
                'seconds': round(time.perf_counter() - started, 2), 'error': job.get('error')}, ensure_ascii=False), flush=True)
        lecture = store.get('lectures', lid)
        stats = {'lecture_id': lid, 'source_name': source['name'], 'source_sha256': digest,
            'source_duration_seconds': source['seconds'], 'status': job['status'], 'error': job.get('error'),
            'transcript_segments': len(lecture.get('transcript', [])), 'concepts': len(lecture.get('concepts', [])),
            'relations': len(lecture.get('edges', [])), 'evidence': len(lecture.get('evidence', [])),
            'model_calls': sum(a.get('model_calls', 0) for a in job['agents']),
            'processing_ms': round(sum(a.get('duration_ms', 0) for a in job['agents']), 2),
            'asr': lecture.get('media_report', {}).get('asr'), 'extraction': lecture.get('extraction_report'),
            'human_review': 'pending', 'knowledge_precision': None, 'asr_wer': None,
            'limitations': 'Chạy suy luận trên video thật; chưa có transcript chuẩn và nhãn đồ thị do người chuyên môn duyệt để tính WER hoặc Precision/Recall.'}
        (args.output / f'{lid}.json').write_text(json.dumps({'stats': stats, 'lecture': lecture, 'job': job}, ensure_ascii=False, indent=2))
        results.append(stats)
        (args.output / 'source-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
    print(json.dumps({'sources': len(results), 'awaiting_review': sum(r['status'] == 'needs_review' for r in results)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
