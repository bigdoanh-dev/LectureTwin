from contextlib import contextmanager
import pytest
from filelock import FileLock
from app import ai_runtime, store, knowledge_ai


def test_waiting_for_local_inference_has_a_bounded_timeout(monkeypatch, tmp_path):
    monkeypatch.setattr(store, 'DATA', tmp_path)
    monkeypatch.setenv('LECTURE_MODEL_QUEUE_TIMEOUT', '0')
    with FileLock(str(tmp_path / 'local-inference.lock')):
        with pytest.raises(ai_runtime.ProviderUnavailable, match='Hàng đợi'):
            with ai_runtime.model_slot():
                pytest.fail('Must not enter an occupied model slot')
    # A timed-out waiter must release its thread lock and permit the next job.
    with ai_runtime.model_slot():
        pass


def test_cancelling_a_waiter_does_not_leave_inference_locked(monkeypatch, tmp_path):
    monkeypatch.setattr(store, 'DATA', tmp_path)
    class StopRequested(Exception):
        pass
    def stop():
        raise StopRequested()
    with ai_runtime.track_usage(stop):
        with pytest.raises(StopRequested):
            with ai_runtime.model_slot():
                pytest.fail('Cancelled work must not acquire the model')
    with ai_runtime.model_slot():
        pass


def test_queue_failure_does_not_count_an_unmade_model_request(monkeypatch):
    monkeypatch.setenv('LECTURE_AI_PROVIDER', 'ollama')
    @contextmanager
    def unavailable():
        raise ai_runtime.ProviderUnavailable('Hàng đợi quá thời gian')
        yield
    monkeypatch.setattr(ai_runtime, 'model_slot', unavailable)
    with ai_runtime.track_usage() as usage:
        with pytest.raises(ai_runtime.ProviderUnavailable):
            ai_runtime.generate(knowledge_ai.GraphBatch, 'test', {'sources': []})
    assert len(usage) == 1 and not usage[0]['model_call'] and usage[0]['tokens'] is None


def test_separate_verifier_does_not_silently_fall_back(monkeypatch):
    monkeypatch.setenv('LECTURE_VERIFIER_MODEL', 'checker-test')
    calls = []
    def fail(schema, task, data, **kwargs):
        calls.append(kwargs.get('model'))
        raise ai_runtime.ProviderUnavailable('Missing checker')
    monkeypatch.setattr(ai_runtime, 'generate', fail)
    with pytest.raises(ai_runtime.ProviderUnavailable):
        ai_runtime.generate_verification(knowledge_ai.AnswerCheck, 'verify', {})
    assert calls == ['checker-test']
    config = ai_runtime.configuration()
    assert config['coordination_mode'] == 'orchestrated_pipeline'


def test_llm_telemetry_uses_output_eval_time_for_token_rate(monkeypatch):
    monkeypatch.setenv('LECTURE_AI_PROVIDER', 'ollama')
    @contextmanager
    def slot():
        yield
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {'message': {'content': '{"concepts":[],"relations":[]}'},
                    'prompt_eval_count': 100, 'eval_count': 20, 'eval_duration': 2_000_000_000,
                    'load_duration': 500_000_000}
    class Client:
        def __init__(self, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, *args, **kwargs): return Response()
    monkeypatch.setattr(ai_runtime, 'model_slot', slot)
    monkeypatch.setattr(ai_runtime.httpx, 'Client', Client)
    with ai_runtime.track_usage() as usage:
        ai_runtime.generate(knowledge_ai.GraphBatch, 'test', {})
    assert usage[0]['prompt_tokens'] == 100 and usage[0]['output_tokens'] == 20
    assert usage[0]['tokens_per_second'] == 10
    assert usage[0]['load_duration_ns'] == 500_000_000
