import pytest
from test_finance_http import env


@pytest.mark.parametrize('sentence,language,cid,amount,kind,state',[
 ('रमेश को 500 रुपये उधार दिए','hi-IN','cus_ramesh',50000,'CREDIT_GIVEN','AWAITING_CONFIRMATION'),
 ('రమేష్ 500 రూపాయలు బాకీ తీసుకున్నాడు','te-IN','cus_ramesh',50000,'CREDIT_GIVEN','AWAITING_CONFIRMATION'),
 ('Ramesh ने 500 रुपये उधार लिए','hi-IN','cus_ramesh',50000,'CREDIT_GIVEN','AWAITING_CONFIRMATION'),
 ('Ramesh 500 రూపాయలు బాకీ తీసుకున్నాడు','te-IN','cus_ramesh',50000,'CREDIT_GIVEN','AWAITING_CONFIRMATION'),
 ('रमेश को ५००.५० रुपये उधार दिए','hi-IN','cus_ramesh',50050,'CREDIT_GIVEN','AWAITING_CONFIRMATION'),
 ('రమేష్ ౫౦౦ రూపాయలు బాకీ తీసుకున్నాడు','te-IN','cus_ramesh',50000,'CREDIT_GIVEN','AWAITING_CONFIRMATION'),
 ('Ramesh ने ५०० रुपये उधार लिए','hi-IN','cus_ramesh',50000,'CREDIT_GIVEN','AWAITING_CONFIRMATION'),
 ('रमेश को 5000 नहीं 500 रुपये उधार दिए','hi-IN','cus_ramesh',None,None,'NEEDS_REVIEW'),
 ('రమేష్ 5000 కాదు 500 రూపాయలు బాకీ తీసుకున్నాడు','te-IN','cus_ramesh',None,None,'NEEDS_REVIEW'),
 ('रमेश ने 200 रुपये वापस दिए','hi-IN','cus_ramesh',20000,'REPAYMENT_RECEIVED','NEEDS_REVIEW'),
])
def test_narrow_regional_text_patterns_remain_untrusted_drafts(env,sentence,language,cid,amount,kind,state):
    _,_,c=env
    r=c.post('/v1/ledger/drafts',json={'transcript':sentence,'language':language})
    assert r.status_code==201,r.text
    assert r.json()['proposed']=={'customer_id':cid,'amount_paise':amount,'entry_type':kind,'currency':'INR'}
    assert r.json()['state']==state
    assert c.get('/v1/ledger/entries').json()['items']==[]


def test_regional_homonyms_require_id(env):
    _,_,c=env;c.post('/v1/customers',json={'display_name':'Ramesh'})
    d=c.post('/v1/ledger/drafts',json={'transcript':'रमेश को 500 रुपये उधार दिए','language':'hi-IN'}).json()
    assert d['proposed']['customer_id'] is None and d['state']=='NEEDS_REVIEW'


def test_regional_alias_substrings_do_not_guess_a_customer(env):
    _,_,c=env
    d=c.post('/v1/ledger/drafts',json={'transcript':'సుప్రియ took 500 credit','language':'te-IN'}).json()
    assert d['proposed']['customer_id'] is None and d['state']=='NEEDS_REVIEW'
