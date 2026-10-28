import os
import tempfile
from pathlib import Path
import pytest

TEMP = tempfile.TemporaryDirectory(prefix='lecturetwin-tests-')
os.environ['LECTURE_DB'] = str(Path(TEMP.name) / 'test.db')
# Keep generated media in the normal ignored media location, while DB is disposable.
from app.main import app
from app import store, workflows
ORIGINAL_PROBE = workflows.media_probe
from app.fixtures import seed
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    store.initialize()
    with store.connect() as conn:
        conn.execute('DELETE FROM records')
        conn.execute('DELETE FROM sessions')
    monkeypatch.setattr(workflows, 'schedule', lambda jid: workflows.execute(jid))
    monkeypatch.setattr(workflows, 'media_probe', lambda lecture: {'duration_seconds': 50, 'keyframes': [], 'asr': 'unavailable', 'vision': 'unavailable'})
    with TestClient(app) as client:
        yield client


def login(client, role='teacher'):
    response = client.post('/api/auth/login', json={'username': role, 'password': 'demo123'})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['access_token']}
