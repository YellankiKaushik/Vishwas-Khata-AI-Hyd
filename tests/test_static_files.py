from fastapi.testclient import TestClient
import pytest
from starlette.staticfiles import StaticFiles

from apps.api import main
from apps.api.config import Settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    web_build = tmp_path / 'dist'
    assets = web_build / 'assets'
    assets.mkdir(parents=True)
    (web_build / 'index.html').write_text(
        '<title>Vishwas-Khata-AI</title><div id="root"></div>'
        '<script type="module" src="/assets/index-test.js"></script>'
        '<link rel="stylesheet" href="/assets/index-test.css">',
        encoding='utf-8',
    )
    (assets / 'index-test.js').write_text('export {};', encoding='utf-8')
    (assets / 'index-test.css').write_text('body {}', encoding='utf-8')
    (tmp_path / 'outside.txt').write_text('outside the static directory', encoding='utf-8')
    monkeypatch.setattr(main, 'WEB_BUILD', web_build)
    app = main.create_app(Settings(database_path=tmp_path / 'static-test.sqlite3'))
    with TestClient(app, base_url='http://localhost') as test_client:
        yield test_client


def test_homepage_assets_and_missing_file(client):
    root = client.get('/')
    assert root.status_code == 200
    assert '<div id="root"></div>' in root.text
    assert root.headers['content-type'].startswith('text/html')
    for path, expected in [
        ('/assets/index-test.js', 'export {};'),
        ('/assets/index-test.css', 'body {}'),
    ]:
        asset = client.get(path)
        assert asset.status_code == 200
        assert asset.text == expected
    assert client.get('/missing-demo-file.txt').status_code == 404
    head = client.head('/')
    assert head.status_code == 200
    assert head.content == b''


@pytest.mark.parametrize(('method', 'path'), [
    ('GET', '/%2A%2A?utm_source=chatgpt.com'),
    ('HEAD', '/%2A%2A'),
    ('GET', '/assets/index-test.js%3Ainvalid'),
    ('GET', '/assets/index-test.js%3Fignored'),
    ('GET', '/assets/index-test.js%00'),
    ('GET', '/assets/index-test.js%20'),
    ('GET', '/assets/index-test.js.'),
    ('GET', '/%2e%2e/outside.txt'),
    ('GET', '/%2e%2e%5coutside.txt'),
])
def test_invalid_path_is_rejected_before_static_lookup(client, monkeypatch, method, path):
    def unexpected_lookup(self, path):
        pytest.fail(f'Malformed static path reached filesystem lookup: {path!r}')

    monkeypatch.setattr(StaticFiles, 'lookup_path', unexpected_lookup)
    response = client.request(method, path)
    assert response.status_code == 404
    if method == 'GET':
        assert response.json() == {'detail': 'Not Found'}


def test_static_mount_leaves_health_and_merchant_api_routing_intact(client):
    assert client.get('/v1/health/live').json()['status'] == 'alive'
    ready = client.get('/v1/health/ready')
    assert ready.status_code == 200
    assert ready.json()['schema_revision'] == '008'
    api = client.get('/v1/merchants/me')
    assert api.status_code == 401
    assert api.json()['error']['code'] == 'UNAUTHENTICATED'
