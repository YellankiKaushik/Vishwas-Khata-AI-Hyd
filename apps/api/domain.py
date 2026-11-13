"""No provider may call these services. All financial writes require human confirmation."""
import hashlib
import json
import re
from decimal import Decimal, InvalidOperation
from uuid import uuid4


class DomainError(Exception):
    def __init__(self, code, message, status=422):
        self.code, self.message, self.status = code, message, status


def uid(prefix):
    return prefix + '_' + uuid4().hex


def fingerprint(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def parse_rupees(text: str) -> int:
    if not re.fullmatch(r'\d{1,7}(?:\.\d{1,2})?', text):
        raise DomainError('INVALID_AMOUNT', 'Use a positive rupee amount with at most two decimal places.')
    try:
        amount = int(Decimal(text) * 100)
    except (InvalidOperation, ValueError):
        raise DomainError('INVALID_AMOUNT', 'Amount is invalid.')
    if not 1 <= amount <= 100_000_000:
        raise DomainError('INVALID_AMOUNT', 'Amount must be between ₹0.01 and ₹10,00,000.')
    return amount


def customer(db, merchant, customer_id):
    row = db.execute('SELECT * FROM customers WHERE merchant_id=? AND id=? AND archived_at IS NULL', (merchant, customer_id)).fetchone()
    if not row:
        raise DomainError('NOT_FOUND', 'Customer unavailable in this shop.', 404)
    return row


def balance(db, merchant, customer_id):
    return db.execute('SELECT COALESCE(SUM(amount_paise_signed),0) FROM ledger_entries WHERE merchant_id=? AND customer_id=?', (merchant, customer_id)).fetchone()[0]


def draft(db, merchant, draft_id):
    row = db.execute('SELECT * FROM ledger_drafts WHERE merchant_id=? AND id=?', (merchant, draft_id)).fetchone()
    if not row:
        raise DomainError('NOT_FOUND', 'Draft unavailable in this shop.', 404)
    return row


def draft_json(row):
    warnings = [] if row['state'] in ('AWAITING_CONFIRMATION', 'CONFIRMED') else ['Select the exact customer, amount and transaction type before confirmation.']
    return dict(draft_id=row['id'], version=row['version'], state=row['state'],
                proposed=dict(entry_type=row['entry_type'], customer_id=row['customer_id'], amount_paise=row['amount_paise'], currency='INR'),
                needs_review=row['state'] == 'NEEDS_REVIEW', warnings=warnings, expires_at=row['expires_at'], source=row['source'])


def entry_json(row):
    out = dict(row)
    out['entry_id'] = out.pop('id')
    out['simulated'] = bool(out['simulated'])
    return out


def post_result(db, row):
    receipt = db.execute('SELECT response_json FROM confirmation_receipts WHERE merchant_id=? AND entry_id=?',
                         (row['merchant_id'], row['id'])).fetchone()
    if receipt:
        return json.loads(receipt['response_json'])
    # Pre-007 receipts retain Appendix R.3's original current-balance contract.
    return dict(entry_id=row['id'], draft_id=row['draft_id'], state='POSTED', entry_type=row['entry_type'],
                customer_id=row['customer_id'], amount_paise=abs(row['amount_paise_signed']),
                outstanding_balance_paise=balance(db, row['merchant_id'], row['customer_id']), posted_at=row['posted_at'], simulated=bool(row['simulated']))


def audit(db, merchant, action, entity_type, entity_id, request_id, now, metadata=None):
    db.execute('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?,?,?)',
               (uid('audit'), merchant, 'local-demo-merchant', action, entity_type, entity_id, request_id, 'SUCCESS', json.dumps(metadata or {}), now))


def extract(db, merchant, body):
    if body.parsed_override:
        p = body.parsed_override
        if body.customer_id and body.customer_id != p.customer_id:
            raise DomainError('CUSTOMER_CONFLICT', 'Select a single customer ID.')
        customer(db, merchant, p.customer_id)
        return p.customer_id, p.entry_type, p.amount_paise, 'AWAITING_CONFIRMATION'
    text = body.transcript.casefold().strip()
    # Narrow deterministic interpretation, never arbitrary instruction execution.
    if re.search(r'ignore|bank|send|transfer|<|>', text):
        return None, None, None, 'REJECTED'
    cid = body.customer_id
    if cid:
        customer(db, merchant, cid)
    else:
        aliases = {'ramesh': ('रमेश','రమేష్'), 'priya': ('प्रिया','ప్రియ'), 'lakshmi': ('लक्ष्मी','లక్ష్మి')}
        matches = [c['id'] for c in db.execute('SELECT * FROM customers WHERE merchant_id=? AND archived_at IS NULL', (merchant,))
                   if re.search(r'\b' + re.escape(c['display_name'].casefold()) + r'\b', text)
                   or any(re.search(r'(?<!\S)'+re.escape(name)+r'(?=$|[\s,.;:!?])',text) for name in aliases.get(c['normalized_name'],()))]
        if len(matches) == 1:
            cid = matches[0]
    # Narrow, testable patterns, not general language understanding or ASR confidence.
    credit = bool(re.search(r'\b(credit|udhaar|udhar)\b', text) or 'उधार' in text or 'బాకీ' in text)
    repay = bool(re.search(r'\b(returned|repaid|repayment)\b|gave back', text) or 'वापस' in text or 'తిరిగి ఇచ్చా' in text or 'చెల్లించా' in text)
    kind = ('CREDIT_GIVEN' if credit else 'REPAYMENT_RECEIVED') if credit != repay else None
    # Corrections and multiple amount candidates require explicit editing.
    if re.search(r'\b(no|actually|instead|thousand)\b', text) or 'नहीं' in text or 'కాదు' in text:
        return cid, None, None, 'NEEDS_REVIEW'
    replaced = text
    for phrase, digits in [('five hundred', '500'), ('two hundred', '200'), ('one hundred', '100'),('पाँच सौ','500'),('ఐదు వందల','500')]:
        replaced = replaced.replace(phrase, digits)
    # ASR may end a monetary sentence with a full stop ("returned ₹200.").
    # Remove only that final punctuation, retaining decimal precision validation.
    if replaced.endswith('.') and len(replaced) > 1 and replaced[-2].isdecimal():
        replaced = replaced[:-1]
    amounts = re.findall(r'(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])', replaced)
    amount = parse_rupees(amounts[0]) if len(amounts) == 1 else None
    state = 'AWAITING_CONFIRMATION' if cid and kind and amount else 'NEEDS_REVIEW'
    if kind == 'REPAYMENT_RECEIVED' and cid and amount and amount > balance(db, merchant, cid):
        state = 'NEEDS_REVIEW'
    return cid, kind, amount, state
