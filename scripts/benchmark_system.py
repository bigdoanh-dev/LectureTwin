#!/usr/bin/env python3
"""Measure local authenticated read endpoints; never report these as AI inference latency."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import statistics
import time
import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8001')
    parser.add_argument('--requests', type=int, default=40)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.requests <= 1000 or not 1 <= args.workers <= 16:
        raise SystemExit('Số yêu cầu phải trong 1-1000 và số luồng trong 1-16.')
    with httpx.Client(base_url=args.url, timeout=30) as client:
        login = client.post('/api/auth/login', json={'username': os.environ.get('LECTURE_BENCH_USER', 'teacher'),
            'password': os.environ.get('LECTURE_BENCH_PASSWORD', 'demo123')})
        login.raise_for_status()
        client.headers['Authorization'] = 'Bearer ' + login.json()['access_token']
        bootstrap = client.get('/api/bootstrap').json()
        lecture_id = (os.environ.get('LECTURE_BENCH_LECTURE_ID')
                      or (bootstrap['lectures'][-1]['id'] if bootstrap['lectures'] else None))
        paths = ['/api/health', '/api/bootstrap'] + ([f'/api/lectures/{lecture_id}/graph'] if lecture_id else [])
        results = []
        for path in paths:
            def request(_):
                started = time.perf_counter()
                try:
                    response = client.get(path)
                    return response.status_code, (time.perf_counter() - started) * 1000
                except httpx.HTTPError:
                    return 0, (time.perf_counter() - started) * 1000
            started = time.perf_counter()
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                rows = list(pool.map(request, range(args.requests)))
            durations = sorted(row[1] for row in rows)
            results.append({'endpoint': path, 'requests': len(rows), 'workers': args.workers,
                'successes': sum(code == 200 for code, _ in rows),
                'failures': sum(code != 200 for code, _ in rows),
                'p50_ms': round(statistics.median(durations), 3),
                'p95_ms': round(durations[math.ceil(.95 * len(durations)) - 1], 3),
                'max_ms': round(max(durations), 3), 'wall_seconds': round(time.perf_counter() - started, 3)})
        client.post('/api/auth/logout').raise_for_status()
    report = {'target': args.url, 'results': results,
        'scope': 'Authenticated read endpoints on one local machine; not ASR/LLM latency or production capacity.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
