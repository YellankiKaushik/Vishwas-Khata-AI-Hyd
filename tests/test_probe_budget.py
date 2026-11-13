from datetime import datetime, timedelta, timezone
import json
from concurrent.futures import ThreadPoolExecutor

import pytest

from apps.api.domain import DomainError
from apps.api.probe_support import reserve_attempt, record_result


def approval(root, service='stt', **changes):
    # Synthetic authorization fixture; does not approve or invoke a real provider.
    data={'approval_id':'TEST-ONLY','service':service,'operator_confirmed':True,'credits_checked':True,
          'auto_recharge_status':'DISABLED','approved_sample_ids':['TEST-A','TEST-B'],'max_calls':2,
          'max_audio_seconds_per_call':20,'max_text_characters_per_call':1500,
          'expires_at':(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()}
    data.update(changes)
    folder=root/'private/voice-authorizations';folder.mkdir(parents=True,exist_ok=True)
    (folder/'TEST-ONLY.json').write_text(json.dumps(data),encoding='utf-8')


@pytest.mark.parametrize('change',[{'operator_confirmed':False},{'credits_checked':False},{'auto_recharge_status':'UNKNOWN'},
                                    {'service':'tts'},{'max_calls':1},{'expires_at':'2020-01-01T00:00:00Z'}])
def test_finite_plan_denials_never_reserve_an_attempt(tmp_path,change):
    approval(tmp_path,**change)
    with pytest.raises(DomainError) as failure:reserve_attempt('stt','TEST-A','TEST-ONLY',duration=2,root=tmp_path)
    assert failure.value.code=='PROBE_NOT_AUTHORIZED'
    assert not list(tmp_path.rglob('*.attempt.json'))


def test_once_reserved_failure_does_not_restore_paid_attempt(tmp_path):
    approval(tmp_path)
    receipt=reserve_attempt('stt','TEST-A','TEST-ONLY',duration=2,root=tmp_path)
    record_result(receipt,{'status':'FAILED_ATTEMPT_CONSUMED','error_category':'PROVIDER_TIMEOUT'})
    with pytest.raises(DomainError) as failure:reserve_attempt('stt','TEST-A','TEST-ONLY',duration=2,root=tmp_path)
    assert failure.value.code=='PROBE_ATTEMPT_CONSUMED'
    with pytest.raises(DomainError):reserve_attempt('stt','NOT-APPROVED','TEST-ONLY',duration=2,root=tmp_path)
    assert reserve_attempt('stt','TEST-B','TEST-ONLY',duration=2,root=tmp_path).exists()


def test_concurrent_probe_reservations_are_exactly_once(tmp_path):
    approval(tmp_path)
    def reserve(_):
        try:reserve_attempt('stt','TEST-A','TEST-ONLY',duration=2,root=tmp_path);return 'RESERVED'
        except DomainError as error:return error.code
    with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(reserve,range(8)))
    assert results.count('RESERVED')==1 and results.count('PROBE_ATTEMPT_CONSUMED')==7


def test_tts_requires_separate_bounded_approval(tmp_path):
    approval(tmp_path)
    with pytest.raises(DomainError):reserve_attempt('tts','TEST-A','TEST-ONLY',characters=100,root=tmp_path)
    approval(tmp_path,service='tts')
    with pytest.raises(DomainError):reserve_attempt('tts','TEST-A','TEST-ONLY',characters=1501,root=tmp_path)
    assert reserve_attempt('tts','TEST-A','TEST-ONLY',characters=100,root=tmp_path).exists()
