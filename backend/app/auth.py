import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Cookie, Header, HTTPException
from . import store

DEMO_MODE = os.environ.get('DEMO_MODE', 'true').lower() == 'true'


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 210000).hex()
    return salt + ':' + digest


def password_valid(password, encoded):
    return hmac.compare_digest(password_hash(password, encoded.split(':')[0]), encoded)


def public_user(user):
    return {k: v for k, v in user.items() if k != 'password_hash'}


def issue(user, response):
    token = secrets.token_urlsafe(36)
    expires = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    store.create_session(hashlib.sha256(token.encode()).hexdigest(), user['id'], expires)
    response.set_cookie('lt_session', token, httponly=True, samesite='lax', max_age=28800, path='/api', secure=bool(os.environ.get('VERCEL')))
    return {'access_token': token, 'user': public_user(user), 'mode': 'DEMO_FALLBACK'}


def current_user(authorization: str | None = Header(default=None), lt_session: str | None = Cookie(default=None)):
    token = authorization[7:] if authorization and authorization.startswith('Bearer ') else lt_session
    if not token:
        raise HTTPException(401, 'Cần đăng nhập để tiếp tục')
    session = store.get_session(hashlib.sha256(token.encode()).hexdigest())
    if not session or session['expires'] < store.now():
        raise HTTPException(401, 'Phiên đăng nhập đã hết hạn')
    user = store.get('users', session['user_id'])
    if not user or not user['is_active']:
        raise HTTPException(401, 'Tài khoản đã bị vô hiệu hóa')
    return user


def require_role(user, *roles):
    if user['role'] not in roles:
        raise HTTPException(403, 'Vai trò không có quyền thực hiện thao tác này')


def lecture_access(user, lecture_id, edit=False):
    lecture = store.get('lectures', lecture_id)
    if not lecture:
        raise HTTPException(404, 'Không tìm thấy bài giảng')
    if edit:
        require_role(user, 'teacher')
        if lecture['owner_id'] != user['id'] or lecture['course_id'] not in user['course_ids']:
            raise HTTPException(403, 'Chỉ giảng viên phụ trách được sửa bài giảng')
    elif user['role'] == 'teacher' and lecture['owner_id'] != user['id']:
        raise HTTPException(403, 'Bài giảng thuộc giảng viên khác')
    elif user['role'] == 'student' and (lecture['course_id'] not in user['course_ids'] or not lecture.get('published_version')):
        raise HTTPException(403, 'Bài giảng chưa được giao hoặc chưa xuất bản')
    return lecture
