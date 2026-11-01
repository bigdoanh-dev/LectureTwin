import importlib.util
import json
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts' / 'benchmark_ai.py'
spec = importlib.util.spec_from_file_location('benchmark_ai', SCRIPT)
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


def artifact(tmp_path, usage):
    path = tmp_path / 'source-fixture.json'
    path.write_text(json.dumps({'stats': {'lecture_id': 'fixture', 'source_duration_seconds': 10},
        'job': {'status': 'needs_review', 'agents': [{'duration_ms': 2200, 'model_usage': usage,
            'tools': [{'name': 'transcribe_audio', 'duration_ms': 2000}]}]}}))
    return path


def test_generation_throughput_never_uses_combined_prompt_and_output_tokens(tmp_path):
    path = artifact(tmp_path, [{'kind': 'llm', 'model': 'fixture', 'status': 'completed',
        'duration_ms': 4000, 'tokens': 100000, 'prompt_tokens': 99950, 'output_tokens': 50, 'eval_duration_ns': 2_000_000_000}])
    report = benchmark.summarize_artifacts([path])
    measured = report['inference_timings'][0]
    assert measured['generation_tokens_per_second'] == 25
    assert measured['generation_tps_measured_calls'] == 1
    assert measured['total_ms'] == 4000
    assert report['tool_wall_timings']['transcribe_audio']['total_ms'] == 2000


def test_legacy_usage_cannot_claim_generation_throughput_or_asr_inference(tmp_path):
    path = artifact(tmp_path, [
        {'kind': 'llm', 'model': 'fixture', 'status': 'completed', 'duration_ms': 100, 'tokens': 600},
        {'kind': 'asr_cache', 'model': 'fixture', 'status': 'completed', 'duration_ms': 10, 'model_call': False}])
    report = benchmark.summarize_artifacts([path])
    assert all(row['generation_tokens_per_second'] is None for row in report['inference_timings'])
    cache = next(row for row in report['inference_timings'] if row['kind'] == 'asr_cache')
    assert not cache['actual_model_call']
    assert report['sources'][0]['asr_wall_real_time_factor_including_queue'] is None


def test_actual_asr_wall_real_time_factor_and_missing_telemetry(tmp_path):
    path = artifact(tmp_path, [{'kind': 'asr', 'model': 'fixture', 'status': 'completed', 'duration_ms': 2000}])
    report = benchmark.summarize_artifacts([path])
    assert report['sources'][0]['asr_wall_real_time_factor_including_queue'] == .2
    index = tmp_path / 'index.json'
    index.write_text('[]')
    assert benchmark.summarize_artifacts([index])['unusable_artifacts']


def test_resource_summary_labels_observed_max_and_does_not_invent_gpu_utilization():
    samples = [{'process_tree_rss_bytes': 100, 'ollama_models': [{'size': 500, 'size_vram': 200}]},
               {'process_tree_rss_bytes': 120, 'ollama_models': [], 'ollama_error': 'ConnectError'}]
    report = benchmark.resource_summary(samples, 'Current snapshots only', 1)
    assert report['observed_max_process_tree_rss_bytes'] == 120
    assert report['observed_max_ollama_reported_size_vram_bytes'] == 200
    assert 'not true peak' in report['note'] and 'cannot describe past runs' in report['note']
    assert not any('utilization_percent' in key for key in report)


def test_missing_measurements_remain_null_and_ps_is_not_api_inference_latency():
    assert benchmark.distribution([])['total_ms'] is None
    assert benchmark.process_tree_rss(None) is None
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'models': [{'name': 'model', 'size': 1000, 'size_vram': 2000}]}
    class Client:
        def get(self, url):
            assert url == 'http://localhost:11434/api/ps'
            return Response()
    sample = benchmark.resource_snapshot(Client(), 'http://localhost:11434/')
    assert sample['ollama_models'][0]['size_vram'] == 2000
    assert sample['process_tree_rss_bytes'] is None
