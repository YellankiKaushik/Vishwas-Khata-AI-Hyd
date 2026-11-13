"""Real TCP release smoke on an owned temporary synthetic database, never venue data."""
from contextlib import closing
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
from time import monotonic, sleep
from uuid import uuid4

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from apps.api.config import ROOT, Settings
from apps.api.manage import seed
from demo_hyd_offline import checked, post_money, require


def exercise(client):
    live = client.get('/v1/health/live')
    ready = client.get('/v1/health/ready')
    require(live.status_code == ready.status_code == 200, 'HTTP health failed')
    require(ready.json()['voice_provider'] == 'mock', 'Provider must remain mock')
    require(not ready.json()['voice_live_verified'], 'Live voice must remain disabled')
    html = client.get('/')
    require(html.status_code == 200, 'Homepage failed')
    assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html.text)
    require(any(path.endswith('.js') for path in assets) and any(path.endswith('.css') for path in assets), 'Built JS and CSS missing')
    require(all(client.get(path).status_code == 200 for path in assets), 'Asset HTTP failed')
    require(client.get('/%2A%2A?utm_source=release-smoke').status_code == 404, 'Malformed URL not rejected')
    require(client.get('/missing-synthetic-route').status_code == 404, 'Missing static route not rejected')
    checked(client.post('/v1/demo/session'), 200)
    require(checked(client.get('/v1/ledger/entries'), 200)['items'] == [], 'Expected fresh isolated journal')
    require(checked(client.get('/v1/assistant/status'), 200)['provider_mode'] == 'DISABLED', 'Model must remain disabled')
    balances = [post_money(client, 'CREDIT_GIVEN', 50000), post_money(client, 'REPAYMENT_RECEIVED', 20000)]
    review = checked(client.get('/v1/customers/cus_ramesh/balance?include_review_token=true'), 200)
    commitment = checked(client.post('/v1/commitments', headers={'Client-Operation-Id': str(uuid4())}, json={
        'customer_id': 'cus_ramesh', 'expected_date': '2026-11-13', 'promised_amount_paise': 30000,
        'reason': 'Synthetic HTTP smoke review', 'reviewed_ledger_hash': review['ledger_hash'],
    }), 201)
    answer = checked(client.post('/v1/assistant/questions', json={
        'question': 'Why is Ramesh due?', 'language': 'en-IN', 'request_id': str(uuid4()),
    }), 200)
    require(answer['items'][0]['outstanding_paise'] == 30000 and answer['answer_mode'] == 'DETERMINISTIC', 'Grounded answer failed')
    body = {'commitment_id': commitment['id'], 'expected_version': commitment['version'],
            'facts_hash': commitment['evidence_hash'], 'language': 'en-IN', 'confirm_review': True}
    draft = checked(client.post('/v1/followups/drafts', json=body), 200)
    require(draft['status'] == 'DRAFT_NOT_SENT' and draft['sent'] is False, 'Unsent draft required')
    balances.append(post_money(client, 'REPAYMENT_RECEIVED', 10000))
    stale = checked(client.post('/v1/followups/drafts', json=body), 409)
    require(stale['error']['code'] == 'STALE_EVIDENCE', 'Stale preview accepted')
    current = checked(client.get('/v1/commitments/' + commitment['id']), 200)
    refreshed = checked(client.post('/v1/followups/drafts', json={**body, 'facts_hash': current['evidence_hash']}), 200)
    require(refreshed['outstanding_paise'] == 20000, 'Fresh draft balance failed')
    balances.append(post_money(client, 'CREDIT_GIVEN', 50000))
    due = checked(client.get('/v1/followups/due'), 200)['items'][0]
    require(due['status'] == 'REVIEW_REQUIRED' and not due['followup_eligible'], 'New credit review failed')
    require(balances == [50000, 30000, 20000, 70000], 'Signed balances failed')
    return {'transport': 'REAL_LOOPBACK_HTTP', 'live_http': 200, 'ready_http': 200, 'app_http': 200,
            'js_css_http': 200, 'malformed_http': 404, 'balances_paise': balances,
            'draft': draft['status'], 'sent': False, 'stale': 'STALE_EVIDENCE', 'new_credit': due['status'],
            'provider_requests': 0, 'venue_database_touched': False}


def main():
    work = ROOT / '.tmp'
    work.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix='http-release-', dir=work) as directory:
        db = Path(directory) / 'demo.sqlite3'
        seed(Settings(database_path=db, as_of='2026-11-13T05:00:00Z'))
        with closing(socket.socket()) as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        env = {**os.environ, 'DATABASE_PATH': str(db), 'DEMO_MODE': 'true', 'VOICE_PROVIDER': 'mock',
               'SARVAM_LIVE_VERIFIED': 'false', 'SARVAM_TTS_VERIFIED': 'false', 'SARVAM_STT_LANGUAGES': '',
               'SARVAM_TTS_LANGUAGES': '', 'HYDERABAD_ENABLED': 'true', 'HYDERABAD_LIVE_ASSISTANT_ENABLED': 'false',
               'HYDERABAD_ASSISTANT_PROVIDER': 'deterministic', 'HYDERABAD_ASSISTANT_API_KEY': '',
               'SARVAM_API_KEY': '', 'VISHWAS_AS_OF': '2026-11-13T05:00:00Z'}
        with (Path(directory) / 'server.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'apps.api.main:app', '--host', '127.0.0.1', '--port', str(port)],
                                       cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                with httpx.Client(base_url=f'http://127.0.0.1:{port}', trust_env=False, timeout=10) as client:
                    deadline = monotonic() + 20
                    while True:
                        try:
                            if client.get('/v1/health/ready').status_code == 200:
                                break
                        except httpx.TransportError:
                            pass
                        if process.poll() is not None or monotonic() > deadline:
                            raise RuntimeError('Owned HTTP smoke server did not become ready')
                        sleep(0.1)
                    result = exercise(client)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
    evidence = work / 'master-evidence'
    evidence.mkdir(exist_ok=True)
    (evidence / 'http-smoke.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
