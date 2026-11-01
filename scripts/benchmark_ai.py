#!/usr/bin/env python3
"""Summarize actual AI telemetry or measure an isolated source pipeline run.

Examples (run with backend/.venv/bin/python):
  scripts/benchmark_ai.py --artifact private/source-123.json --output private/ai-summary.json
  scripts/benchmark_ai.py --manifest private/manifest.json --limit 1 \
      --work-dir private/fresh-benchmark --output private/ai-benchmark.json

No HTTP read-endpoint timings are used as inference measurements. Resource samples
are observed snapshots, never retrospective GPU/RAM peaks for saved artifacts.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import time

import httpx


def distribution(values):
    values = sorted(float(value) for value in values if isinstance(value, (int, float)) and math.isfinite(value) and value >= 0)
    if not values:
        return {'samples': 0, 'total_ms': None, 'p50_ms': None, 'p95_ms': None, 'max_ms': None}
    return {'samples': len(values), 'total_ms': round(sum(values), 3),
        'p50_ms': round(statistics.median(values), 3),
        'p95_ms': round(values[math.ceil(.95 * len(values)) - 1], 3), 'max_ms': round(values[-1], 3)}


def summarize_artifacts(paths):
    events, tools, sources, missing = [], defaultdict(list), [], []
    for path in paths:
        artifact = json.loads(Path(path).read_text())
        if not isinstance(artifact, dict) or not isinstance(artifact.get('job'), dict):
            missing.append({'artifact': Path(path).name, 'reason': 'No saved job agents/model_usage; aggregate source-results index is insufficient.'})
            continue
        stats, job = artifact.get('stats', {}), artifact['job']
        agents = job.get('agents', [])
        for agent in agents:
            events.extend(agent.get('model_usage', []))
            for tool in agent.get('tools', []):
                if isinstance(tool.get('duration_ms'), (float, int)):
                    tools[tool['name']].append(tool['duration_ms'])
        asr_ms = sum(e.get('duration_ms', 0) for a in agents for e in a.get('model_usage', [])
            if e.get('kind') == 'asr' and e.get('status') == 'completed' and e.get('model_call', True))
        duration = stats.get('source_duration_seconds')
        media = artifact.get('lecture', {}).get('media_report', {})
        sources.append({'lecture_id': stats.get('lecture_id', job.get('lecture_id')), 'status': job.get('status'),
            'source_duration_seconds': duration,
            'transcript_segments': stats.get('transcript_segments'), 'concepts': stats.get('concepts'),
            'relations': stats.get('relations'), 'evidence': stats.get('evidence'),
            'sampled_frames': media.get('sampled_frames'), 'sampled_ocr_frames': media.get('sampled_ocr_frames'),
            'agent_duration_sum_ms': round(sum(a.get('duration_ms', 0) for a in agents), 3),
            'asr_wall_real_time_factor_including_queue': round(asr_ms / (duration * 1000), 5) if duration and asr_ms else None})
    groups = defaultdict(list)
    for event in events:
        key = (event.get('kind', 'unknown'), event.get('model', 'unknown'), event.get('status', 'unknown'), bool(event.get('model_call', True)))
        groups[key].append(event)
    timings = []
    for (kind, model, status, model_call), rows in sorted(groups.items()):
        measured = [e for e in rows if kind == 'llm' and status == 'completed' and model_call
            and isinstance(e.get('output_tokens'), (int, float)) and isinstance(e.get('eval_duration_ns'), (int, float))
            and e['output_tokens'] > 0 and e['eval_duration_ns'] > 0]
        seconds = sum(e['eval_duration_ns'] for e in measured) / 1e9
        timings.append({'kind': kind, 'model': model, 'status': status, 'actual_model_call': model_call,
            **distribution([e.get('duration_ms') for e in rows]),
            'generation_tps_measured_calls': len(measured),
            'generation_tokens_per_second': round(sum(e['output_tokens'] for e in measured) / seconds, 3) if seconds else None,
            'load_duration_ms': distribution([e['load_duration_ns'] / 1e6 for e in rows if isinstance(e.get('load_duration_ns'), (int, float))]),
            'note': 'Wall duration includes model queue and HTTP/adapter overhead. Generation throughput uses output tokens / eval duration only; missing provider fields remain unavailable.'})
    return {'artifacts': len(paths), 'sources': sources, 'inference_timings': timings,
        'tool_wall_timings': {name: distribution(values) for name, values in sorted(tools.items())}, 'unusable_artifacts': missing,
        'limitations': ['Saved telemetry is measured inference/tool wall time, not API read latency.',
            'Cache events are listed separately and are not fresh ASR/embedding inference.',
            'Agent duration sums are not an independently measured end-to-end wall duration.',
            'Absent output-token/eval-duration fields cannot support LLM generation tokens/second.']}


def hardware_context():
    physical = None
    processor = platform.processor() or None
    try:
        physical = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], stderr=subprocess.DEVNULL, timeout=2)) if platform.system() == 'Darwin' else os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    if platform.system() == 'Darwin':
        try:
            processor = subprocess.check_output(['sysctl', '-n', 'machdep.cpu.brand_string'], text=True, stderr=subprocess.DEVNULL, timeout=2).strip()
        except (OSError, subprocess.SubprocessError):
            pass
    return {'os': platform.system(), 'os_release': platform.release(), 'architecture': platform.machine(), 'processor': processor,
        'logical_cpus': os.cpu_count(), 'physical_memory_bytes': physical,
        'gpu_utilization_percent': None, 'gpu_note': 'GPU utilization is not measured. Apple Silicon uses unified memory; Ollama size_vram is provider-reported residency, not dedicated VRAM or a hardware peak.'}


def process_tree_rss(root_pid):
    if not root_pid:
        return None
    try:
        rows = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss='], text=True, timeout=2)
        entries = [tuple(map(int, row.split())) for row in rows.splitlines() if len(row.split()) == 3]
        selected = {int(root_pid)}
        while True:
            expanded = selected | {pid for pid, ppid, _ in entries if ppid in selected}
            if expanded == selected:
                break
            selected = expanded
        return sum(rss * 1024 for pid, _, rss in entries if pid in selected) or None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def resource_snapshot(client, ollama_url, pid=None):
    result = {'sampled_at': datetime.now(timezone.utc).isoformat(), 'process_tree_rss_bytes': process_tree_rss(pid), 'ollama_models': []}
    try:
        response = client.get(ollama_url.rstrip('/') + '/api/ps')
        response.raise_for_status()
        result['ollama_models'] = [{key: model.get(key) for key in ('model', 'name', 'size', 'size_vram', 'expires_at')}
            for model in response.json().get('models', [])]
    except (httpx.HTTPError, ValueError, KeyError) as error:
        result['ollama_error'] = type(error).__name__
    return result


def resource_summary(samples, scope, interval):
    rss = [sample['process_tree_rss_bytes'] for sample in samples if sample.get('process_tree_rss_bytes') is not None]
    resident = [sum(m.get('size_vram') or 0 for m in s.get('ollama_models', [])) for s in samples if not s.get('ollama_error')]
    return {'scope': scope, 'requested_sample_interval_seconds': interval, 'samples': samples,
        'observed_max_process_tree_rss_bytes': max(rss) if rss else None,
        'observed_max_ollama_reported_size_vram_bytes': max(resident) if resident else None,
        'note': 'Periodic observed maximum, not true peak. RSS sums may double-count shared pages; Ollama runs outside the measured pipeline process tree. /api/ps size and size_vram are model residency reports, not GPU utilization. Artifact-only sampling is current state and cannot describe past runs.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact', action='append', type=Path, default=[])
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--work-dir', type=Path, help='A new empty directory; isolates DB, media and caches from the live application.')
    parser.add_argument('--limit', type=int, default=1)
    parser.add_argument('--interval', type=float, default=1)
    parser.add_argument('--sample-seconds', type=float, default=0, help='Current-state resource sampling for artifact-only mode.')
    parser.add_argument('--max-seconds', type=float, default=1800, help='Maximum supervised source-pipeline wall seconds.')
    parser.add_argument('--pid', type=int, help='Optional local process tree to sample in artifact-only mode.')
    parser.add_argument('--ollama-url', default=os.environ.get('LECTURE_OLLAMA_URL', 'http://127.0.0.1:11434'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not .25 <= args.interval <= 60 or not 0 <= args.sample_seconds <= 3600 or not 1 <= args.limit <= 100:
        parser.error('interval .25..60, sample-seconds 0..3600, limit 1..100 required')
    if not 30 <= args.max_seconds <= 7200:
        parser.error('max-seconds must be in 30..7200')
    if not args.artifact and not args.manifest:
        parser.error('Provide --artifact or --manifest')
    samples, wall, returncode = [], None, None
    with httpx.Client(timeout=2) as client:
        samples.append(resource_snapshot(client, args.ollama_url, args.pid))
        if args.manifest:
            if not args.work_dir:
                parser.error('--manifest requires --work-dir with a new path')
            args.work_dir.mkdir(parents=True, exist_ok=False)
            data_dir = args.work_dir.resolve() / 'data'
            artifacts = args.work_dir.resolve() / 'source-results'
            env = {**os.environ, 'LECTURE_DATA_DIR': str(data_dir), 'LECTURE_DB': str(data_dir / 'benchmark.db'),
                'LECTURE_AI_PROVIDER': 'ollama', 'LECTURE_OLLAMA_URL': args.ollama_url, 'LECTURE_STORAGE': 'sqlite'}
            env.pop('VERCEL', None)
            command = [sys.executable, str(Path(__file__).with_name('evaluate_sources.py')), str(args.manifest.resolve()),
                '--output', str(artifacts), '--limit', str(args.limit)]
            started = time.perf_counter()
            with (args.work_dir / 'pipeline.log').open('w') as log:
                process = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT)
                while True:
                    samples.append(resource_snapshot(client, args.ollama_url, process.pid))
                    if time.perf_counter() - started >= args.max_seconds:
                        process.terminate()
                        try:
                            returncode = process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            returncode = process.wait()
                        break
                    try:
                        returncode = process.wait(timeout=args.interval)
                        break
                    except subprocess.TimeoutExpired:
                        pass
            wall = round(time.perf_counter() - started, 3)
            args.artifact.extend(path for path in sorted(artifacts.glob('source-*.json')) if path.name != 'source-results.json')
            samples.append(resource_snapshot(client, args.ollama_url))
        else:
            until = time.monotonic() + args.sample_seconds
            while time.monotonic() < until:
                time.sleep(min(args.interval, max(0, until - time.monotonic())))
                samples.append(resource_snapshot(client, args.ollama_url, args.pid))
    scope = 'During newly executed isolated source pipeline' if args.manifest else 'Current snapshots only; not resources used by historical artifact runs'
    telemetry = summarize_artifacts(args.artifact)
    job_failures = sum(source['status'] in ('failed', 'cancelled') for source in telemetry['sources'])
    report = {'created_at': datetime.now(timezone.utc).isoformat(), 'hardware': hardware_context(),
        'isolated_pipeline_wall_seconds': wall, 'pipeline_exit_code': returncode,
        'pipeline_job_failures': job_failures,
        'pipeline_wall_scope': 'Supervisor elapsed time from process launch to observed exit, including resource-sampling overhead and exit-detection delay; per-call telemetry supplies finer inference durations.',
        'cache_scope': 'New work directory isolates DB, ASR cache and embedding cache. Installed model weights remain shared; Ollama residency is sampled rather than forced cold.' if args.manifest else 'Historical artifact cache state is described by its saved telemetry; current resource samples cannot reconstruct it.',
        'telemetry': telemetry, 'resources': resource_summary(samples, scope, args.interval)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'output': str(args.output), 'artifacts': len(args.artifact), 'pipeline_exit_code': returncode,
        'pipeline_wall_seconds': wall, 'pipeline_job_failures': job_failures, 'resource_samples': len(samples)}, ensure_ascii=False))
    if returncode or (args.manifest and job_failures):
        raise SystemExit(returncode or 1)


if __name__ == '__main__':
    main()
