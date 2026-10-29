"""Private Blob persistence for the small Vercel research demo.

Records are separate objects so writes to unrelated entities do not replace each
other. This is demo persistence, not a transactional database for a large cohort.
"""
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote
import json
from vercel.blob import sync as blob

PREFIX = 'lecture-twin-ai/records/'


def key(kind, rid):
    return f'{PREFIX}{quote(kind, safe="")}/{quote(rid, safe="")}.json'


def read_path(path):
    try:
        metadata = blob.head_blob(path)
        # Use the latest catalog ETag to avoid reading a cached overwritten object.
        version = quote(metadata.etag, safe='')
        result = blob.get_blob(f'{metadata.url}?v={version}', access='private')
        return json.loads(result.body)
    except blob.BlobNotFoundError:
        return None


def get(kind, rid):
    return read_path(key(kind, rid))


def items(kind, lecture_id=None):
    paths = [entry.pathname for entry in blob.query_blobs(prefix=f'{PREFIX}{quote(kind, safe="")}/', page_size=1000)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        records = [record for record in pool.map(read_path, paths) if record is not None]
    return [record for record in records if lecture_id is None or record.get('lecture_id') == lecture_id]


def put(kind, value):
    blob.put_blob(key(kind, value['id']), json.dumps(value, ensure_ascii=False).encode(),
        access='private', content_type='application/json', allow_overwrite=True, cache_control_max_age=0)
    return value


def remove(kind, rid):
    blob.delete_blob(key(kind, rid))


def save_media(path):
    blob.put_blob(f'lecture-twin-ai/media/{path.name}', path.read_bytes(), access='private', allow_overwrite=False)


def restore_media(path):
    if not path.is_file():
        try:
            data = blob.get_blob(f'lecture-twin-ai/media/{path.name}', access='private')
        except blob.BlobNotFoundError:
            return False
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data.body)
    return True
