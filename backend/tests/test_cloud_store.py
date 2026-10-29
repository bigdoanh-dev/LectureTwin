from types import SimpleNamespace
from urllib.parse import urlsplit
import json
import pytest
from app import store, cloud_store


@pytest.fixture
def private_blob(monkeypatch):
    objects = {}
    def put(path, body, **options):
        assert options['access'] == 'private'
        objects[path] = bytes(body)
    def head(path):
        if path not in objects:
            raise cloud_store.blob.BlobNotFoundError()
        return SimpleNamespace(url='https://demo.private.blob.vercel-storage.com/' + path, etag='revision-1')
    def get(path, **options):
        assert options['access'] == 'private'
        if path.startswith('https:'):
            path = urlsplit(path).path.lstrip('/')
        if path not in objects:
            raise cloud_store.blob.BlobNotFoundError()
        return SimpleNamespace(body=objects[path])
    monkeypatch.setattr(cloud_store.blob, 'put_blob', put)
    monkeypatch.setattr(cloud_store.blob, 'head_blob', head)
    monkeypatch.setattr(cloud_store.blob, 'get_blob', get)
    monkeypatch.setattr(cloud_store.blob, 'delete_blob', lambda path: objects.pop(path, None))
    monkeypatch.setattr(cloud_store.blob, 'query_blobs', lambda prefix, **kwargs: [SimpleNamespace(pathname=path) for path in sorted(objects) if path.startswith(prefix)])
    monkeypatch.setattr(store, 'CLOUD', True)
    return objects


def test_cloud_records_and_sessions_survive_local_database_loss(private_blob, monkeypatch, tmp_path):
    monkeypatch.setattr(store, 'DB_PATH', str(tmp_path / 'never-created.db'))
    store.put('lectures', {'id': 'lesson-a', 'title': 'BFS'}, lecture_id='lesson-a')
    store.put('lectures', {'id': 'lesson-b', 'title': 'DFS'}, lecture_id='lesson-b')
    store.put('lectures', {'id': 'lesson-a', 'title': 'BFS edited'}, lecture_id='lesson-a')
    assert store.get('lectures', 'lesson-a')['title'] == 'BFS edited'
    assert [row['id'] for row in store.items('lectures', 'lesson-b')] == ['lesson-b']
    assert store.get('lectures', 'missing') is None
    store.create_session('hashed-session', 'teacher', '2099-01-01')
    assert store.get_session('hashed-session')['user_id'] == 'teacher'
    store.delete_session('hashed-session')
    assert store.get_session('hashed-session') is None
    assert not (tmp_path / 'never-created.db').exists()
    store.remove('lectures', 'lesson-a')
    assert len(store.items('lectures')) == 1


def test_cloud_media_can_be_restored_after_temporary_file_is_removed(private_blob, tmp_path):
    path = tmp_path / 'asset-123.json'
    path.write_text('{"segments":[]}')
    store.save_media(path)
    path.unlink()
    assert store.restore_media(path)
    assert json.loads(path.read_bytes()) == {'segments': []}


def test_cloud_jobs_finish_inside_request_instead_of_detached_thread(monkeypatch):
    from app import workflows
    calls = []
    monkeypatch.setenv('VERCEL', '1')
    monkeypatch.setattr(workflows, 'execute', calls.append)
    monkeypatch.setattr(workflows.POOL, 'submit', lambda *args: pytest.fail('Cloud task escaped request lifecycle'))
    workflows.schedule('job-123')
    assert calls == ['job-123']
