"""A1–A3 regression coverage, actual handlers/SQLite and bounded mock transport."""
import asyncio
import base64
from contextlib import closing
import sqlite3
import subprocess
import sys

import httpx
import pytest
from fastapi.testclient import TestClient

from apps.api.config import ROOT, Settings
from apps.api.db import connect, migrate
from apps.api.domain import DomainError
from apps.api.voice import SarvamAdapter
from test_finance_http import env, new_draft, confirm
from test_voice_http import wav, enable


def test_offline_qa_guard_stops_external_dns_and_connections():
    import socket
    with pytest.raises(AssertionError, match='nonloopback'):
        socket.getaddrinfo('api.sarvam.ai', 443)
    with socket.socket() as sock:
        with pytest.raises(AssertionError, match='nonloopback'):
            sock.connect(('192.0.2.1', 443))


def test_original_confirmation_receipt_survives_later_postings_and_restart(env):
    s, app, c = env
    credit = new_draft(c)
    first = confirm(c, credit).json()
    assert first['outstanding_balance_paise'] == 50000
    repay = new_draft(c, 20000, 'REPAYMENT_RECEIVED')
    assert confirm(c, repay, 'later-repayment-key').json()['outstanding_balance_paise'] == 30000
    assert confirm(c, credit).json() == first
    assert c.get('/v1/ledger/drafts/' + credit['draft_id']).json()['posted_result'] == first
    from apps.api.main import create_app
    with TestClient(create_app(s), base_url='http://localhost') as reboot:
        reboot.cookies.update(c.cookies)
        assert confirm(reboot, credit).json() == first
        assert reboot.get('/v1/customers/cus_ramesh/balance').json()['outstanding_balance_paise'] == 30000
    with closing(connect(s.database_path)) as db:
        for sql in ('UPDATE confirmation_receipts SET response_json=response_json', 'DELETE FROM confirmation_receipts'):
            with pytest.raises(sqlite3.IntegrityError, match='RECEIPT_IMMUTABLE'):
                db.execute(sql)
        assert db.execute('SELECT COUNT(*) FROM confirmation_receipts').fetchone()[0] == 2
        assert db.execute('PRAGMA foreign_key_check').fetchall() == []


def test_additive_007_preserves_nonempty_006_journal_and_legacy_retry(tmp_path, monkeypatch):
    import apps.api.db as module
    from apps.api.manage import seed
    from apps.api.domain import fingerprint, post_result
    from apps.api.config import utc_text
    folder = tmp_path / 'legacy-code'
    migrations = folder / 'apps/api/migrations'
    migrations.mkdir(parents=True)
    for file in (ROOT / 'apps/api/migrations').glob('00[4-6]*.sql'):
        (migrations / file.name).write_bytes(file.read_bytes())
    s = Settings(database_path=tmp_path / 'legacy.sqlite3', as_of='2026-10-27T17:00:00Z')
    with monkeypatch.context() as patch:
        patch.setattr(module, 'ROOT', folder)
        seed(s)
    now = utc_text(s.now())
    with closing(connect(s.database_path)) as db:
        db.execute("INSERT INTO ledger_drafts(id,merchant_id,customer_id,entry_type,amount_paise,state,created_at,updated_at,expires_at) VALUES ('legacy-draft','merch_demo_001','cus_ramesh','CREDIT_GIVEN',50000,'AWAITING_CONFIRMATION',?,?,?)", (now, now, now))
        db.execute("INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,posted_at,source,actor_id,simulated) VALUES ('legacy-entry','merch_demo_001','cus_ramesh','legacy-draft','CREDIT_GIVEN',50000,?,'MANUAL','local-demo-merchant',1)", (now,))
        db.execute("UPDATE ledger_drafts SET state='CONFIRMED' WHERE id='legacy-draft'")
        digest = fingerprint({'route': 'confirm', 'merchant': 'merch_demo_001', 'draft': 'legacy-draft', 'confirm': True, 'expected_version': 1})
        db.execute('INSERT INTO idempotency_records VALUES (?,?,?,?,?)', ('merch_demo_001', 'legacy-key-001', digest, 'legacy-entry', now))
        tables = ('ledger_entries', 'ledger_drafts', 'idempotency_records', 'audit_events')
        before = {table: [tuple(row) for row in db.execute(f'SELECT * FROM {table}')] for table in tables}
    assert migrate(s.database_path)[-1] == '008_hyd_commitments.sql'
    assert migrate(s.database_path)[-1] == '008_hyd_commitments.sql'
    with closing(connect(s.database_path)) as db:
        assert {table: [tuple(row) for row in db.execute(f'SELECT * FROM {table}')] for table in tables} == before
        assert db.execute('SELECT COUNT(*) FROM confirmation_receipts').fetchone()[0] == 0
        entry = db.execute("SELECT * FROM ledger_entries WHERE id='legacy-entry'").fetchone()
        assert post_result(db, entry)['outstanding_balance_paise'] == 50000
    from apps.api.main import create_app
    with TestClient(create_app(s), base_url='http://localhost') as client:
        assert client.post('/v1/demo/session').status_code == 200
        replay = confirm(client, {'draft_id': 'legacy-draft', 'version': 1}, 'legacy-key-001')
        assert replay.status_code == 200 and replay.json()['entry_id'] == 'legacy-entry'


def test_chunked_request_limit_prevents_parsing_or_mutation(env):
    s, app, c = env
    response = c.post('/v1/voice/validations', content=iter([b'x' * 5_400_000, b'y' * 5_400_000]),
                      headers={'Content-Type': 'application/octet-stream'})
    assert response.status_code == 413
    assert response.json()['error']['code'] == 'REQUEST_TOO_LARGE'
    assert c.get('/v1/ledger/entries').json()['items'] == []


def test_tts_does_not_return_audio_after_session_expires(env):
    s, app, c = env
    def response(request):
        with closing(connect(s.database_path)) as db:
            db.execute('DELETE FROM demo_sessions')
        return httpx.Response(200, json={'audios': [base64.b64encode(wav()).decode()]})
    enable(s, app, response)
    bid = c.get('/v1/briefings/daily?date=2026-10-27').json()['briefing_id']
    result = c.post('/v1/briefings/speech', json={'briefing_id': bid})
    assert result.status_code == 401
    assert not result.headers['content-type'].startswith('audio/')
    with closing(connect(s.database_path)) as db:
        assert db.execute('SELECT COUNT(*) FROM ledger_entries').fetchone()[0] == 0


def test_whole_provider_deadline_bounds_slow_response_without_retry(monkeypatch):
    import apps.api.voice as module
    monkeypatch.setattr(module, 'PROVIDER_DEADLINE_SECONDS', 0.02)
    calls = []
    async def delayed(request):
        calls.append(request)
        await asyncio.sleep(1)
        return httpx.Response(200, json={'transcript': 'never returned'})
    async def scenario():
        with pytest.raises(DomainError) as raised:
            await SarvamAdapter('unit-key', httpx.MockTransport(delayed)).transcribe(wav(), 'en-IN')
        assert raised.value.code == 'PROVIDER_TIMEOUT'
    asyncio.run(scenario())
    assert len(calls) == 1


def test_global_flags_without_any_locale_do_not_claim_live_enabled(env):
    s, app, c = env
    enable(s, app, lambda r: (_ for _ in ()).throw(AssertionError('No egress')))
    s.sarvam_stt_languages = s.sarvam_tts_languages = ()
    status = c.get('/v1/voice/status').json()
    assert status['status'] == 'CONFIGURED_UNVERIFIED'
    assert status['stt_verified'] is False and status['tts_verified'] is False
    health = c.get('/v1/health/ready').json()
    assert health['voice_live_verified'] is False and health['tts_live_verified'] is False


@pytest.mark.parametrize('script', ['scripts/package_venue.py', 'scripts/export_pitch_pdf.py', 'scripts/record_finale.mjs'])
def test_deferred_generators_fail_before_creating_any_output(script):
    import hashlib
    names = ('vishwas-khata-demo.mp4', 'Vishwas_Khata_Venue_Backup.zip', 'Vishwas_Khata_Finale.pptx', 'Vishwas_Khata_Finale.pdf')
    def snapshots():
        return {name: hashlib.sha256((ROOT / 'docs/finale/assets' / name).read_bytes()).hexdigest() if (ROOT / 'docs/finale/assets' / name).exists() else None for name in names}
    before = snapshots()
    command = ['node' if script.endswith('.mjs') else sys.executable, script]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, timeout=15)
    assert result.returncode != 0
    assert b'DEFERRED UNTIL APPLICATION FREEZE' in result.stdout + result.stderr
    assert snapshots() == before  # Neither create nor overwrite without the explicit release switch.
