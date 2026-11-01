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
