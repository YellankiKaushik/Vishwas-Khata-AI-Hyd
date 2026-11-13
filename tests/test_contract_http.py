from copy import deepcopy
from contextlib import closing
from pathlib import Path
import base64
import json

import httpx
from jsonschema import Draft202012Validator, FormatChecker
import yaml

from apps.api.config import SPEC
from apps.api.voice import SarvamAdapter
from test_finance_http import env, new_draft, confirm
from test_voice_http import wav, enable, voice

SPECIFICATION = yaml.safe_load((SPEC/'contracts/openapi.yaml').read_text(encoding='utf-8'))


def check(response, path, method='get'):
    assert response.status_code in (200,201), response.text
    result = SPECIFICATION['paths'][path][method]['responses'][str(response.status_code)]
    schema = deepcopy(result['content']['application/json']['schema'])
    schema['components'] = SPECIFICATION['components']
    Draft202012Validator(schema,format_checker=FormatChecker()).validate(response.json())


def test_real_http_responses_follow_all_normative_json_contracts(env):
    settings, app, c = env
    for path in ('/v1/health/live','/v1/health/ready','/v1/merchants/me','/v1/customers','/v1/insights/readiness'):
        check(c.get(path),path)
    check(c.post('/v1/customers',json={'display_name':'Contract synthetic alias'}),'/v1/customers','post')
    d = c.post('/v1/ledger/drafts',json={'transcript':'Ramesh took 500 credit','language':'en-IN'})
    check(d,'/v1/ledger/drafts','post')
    draft=d.json()
    updated=c.patch('/v1/ledger/drafts/'+draft['draft_id'],json={'expected_version':1,'customer_id':'cus_ramesh','entry_type':'CREDIT_GIVEN','amount_paise':50000})
    check(updated,'/v1/ledger/drafts/{draft_id}','patch')
    posted=confirm(c,updated.json())
    check(posted,'/v1/ledger/drafts/{draft_id}/confirm','post')
    check(confirm(c,updated.json()),'/v1/ledger/drafts/{draft_id}/confirm','post')
    check(c.get('/v1/ledger/entries'),'/v1/ledger/entries')
    check(c.get('/v1/customers/cus_ramesh/balance'),'/v1/customers/{customer_id}/balance')
    reversed=c.post('/v1/ledger/entries/'+posted.json()['entry_id']+'/reverse',json={'confirm':True,'reason':'Contract reversal'},headers={'Idempotency-Key':'contract-reverse-001'})
    check(reversed,'/v1/ledger/entries/{entry_id}/reverse','post')
    cancelled=new_draft(c)
    check(c.post('/v1/ledger/drafts/'+cancelled['draft_id']+'/cancel'),'/v1/ledger/drafts/{draft_id}/cancel','post')
    for kind in ('sales','visits'):
        payload={'source':'MANUAL_OBSERVATION','client_operation_id':'contract-operation-001','observed_at':'2026-10-27T07:00:00Z',**({'amount_paise':2500} if kind=='sales' else {'customer_id':'cus_priya'})}
        r=c.post('/v1/observations/'+kind,json=payload)
        check(r,'/v1/observations/'+kind,'post')
        check(c.post('/v1/observations/'+kind,json=payload),'/v1/observations/'+kind,'post')
        void=c.post('/v1/observations/'+kind+'/'+r.json()['id']+'/void',json={'confirm':True,'reason':'Contract correction'})
        check(void,'/v1/observations/'+kind+'/{observation_id}/void','post')
    check(c.get('/v1/insights/daily?date=2026-10-27'),'/v1/insights/daily')
    briefing=c.get('/v1/briefings/daily?date=2026-10-27')
    check(briefing,'/v1/briefings/daily')
    suggestions=c.get('/v1/suggestions')
    check(suggestions,'/v1/suggestions')
    check(c.patch('/v1/suggestions/'+suggestions.json()['items'][0]['id'],json={'state':'DISMISSED'}),'/v1/suggestions/{id}','patch')
    def handler(request):
        return httpx.Response(200,json={'transcript':'Ramesh took 500 credit','language_code':'en-IN'} if request.url.path=='/speech-to-text' else {'audios':[base64.b64encode(wav()).decode()]})
    enable(settings,app,handler)
    check(voice(c),'/v1/voice/transcriptions','post')
    audio=c.post('/v1/briefings/speech',json={'briefing_id':briefing.json()['briefing_id']})
    assert audio.status_code==200 and audio.headers['content-type']=='audio/wav'
    implemented=c.get('/openapi.json').json()
    for path,operations in SPECIFICATION['paths'].items():
        assert path in implemented['paths']
        for method,operation in operations.items():
            if method in ('get','post','patch'):
                assert implemented['paths'][path][method]['operationId']==operation['operationId']


def test_patch_rejects_noncontract_and_source_authority_fields(env):
    _, _, c = env
    draft=new_draft(c)
    payload={'expected_version':1,'customer_id':'cus_ramesh','entry_type':'CREDIT_GIVEN','amount_paise':50000}
    for extra in ({'currency':'INR'},{'merchant_id':'forged'},{'source':'FIXTURE'},{'simulated':False}):
        assert c.patch('/v1/ledger/drafts/'+draft['draft_id'],json={**payload,**extra}).status_code==422
