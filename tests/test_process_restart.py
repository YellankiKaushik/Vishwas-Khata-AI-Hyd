"""Actual HTTP over loopback and two independent uvicorn process lifetimes."""
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import httpx

from apps.api.config import ROOT, Settings
from apps.api.manage import seed


def test_journal_persists_across_real_server_process_restart(tmp_path):
    path=tmp_path/'restart.sqlite3'
    seed(Settings(database_path=path,as_of='2026-10-27T17:00:00Z'))
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0))
        port=listener.getsockname()[1]
    url=f'http://127.0.0.1:{port}'
    environment = {
        **os.environ, 'DATABASE_PATH': str(path), 'DEMO_MODE': 'true', 'VOICE_PROVIDER': 'mock',
        'SARVAM_LIVE_VERIFIED': 'false', 'SARVAM_TTS_VERIFIED': 'false',
        'HYDERABAD_LIVE_ASSISTANT_ENABLED': 'false', 'VISHWAS_AS_OF': '2026-10-27T17:00:00Z',
        'PYTHONUTF8': '1',
    }
    def start():
        process=subprocess.Popen([sys.executable,'-m','uvicorn','apps.api.main:app','--host','127.0.0.1','--port',str(port),'--no-access-log'],cwd=ROOT,env=environment,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        deadline=time.monotonic()+15
        last_error = 'no HTTP response'
        while time.monotonic()<deadline:
            if process.poll() is not None:
                raise AssertionError('Local server exited during startup')
            try:
                if httpx.get(url+'/v1/health/ready',timeout=1,trust_env=False).status_code==200:return process
            except httpx.RequestError as exc:
                last_error = str(exc)
            time.sleep(.1)
        process.terminate();process.wait(timeout=5)
        raise AssertionError(f'Local server failed readiness deadline: {last_error}')
    process=start()
    try:
        with httpx.Client(base_url=url,timeout=5,trust_env=False) as client:
            assert client.post('/v1/demo/session').status_code==200
            for amount,kind,key in [(50000,'CREDIT_GIVEN','restart-credit-001'),(20000,'REPAYMENT_RECEIVED','restart-repay-001')]:
                draft=client.post('/v1/ledger/drafts',json={'transcript':'','language':'en-IN','parsed_override':{'customer_id':'cus_ramesh','entry_type':kind,'amount_paise':amount}}).json()
                posted=client.post('/v1/ledger/drafts/'+draft['draft_id']+'/confirm',json={'confirm':True,'expected_version':1},headers={'Idempotency-Key':key})
                assert posted.status_code==201,posted.text
            process.terminate();process.wait(timeout=5)
            process=start()
            assert client.get('/v1/customers/cus_ramesh/balance').json()['outstanding_balance_paise']==30000
            assert len(client.get('/v1/ledger/entries').json()['items'])==2
            replay=client.post('/v1/ledger/drafts/'+draft['draft_id']+'/confirm',json={'confirm':True,'expected_version':1},headers={'Idempotency-Key':'restart-repay-001'})
            assert replay.status_code==200 and replay.json()['entry_id']==posted.json()['entry_id']
    finally:
        process.terminate();process.wait(timeout=5)
