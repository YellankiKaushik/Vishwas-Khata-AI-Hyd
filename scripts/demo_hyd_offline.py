"""Typed Hyderabad demo through the actual ASGI app. No network or browser."""
import argparse
import asyncio
from contextlib import closing
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from uuid import uuid4

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from apps.api.config import ROOT, Settings
from apps.api.db import connect
from apps.api.main import create_app
from apps.api.manage import seed
from offline_guard import block_nonloopback

CUSTOMER = 'cus_ramesh'


def checked(response, status):
    if response.status_code != status:
        raise RuntimeError(f'Expected HTTP {status}, received {response.status_code}: {response.text}')
    return response.json()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def post_money(client, kind, paise):
    proposed = checked(client.post('/v1/ledger/drafts', json={
        'transcript': '', 'language': 'en-IN', 'parsed_override': {
            'customer_id': CUSTOMER, 'entry_type': kind, 'amount_paise': paise,
        },
    }), 201)
    path = f"/v1/ledger/drafts/{proposed['draft_id']}/confirm"
    headers = {'Idempotency-Key': str(uuid4())}
    body = {'confirm': True, 'expected_version': proposed['version']}
    checked(client.post(path, json={**body, 'confirm': False}, headers=headers), 422)
    result = checked(client.post(path, json=body, headers=headers), 201)
    replay = checked(client.post(path, json=body, headers=headers), 200)
    require(replay == result, 'Confirmation replay changed its original receipt')
    return result['outstanding_balance_paise']


def demo(settings):
    seed(settings)
    with TestClient(create_app(settings), base_url='http://localhost') as client:
        checked(client.post('/v1/demo/session'), 200)
        require(checked(client.get('/v1/health/ready'), 200)['schema_revision'] == '008', 'Wrong migration')
        require(checked(client.get('/v1/followups/due'), 200)['items'] == [], 'Expected an empty due list')
        initial = post_money(client, 'CREDIT_GIVEN', 50000)
        first_repayment = post_money(client, 'REPAYMENT_RECEIVED', 20000)
        reviewed = checked(client.get(f'/v1/customers/{CUSTOMER}/balance?include_review_token=true'), 200)
        commitment = checked(client.post('/v1/commitments', json={
            'customer_id': CUSTOMER, 'expected_date': '2026-11-13', 'promised_amount_paise': 30000,
            'reason': 'Synthetic merchant reviewed the recorded balance',
            'reviewed_ledger_hash': reviewed['ledger_hash'],
        }, headers={'Client-Operation-Id': str(uuid4())}), 201)
        answer = checked(client.post('/v1/assistant/questions', json={
            'question': 'Why is Ramesh due?', 'request_id': str(uuid4()), 'language': 'en-IN',
        }), 200)
        require(answer['answer_mode'] == 'DETERMINISTIC' and answer['items'][0]['outstanding_paise'] == 30000,
                'Expected a deterministic answer grounded in the recorded balance')
        request = {'commitment_id': commitment['id'], 'expected_version': commitment['version'],
                   'facts_hash': commitment['evidence_hash'], 'language': 'en-IN', 'confirm_review': True}
        draft = checked(client.post('/v1/followups/drafts', json=request), 200)
        require(draft['status'] == 'DRAFT_NOT_SENT' and draft['sent'] is False, 'Expected an unsent draft')
        second_repayment = post_money(client, 'REPAYMENT_RECEIVED', 10000)
        stale = checked(client.post('/v1/followups/drafts', json=request), 409)
        require(stale['error']['code'] == 'STALE_EVIDENCE', 'Expected the old draft to expire')
        current = checked(client.get(f"/v1/commitments/{commitment['id']}"), 200)
        refreshed = checked(client.post('/v1/followups/drafts', json={**request, 'facts_hash': current['evidence_hash']}), 200)
        require(refreshed['outstanding_paise'] == 20000 and current['promised_amount_paise'] == 30000,
                'Expected a fresh balance without changing the historical promise')
        new_credit = post_money(client, 'CREDIT_GIVEN', 50000)
        due = checked(client.get('/v1/followups/due'), 200)['items'][0]
        require(due['status'] == 'REVIEW_REQUIRED' and not due['followup_eligible'], 'Expected review after new credit')
        balances = [initial, first_repayment, second_repayment, new_credit]
        require(balances == [50000, 30000, 20000, 70000], 'Unexpected signed journal balances')
        require(len(checked(client.get('/v1/ledger/entries'), 200)['items']) == 4, 'Expected exactly four entries')
    with closing(connect(settings.database_path)) as db:
        require(db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'SQLite integrity check failed')
        require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'SQLite foreign-key check failed')
    return {'transport': 'IN_PROCESS_ASGI', 'browser_verified': False,
            'balances_paise': balances, 'assistant': answer['answer_mode'], 'draft': draft['status'],
            'sent': draft['sent'], 'old_draft': stale['error']['code'], 'new_credit': due['status']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--windows-no-sockets', action='store_true')
    args = parser.parse_args()
    if args.windows_no_sockets:
        if sys.platform != 'win32':
            parser.error('--windows-no-sockets is only needed on restricted Windows hosts')
        from test_asgi_windows import InProcessPolicy
        asyncio.set_event_loop_policy(InProcessPolicy())
    block_nonloopback()
    work = ROOT / '.tmp'
    work.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix='hyderabad-offline-', dir=work) as directory:
        result = demo(Settings(database_path=Path(directory) / 'demo.sqlite3', as_of='2026-11-13T05:00:00Z'))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
