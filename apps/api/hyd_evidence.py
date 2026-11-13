"""Merchant-scoped, read-only Hyderabad projections."""
from contextlib import closing, contextmanager
from hashlib import sha256
import json

from .analytics import IST
from .config import utc_text
from .db import connect
from .domain import DomainError, fingerprint

COVERAGE = 'RECORDED_ONLY'
MAX_ITEMS = 50
MAX_SOURCE_IDS = 20


@contextmanager
def snapshot(path):
    with closing(connect(path)) as connection:
        connection.execute('PRAGMA query_only=ON')
        connection.execute('BEGIN')
        yield connection


def scope(now):
    return {'as_of_utc': utc_text(now), 'as_of_date_ist': now.astimezone(IST).date().isoformat(), 'coverage': COVERAGE}


def owned_commitment(connection, merchant_id, commitment_id):
    row = connection.execute(
        'SELECT * FROM repayment_commitments WHERE merchant_id=? AND id=?',
        (merchant_id, commitment_id),
    ).fetchone()
    if row is None:
        raise DomainError('NOT_FOUND', 'Commitment unavailable in this shop.', 404)
    return row


def ledger_view(connection, merchant_id, customer_id, reviewed_hash=None):
    # Ledger rows are append-only. Their insertion order breaks ties even under a fixed demo clock.
    digest = sha256(b'hyd-ledger-v1\n')
    found_review = reviewed_hash == digest.hexdigest()
    added_positive = False
    balance = 0
    source_count = 0
    source_ids = []
    first_posted_at = last_posted_at = None
    for row in connection.execute(
        '''SELECT id, entry_type, amount_paise_signed, posted_at
           FROM ledger_entries WHERE merchant_id=? AND customer_id=? ORDER BY rowid''',
        (merchant_id, customer_id),
    ):
        amount = row['amount_paise_signed']
        balance += amount
        source_count += 1
        posted_at = row['posted_at']
        first_posted_at = min(first_posted_at, posted_at) if first_posted_at else posted_at
        last_posted_at = max(last_posted_at, posted_at) if last_posted_at else posted_at
        if len(source_ids) < MAX_SOURCE_IDS:
            source_ids.append('ledger:' + row['id'])
        digest.update(json.dumps(tuple(row), ensure_ascii=False, separators=(',', ':')).encode() + b'\n')
        if found_review and amount > 0:
            added_positive = True
        if not found_review and digest.hexdigest() == reviewed_hash:
            found_review = True
    return {
        'outstanding_paise': balance,
        'ledger_hash': digest.hexdigest(),
        'ledger_source_count': source_count,
        'ledger_first_posted_at': first_posted_at,
        'ledger_last_posted_at': last_posted_at,
        'evidence_ids': source_ids,
        'review_required': reviewed_hash is not None and (not found_review or added_positive),
    }


def evidence_hash(merchant_id, date_ist, value):
    # Wall-clock time is displayed separately. The token changes at IST midnight or when evidence changes.
    return fingerprint(['hyd-facts-v1', merchant_id, date_ist, value])


def commitment_view(connection, row, now):
    merchant_id, customer_id = row['merchant_id'], row['customer_id']
    context = scope(now)
    ledger = ledger_view(connection, merchant_id, customer_id, row['last_reviewed_ledger_hash'])
    event = connection.execute(
        'SELECT id FROM commitment_events WHERE merchant_id=? AND commitment_id=? AND new_version=?',
        (merchant_id, row['id'], row['version']),
    ).fetchone()
    customer = connection.execute(
        'SELECT display_name, archived_at FROM customers WHERE merchant_id=? AND id=?',
        (merchant_id, customer_id),
    ).fetchone()
    active = row['state'] == 'ACTIVE'
    review = active and ledger['review_required']
    if not active:
        due_status = row['state']
    elif customer['archived_at'] is not None:
        due_status = 'CUSTOMER_ARCHIVED'
    elif ledger['outstanding_paise'] <= 0:
        due_status = 'SETTLED_BALANCE'
    elif review:
        due_status = 'REVIEW_REQUIRED'
    elif row['expected_date'] < context['as_of_date_ist']:
        due_status = 'PAST_EXPECTED_DATE'
    elif row['expected_date'] == context['as_of_date_ist']:
        due_status = 'DUE_TODAY'
    else:
        due_status = 'UPCOMING'
    facts = {
        'id': row['id'], 'customer_id': customer_id, 'customer_display_name': customer['display_name'],
        'version': row['version'], 'state': row['state'], 'expected_date': row['expected_date'],
        'promised_amount_paise': row['promised_amount_paise'],
        'last_reviewed_ledger_hash': row['last_reviewed_ledger_hash'],
        'outstanding_paise': ledger['outstanding_paise'], 'ledger_hash': ledger['ledger_hash'],
        'ledger_source_count': ledger['ledger_source_count'], 'event_id': event['id'],
        'ledger_first_posted_at': ledger['ledger_first_posted_at'],
        'ledger_last_posted_at': ledger['ledger_last_posted_at'],
        'evidence_ids': [*ledger['evidence_ids'][:MAX_SOURCE_IDS - 1], 'commitment-event:' + event['id']],
        'review_required': review, 'due_status': due_status,
        'followup_eligible': due_status in ('PAST_EXPECTED_DATE', 'DUE_TODAY'),
    }
    return {
        **facts, **context, 'status': 'RECORDED_EXPECTATION_NOT_PAYMENT',
        'evidence_hash': evidence_hash(merchant_id, context['as_of_date_ist'], facts),
    }


def due_items(connection, merchant_id, now, customer_id=None, *, limit=MAX_ITEMS):
    context = scope(now)
    rows = connection.execute(
        '''SELECT c.* FROM repayment_commitments c
           JOIN customers p ON p.merchant_id=c.merchant_id AND p.id=c.customer_id
           WHERE c.merchant_id=? AND c.state='ACTIVE' AND p.archived_at IS NULL
             AND c.expected_date<=? AND (? IS NULL OR c.customer_id=?)
           ORDER BY c.expected_date,c.customer_id,c.id''',
        (merchant_id, context['as_of_date_ist'], customer_id, customer_id),
    )
    items = []
    for row in rows:
        item = commitment_view(connection, row, now)
        if item['followup_eligible'] or item['due_status'] == 'REVIEW_REQUIRED':
            items.append(item)
    return {
        **context, 'items': items[:limit], 'total': len(items),
        'facts_hash': evidence_hash(merchant_id, context['as_of_date_ist'], [x['evidence_hash'] for x in items]),
    }
