import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('LECTURE_DATA_DIR', ROOT / 'data'))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = os.environ.get('LECTURE_DB', str(DATA / 'lecturetwin.db'))
LOCK = threading.RLock()


def now():
    return datetime.now(timezone.utc).isoformat()


def uid(prefix):
    return f'{prefix}-{uuid.uuid4().hex[:12]}'


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def initialize():
    with LOCK, connect() as conn:
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS records (
          kind TEXT NOT NULL, id TEXT NOT NULL, owner_id TEXT, lecture_id TEXT,
          body TEXT NOT NULL, PRIMARY KEY(kind,id));
        CREATE INDEX IF NOT EXISTS records_lecture ON records(kind,lecture_id);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires TEXT);
        ''')


def get(kind, rid):
    with connect() as conn:
        row = conn.execute('SELECT body FROM records WHERE kind=? AND id=?', (kind, rid)).fetchone()
    return json.loads(row['body']) if row else None


def items(kind, lecture_id=None):
    with connect() as conn:
        if lecture_id is not None:
            rows = conn.execute('SELECT body FROM records WHERE kind=? AND lecture_id=? ORDER BY rowid', (kind, lecture_id)).fetchall()
        else:
            rows = conn.execute('SELECT body FROM records WHERE kind=? ORDER BY rowid', (kind,)).fetchall()
    return [json.loads(r['body']) for r in rows]


def put(kind, value, lecture_id=None, owner_id=None):
    with LOCK, connect() as conn:
        conn.execute('INSERT INTO records(kind,id,owner_id,lecture_id,body) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,owner_id=excluded.owner_id,lecture_id=excluded.lecture_id',
            (kind, value['id'], owner_id or value.get('owner_id'), lecture_id or value.get('lecture_id'), json.dumps(value, ensure_ascii=False)))
    return value


def remove(kind, rid):
    with LOCK, connect() as conn:
        conn.execute('DELETE FROM records WHERE kind=? AND id=?', (kind, rid))


def audit(user, action, detail, lecture_id=None):
    return put('audit', {'id': uid('audit'), 'actor_id': user['id'], 'actor_role': user['role'], 'action': action,
        'detail': detail, 'lecture_id': lecture_id, 'created_at': now()})
