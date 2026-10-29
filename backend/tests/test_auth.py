from app import main


def test_credentials_logout_and_role_access(client, monkeypatch):
    monkeypatch.setattr(main, 'LOGIN_ATTEMPTS', {})
    bad = client.post('/api/auth/login', json={'username': 'teacher', 'password': 'wrong'})
    assert bad.status_code == 401
    signed_in = client.post('/api/auth/login', json={'username': 'teacher', 'password': 'demo123'})
    assert signed_in.status_code == 200
    token = signed_in.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}
    assert client.get('/api/auth/me', headers=headers).json()['role'] == 'teacher'
    assert client.post('/api/auth/logout', headers=headers).status_code == 200
    assert client.get('/api/auth/me', headers=headers).status_code == 401

    student = client.post('/api/auth/login', json={'username': 'student', 'password': 'demo123'}).json()
    student_headers = {'Authorization': f"Bearer {student['access_token']}"}
    assert client.get('/api/auth/me', headers=student_headers).json()['role'] == 'student'
    assert client.get('/api/admin/users', headers=student_headers).status_code == 403


def test_successful_logins_do_not_exhaust_failed_attempt_limit(client, monkeypatch):
    monkeypatch.setattr(main, 'LOGIN_ATTEMPTS', {})
    for _ in range(11):
        assert client.post('/api/auth/login', json={'username': 'teacher', 'password': 'demo123'}).status_code == 200
    for _ in range(10):
        assert client.post('/api/auth/login', json={'username': 'teacher', 'password': 'wrong'}).status_code == 401
    assert client.post('/api/auth/login', json={'username': 'teacher', 'password': 'demo123'}).status_code == 429
