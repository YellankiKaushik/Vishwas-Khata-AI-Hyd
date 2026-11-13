"""Regression fixtures from the two authorized 31 October responses, not new ASR calls."""
import pytest
from test_finance_http import env, new_draft, confirm


@pytest.mark.parametrize('text,kind,amount', [
    ('Ramesh took ₹500 credit.', 'CREDIT_GIVEN', 50000),
    ('Ramesh returned ₹200.', 'REPAYMENT_RECEIVED', 20000),
])
def test_recorded_vendor_normalized_rupees_need_explicit_confirmation(env, text, kind, amount):
    _, _, client = env
    if kind == 'REPAYMENT_RECEIVED':
        assert confirm(client, new_draft(client), 'recorded-response-credit-setup').status_code == 201
    before = client.get('/v1/ledger/entries').json()['items']
    draft = client.post('/v1/ledger/drafts', json={'transcript': text, 'language': 'en-IN'}).json()
    assert draft['proposed'] == {'customer_id': 'cus_ramesh', 'entry_type': kind, 'amount_paise': amount, 'currency': 'INR'}
    assert draft['state'] == 'AWAITING_CONFIRMATION'
    assert client.get('/v1/ledger/entries').json()['items'] == before
    assert confirm(client, draft, 'recorded-response-confirm', confirm=False).status_code == 422
    posted = confirm(client, draft, 'recorded-response-confirm')
    assert posted.status_code == 201
    assert confirm(client, draft, 'recorded-response-confirm').json() == posted.json()
    assert posted.json()['outstanding_balance_paise'] == (50000 if kind == 'CREDIT_GIVEN' else 30000)


@pytest.mark.parametrize('text,amount,status', [
    ('Ramesh took credit ₹500.50.', 50050, 201),
    ('Ramesh took credit ₹500.001.', None, 422),
    ('Ramesh took credit ₹500..', None, 201),
    ('Ramesh took credit ₹500.2.3.', None, 201),
    ('Ramesh took credit ₹500 and ₹200.', None, 201),
])
def test_terminal_period_does_not_relax_decimal_or_ambiguity_guards(env, text, amount, status):
    client = env[2]
    response = client.post('/v1/ledger/drafts', json={'transcript': text, 'language': 'en-IN'})
    assert response.status_code == status
    if status == 201:
        assert response.json()['proposed']['amount_paise'] == amount
        if amount is None:
            assert response.json()['state'] == 'NEEDS_REVIEW'
    assert client.get('/v1/ledger/entries').json()['items'] == []
