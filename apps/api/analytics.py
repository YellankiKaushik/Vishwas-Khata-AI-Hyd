"""Deterministic facts and narrative. No model-generated financial claims."""
from contextlib import closing
from datetime import date as BusinessDate, datetime, time, timedelta, timezone
from statistics import median
from zoneinfo import ZoneInfo
import json

from fastapi import Depends, Query, Request, Response

from .config import utc_text
from .db import connect, transaction
from .domain import DomainError, uid, fingerprint, customer, audit
from .models import Sale, Visit, Void, SuggestionEdit, Language

IST = ZoneInfo('Asia/Kolkata')
DISCLAIMER = 'No visit recorded in the available sample; not proof that the customer stopped visiting.'
READINESS_DISCLAIMER = 'Recordkeeping completeness only; not loan eligibility, underwriting or approval.'


def bounds(day: BusinessDate):
    start = datetime.combine(day, time.min, IST)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def safe_sum(values):
    result = sum(values)
    if not -9_000_000_000_000_000_000 <= result <= 9_000_000_000_000_000_000:
        raise DomainError('MONEY_AGGREGATE_OVERFLOW', 'Too many records to safely aggregate.')
    return result


def active_events(db, mid, table, kind, cutoff, start=None, end=None):
    # table and kind are service-owned constants, never client SQL identifiers.
    sql = f'''SELECT e.* FROM {table} e WHERE e.merchant_id=? AND julianday(e.observed_at)<=julianday(?)
        AND NOT EXISTS (SELECT 1 FROM observation_voids v WHERE v.merchant_id=e.merchant_id
            AND v.source_kind=? AND v.source_id=e.id)'''
    args = [mid, utc_text(cutoff), kind]
    if start:
        sql += ' AND julianday(e.observed_at)>=julianday(?) AND julianday(e.observed_at)<julianday(?)'
        args += [utc_text(start), utc_text(end)]
    return db.execute(sql + ' ORDER BY e.observed_at,e.id', args).fetchall()


def daily_facts(db, mid, day, now):
    start, end = bounds(day)
    if day > now.astimezone(IST).date():
        raise DomainError('FUTURE_REPORT', 'A future business date has no known evidence.')
    sales = active_events(db, mid, 'sales_events', 'SALE', now, start, end)
    visits = active_events(db, mid, 'visit_events', 'VISIT', min(now, end - timedelta(microseconds=1)))
    entries = db.execute('''SELECT * FROM ledger_entries WHERE merchant_id=? AND julianday(posted_at)>=julianday(?)
        AND julianday(posted_at)<julianday(?) AND julianday(posted_at)<=julianday(?) ORDER BY posted_at,id''', (mid, utc_text(start), utc_text(end), utc_text(now))).fetchall()
    history = db.execute('SELECT * FROM ledger_entries WHERE merchant_id=? AND julianday(posted_at)<=julianday(?) ORDER BY id', (mid, utc_text(now))).fetchall()
    history = [e for e in history if datetime.fromisoformat(e['posted_at'].replace('Z', '+00:00')) < end]
    customers = db.execute('SELECT * FROM customers WHERE merchant_id=? AND archived_at IS NULL ORDER BY id', (mid,)).fetchall()
    credit = [e for e in entries if e['entry_type'] == 'CREDIT_GIVEN']
    repayments = [e for e in entries if e['entry_type'] == 'REPAYMENT_RECEIVED']
    credit_value = safe_sum(e['amount_paise_signed'] for e in credit)
    repayment_value = -safe_sum(e['amount_paise_signed'] for e in repayments)
    sale_value = safe_sum(s['amount_paise'] for s in sales) if sales else None
    gaps = []
    for c in customers:
        days = {}
        for v in visits:
            if v['customer_id'] == c['id']:
                local_day = datetime.fromisoformat(v['observed_at'].replace('Z', '+00:00')).astimezone(IST).date()
                days.setdefault(local_day, []).append(v['id'])
        ordered = sorted(days)
        item = {'customer_id': c['id'], 'display_name': c['display_name'], 'status': 'INSUFFICIENT_VISIT_HISTORY',
                'source_event_ids': [event for d in ordered for event in days[d]], 'recorded_dates': [d.isoformat() for d in ordered], 'disclaimer': DISCLAIMER}
        if len(ordered) >= 3:
            typical = median((b-a).days for a, b in zip(ordered, ordered[1:]))
            gap = (day - ordered[-1]).days
            threshold = max(7, 2 * typical)
            item.update(status='RECORDED_GAP' if gap >= threshold else 'NO_GAP_SIGNAL',
                        gap_days=gap, median_interval_days=typical, threshold_days=threshold)
        gaps.append(item)
    coverage = 'PARTIAL_UNVERIFIED' if sales else 'NO_DATA'
    readiness = 'BASIC_RECORDS_AVAILABLE' if history and sales and customers else ('NEEDS_MORE_RECORDS' if sales or history or customers else 'INSUFFICIENT_DATA')
    facts = []
    def fact(fid, metric, value, method, source_entries=(), source_events=(), status='RECORDED_ONLY', unit='paise'):
        facts.append({'fact_id': fid, 'metric': metric, 'metric_code': metric, 'value': value, 'unit': unit,
                      'method': method, 'method_version': 'vishwas_rules_v1', 'source_entry_ids': list(source_entries),
                      'source_event_ids': list(source_events), 'business_date': day.isoformat(), 'timezone': 'Asia/Kolkata',
                      'coverage_status': status, 'simulated': True, 'calculated_at_utc': utc_text(now)})
    fact('f_sales', 'observed_sales_paise', sale_value, 'sum_nonvoid_recorded_sales_in_IST_day', source_events=[s['id'] for s in sales], status=coverage)
    fact('f_credit', 'credit_given_paise', credit_value, 'sum_positive_credit_journal', [e['id'] for e in credit])
    fact('f_repayment', 'repayments_received_paise', repayment_value, 'absolute_sum_repayment_journal', [e['id'] for e in repayments])
    fact('f_net', 'receivables_net_change_paise', safe_sum(e['amount_paise_signed'] for e in entries), 'sum_signed_journal_in_IST_day_including_reversals', [e['id'] for e in entries])
    # Historical business-date reports must not include later ledger entries.
    receivable_history = [e for e in history if datetime.fromisoformat(e['posted_at'].replace('Z', '+00:00')) < end]
    fact('f_outstanding', 'outstanding_paise', safe_sum(e['amount_paise_signed'] for e in receivable_history), 'sum_signed_journal_through_report_cutoff', [e['id'] for e in receivable_history])
    fact('f_readiness', 'recordkeeping_status', readiness, 'customer_and_journal_and_recorded_sale_checklist',
         [e['id'] for e in receivable_history], [s['id'] for s in sales], unit='status')
    for g in gaps:
        fact('f_visits_' + g['customer_id'], 'recorded_visit_gap_days', g.get('gap_days'), 'distinct_IST_dates_median_interval_minimum_three',
             source_events=g['source_event_ids'], status=g['status'], unit='days')
    # No per-hour baseline is inferred from a daily total or fixture's hypothetical hours.
    fact('f_whatif', 'what_if_status', 'INSUFFICIENT_DATA', 'no_confirmed_hourly_baseline', status='INSUFFICIENT_DATA', unit='status')
    result = {'date': day.isoformat(), 'timezone': 'Asia/Kolkata', 'credit_given_paise': credit_value,
              'repayments_received_paise': repayment_value, 'receivables_net_change_paise': safe_sum(e['amount_paise_signed'] for e in entries),
              'observed_sales_paise': sale_value, 'observation_coverage': coverage, 'simulated': True, 'facts': facts,
              'visit_observations': gaps, 'window_start_utc': utc_text(start), 'window_end_utc': utc_text(end), 'as_of': utc_text(min(now, end)),
              'recordkeeping_status': readiness}
    # Content identity excludes request clock metadata; evidence changes invalidate the snapshot.
    result['facts_hash'] = fingerprint({'facts': [{k:v for k,v in f.items() if k!='calculated_at_utc'} for f in facts], 'visits': gaps})
    return result


def rupees(paise):
    whole, fraction = divmod(abs(paise), 100)
    return ('−' if paise < 0 else '') + '₹' + f'{whole:,}' + (f'.{fraction:02d}' if fraction else '')


def build_slots(facts):
    sales = (f"Recorded sales observations: {rupees(facts['observed_sales_paise'])}; PARTIAL_UNVERIFIED, not complete revenue."
             if facts['observed_sales_paise'] is not None else 'Recorded sales: NO_DATA. No complete sales or revenue total is known.')
    activity = f"{sales} Credit given: {rupees(facts['credit_given_paise'])}; repayments recorded: {rupees(facts['repayments_received_paise'])}. Net receivable change including corrections: {rupees(facts['receivables_net_change_paise'])}. Credit is not sales; repayments do not prove bank or Paytm settlement."
    candidates = [g for g in facts['visit_observations'] if g['status'] == 'RECORDED_GAP']
    salient = max(candidates, key=lambda g:g['gap_days']) if candidates else None
    if salient:
        inactivity = f"{salient['display_name']}: no visit recorded in {salient['gap_days']} days as of {facts['date']}. Median recorded interval: {salient['median_interval_days']:g} days; threshold: {salient['threshold_days']:g} days. Recorded dates: {', '.join(salient['recorded_dates'])}. {DISCLAIMER} Consider a personal check-in if appropriate; this application sends nothing."
        visit_facts = ['f_visits_' + salient['customer_id']]
    else:
        inactivity = 'No supported recorded-gap signal. At least three distinct recorded local dates are needed per customer. Missing visit records do not establish actual absence or churn.'
        visit_facts = [f['fact_id'] for f in facts['facts'] if f['metric'] == 'recorded_visit_gap_days']
    return [
        {'type': 'SALES', 'text': activity, 'fact_ids': ['f_sales', 'f_credit', 'f_repayment', 'f_net']},
        {'type': 'RECORD_READINESS', 'text': f"{facts['recordkeeping_status']}: review customer labels, dated journal entries and recorded sales coverage. Observations remain partial and unverified. {READINESS_DISCLAIMER}", 'fact_ids': ['f_readiness']},
        {'type': 'CUSTOMER_INACTIVITY', 'text': inactivity, 'fact_ids': visit_facts},
        {'type': 'WHAT_IF', 'text': 'INSUFFICIENT_DATA: no confirmed hourly activity baseline is recorded. More opening hours cannot be translated into additional sales or profit from these records. Keep recording observations before comparing a scenario.', 'fact_ids': ['f_whatif']},
    ]


def install_analytics(app, settings, merchant):
    def record(body, kind, request, response, mid):
        if body.source != 'MANUAL_OBSERVATION':
            raise DomainError('FIXTURE_SOURCE_FORBIDDEN', 'Only the local seed harness may declare fixture provenance.', 403)
        if body.observed_at > settings.now():
            raise DomainError('FUTURE_OBSERVATION', 'An observation cannot be recorded in the future.')
        table = 'sales_events' if kind == 'SALE' else 'visit_events'
        stamp = utc_text(body.observed_at)
        with transaction(settings.database_path) as db:
            if kind == 'VISIT':
                customer(db, mid, body.customer_id)
            old = db.execute(f'SELECT * FROM {table} WHERE merchant_id=? AND client_operation_id=?', (mid, body.client_operation_id)).fetchone()
            if old:
                same = old['observed_at'] == stamp and old['source'] == body.source
                same = same and (old['amount_paise'] == body.amount_paise and old['note'] == body.note if kind == 'SALE' else old['customer_id'] == body.customer_id)
                if not same:
                    raise DomainError('OBSERVATION_OPERATION_CONFLICT', 'This operation ID already records different observation data.', 409)
                response.status_code = 200
                return {'id': old['id'], 'source': old['source'], 'observed_at': old['observed_at'], 'simulated': True}
            oid, now = uid('obs'), utc_text(settings.now())
            if kind == 'SALE':
                db.execute('INSERT INTO sales_events(id,merchant_id,amount_paise,observed_at,source,simulated,note,client_operation_id) VALUES (?,?,?,?,?,1,?,?)',
                           (oid, mid, body.amount_paise, stamp, body.source, body.note, body.client_operation_id))
            else:
                db.execute('INSERT INTO visit_events(id,merchant_id,customer_id,observed_at,source,simulated,client_operation_id) VALUES (?,?,?,?,?,1,?)',
                           (oid, mid, body.customer_id, stamp, body.source, body.client_operation_id))
            audit(db, mid, 'OBSERVATION_CREATE', kind, oid, request.state.request_id, now)
        return {'id': oid, 'source': body.source, 'observed_at': stamp, 'simulated': True}

    @app.post('/v1/observations/sales', status_code=201)
    def sale(body: Sale, request: Request, response: Response, mid=Depends(merchant)):
        return record(body, 'SALE', request, response, mid)

    @app.post('/v1/observations/visits', status_code=201)
    def visit(body: Visit, request: Request, response: Response, mid=Depends(merchant)):
        return record(body, 'VISIT', request, response, mid)

    def void(kind, observation_id, body, request, response, mid):
        table = 'sales_events' if kind == 'SALE' else 'visit_events'
        with transaction(settings.database_path) as db:
            if not db.execute(f'SELECT 1 FROM {table} WHERE merchant_id=? AND id=?', (mid, observation_id)).fetchone():
                raise DomainError('NOT_FOUND', 'Observation unavailable in this shop.', 404)
            row = db.execute('SELECT * FROM observation_voids WHERE merchant_id=? AND source_kind=? AND source_id=?', (mid, kind, observation_id)).fetchone()
            if row:
                response.status_code = 200
            else:
                vid, now = uid('void'), utc_text(settings.now())
                db.execute('INSERT INTO observation_voids VALUES (?,?,?,?,?,?,?)', (vid, mid, kind, observation_id, 'local-demo-merchant', body.reason, now))
                audit(db, mid, 'OBSERVATION_VOID', kind, observation_id, request.state.request_id, now, {'reason': body.reason})
                row = db.execute('SELECT * FROM observation_voids WHERE id=?', (vid,)).fetchone()
            return {'id': row['id'], 'observation_id': row['source_id'], 'kind': row['source_kind'], 'reason': row['reason'], 'voided_at': row['created_at']}

    @app.post('/v1/observations/sales/{observation_id}/void', status_code=201)
    def void_sale(observation_id: str, body: Void, request: Request, response: Response, mid=Depends(merchant)):
        return void('SALE', observation_id, body, request, response, mid)

    @app.post('/v1/observations/visits/{observation_id}/void', status_code=201)
    def void_visit(observation_id: str, body: Void, request: Request, response: Response, mid=Depends(merchant)):
        return void('VISIT', observation_id, body, request, response, mid)

    def clock(as_of):
        now = settings.now()
        if as_of:
            if as_of.tzinfo is None or as_of > now:
                raise DomainError('INVALID_AS_OF', 'As-of must include a timezone and cannot exceed the server evidence clock.')
            now = as_of.astimezone(timezone.utc)
        return now

    @app.get('/v1/insights/daily')
    def insights(day: BusinessDate = Query(alias='date'), as_of: datetime | None = None, mid=Depends(merchant)):
        with closing(connect(settings.database_path)) as db:
            db.execute('BEGIN')
            return daily_facts(db, mid, day, clock(as_of))

    @app.get('/v1/insights/readiness')
    def readiness(mid=Depends(merchant)):
        with closing(connect(settings.database_path)) as db:
            f = daily_facts(db, mid, settings.now().astimezone(IST).date(), settings.now())
        return {'status': f['recordkeeping_status'], 'reason_codes': ['PARTIAL_OBSERVATIONS' if f['observed_sales_paise'] is not None else 'NO_SALES_OBSERVATIONS'], 'disclaimer': READINESS_DISCLAIMER, 'simulated': True}

    @app.get('/v1/briefings/daily')
    def briefing(day: BusinessDate = Query(alias='date'), language: Language = 'en-IN', mid=Depends(merchant)):
        if language != 'en-IN':
            raise DomainError('UNSUPPORTED_NARRATIVE_LANGUAGE', 'Regional narrative templates have not been verified. English briefing remains available.')
        now = settings.now()
        with transaction(settings.database_path) as db:
            facts = daily_facts(db, mid, day, now)
            bid = 'brief_' + fingerprint([mid, day.isoformat(), language, facts['facts_hash']])[:32]
            existing = db.execute('SELECT approved_slots_json FROM briefing_snapshots WHERE merchant_id=? AND id=?', (mid, bid)).fetchone()
            if existing:
                return json.loads(existing[0])
            payload = {'briefing_id': bid, 'as_of': facts['as_of'], 'language': language, 'mode': 'TEMPLATE', 'data_status': 'SYNTHETIC',
                       'slots': build_slots(facts), 'facts_hash': facts['facts_hash']}
            db.execute('INSERT INTO briefing_snapshots VALUES (?,?,?,?,?,?,?,?,?)',
                       (bid, mid, day.isoformat(), language, 'TEMPLATE', json.dumps(payload, ensure_ascii=False), facts['facts_hash'], utc_text(now), 1))
            return payload

    @app.get('/v1/suggestions')
    def suggestions(mid=Depends(merchant)):
        now = settings.now()
        with transaction(settings.database_path) as db:
            facts = daily_facts(db, mid, now.astimezone(IST).date(), now)
            items = []
            for gap in facts['visit_observations']:
                if gap['status'] != 'RECORDED_GAP':
                    continue
                sid = 'suggest_' + fingerprint([mid, gap['customer_id'], gap['source_event_ids']])[:24]
                db.execute('''INSERT OR IGNORE INTO suggestions VALUES (?,?,?,?,?,'PROPOSED',?,?)''',
                           (sid, mid, gap['customer_id'], 'RECORDED_VISIT_GAP', json.dumps(gap), utc_text(now), utc_text(now)))
                row = db.execute('SELECT * FROM suggestions WHERE merchant_id=? AND id=?', (mid, sid)).fetchone()
                items.append({k:row[k] for k in ('id', 'customer_id', 'reason_code', 'state', 'created_at')})
        return {'items': items}

    @app.patch('/v1/suggestions/{id}')
    def edit_suggestion(id: str, body: SuggestionEdit, request: Request, mid=Depends(merchant)):
        with transaction(settings.database_path) as db:
            row = db.execute('SELECT * FROM suggestions WHERE merchant_id=? AND id=?', (mid, id)).fetchone()
            if not row:
                raise DomainError('NOT_FOUND', 'Suggestion unavailable.', 404)
            now = utc_text(settings.now())
            db.execute('UPDATE suggestions SET state=?,updated_at=? WHERE merchant_id=? AND id=?', (body.state, now, mid, id))
            audit(db, mid, 'SUGGESTION_MANUAL_STATE', 'suggestion', id, request.state.request_id, now)
            return {**{k:row[k] for k in ('id', 'customer_id', 'reason_code', 'created_at')}, 'state': body.state}
