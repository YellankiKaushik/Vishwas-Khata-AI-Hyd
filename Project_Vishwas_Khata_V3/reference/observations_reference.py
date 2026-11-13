"""V3 executable observation + inactivity semantics, offline/fictional data only.

Reference implementation for contracts. Not an HTTP server, merchant pilot, or live Paytm data.
"""
from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from statistics import median
import sqlite3
import uuid
from money_sqlite_reference import ist_business_day_bounds, DomainError


def _parse_ts(raw: str) -> str:
    dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        raise DomainError('TIMESTAMP_OFFSET_REQUIRED')
    return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def record_observation(conn: sqlite3.Connection, merchant_id: str, kind: str, *, source: str, observed_at: str, client_operation_id: str, amount_paise: int | None = None, customer_id: str | None = None) -> str:
    """Idempotent app-domain reference: same op ID+payload replay; divergent payload reject."""
    if kind not in ('SALE','VISIT') or source not in ('FIXTURE','MANUAL_OBSERVATION'):
        raise DomainError('INVALID_OBSERVATION')
    if not (8 <= len(client_operation_id) <= 128):
        raise DomainError('INVALID_OPERATION_ID')
    at = _parse_ts(observed_at)
    if kind=='SALE' and (type(amount_paise) is not int or not (0 < amount_paise <= 100_000_000)):
        raise DomainError('INVALID_AMOUNT')
    if kind=='VISIT' and not customer_id:
        raise DomainError('CUSTOMER_REQUIRED')
    table = 'sales_events' if kind == 'SALE' else 'visit_events'
    expected = (amount_paise if kind=='SALE' else customer_id,at,source)
    try:
        conn.execute('BEGIN IMMEDIATE')
        if kind=='SALE':
            old=conn.execute('SELECT id,amount_paise,observed_at,source FROM sales_events WHERE merchant_id=? AND client_operation_id=?',(merchant_id,client_operation_id)).fetchone()
        else:
            old=conn.execute('SELECT id,customer_id,observed_at,source FROM visit_events WHERE merchant_id=? AND client_operation_id=?',(merchant_id,client_operation_id)).fetchone()
        if old:
            if tuple(old[1:]) != expected:raise DomainError('OBSERVATION_OPERATION_CONFLICT')
            conn.execute('COMMIT')
            return old[0]
        oid='obs_'+uuid.uuid4().hex
        if kind=='SALE':
            conn.execute('INSERT INTO sales_events(id,merchant_id,amount_paise,observed_at,source,simulated,client_operation_id) VALUES(?,?,?,?,?,1,?)',(oid,merchant_id,amount_paise,at,source,client_operation_id))
        else:
            conn.execute('INSERT INTO visit_events(id,merchant_id,customer_id,observed_at,source,simulated,client_operation_id) VALUES(?,?,?,?,?,1,?)',(oid,merchant_id,customer_id,at,source,client_operation_id))
        conn.execute('COMMIT');return oid
    except Exception:
        if conn.in_transaction: conn.execute('ROLLBACK')
        raise


def void_observation(conn: sqlite3.Connection, merchant_id: str, kind: str, source_id: str, *, actor_id: str, reason: str, at_utc: str='2026-10-27T06:00:00Z') -> str:
    if kind not in ('SALE','VISIT') or len(reason.strip())<5: raise DomainError('INVALID_VOID')
    try:
        conn.execute('BEGIN IMMEDIATE')
        row=conn.execute('SELECT id,reason FROM observation_voids WHERE merchant_id=? AND source_kind=? AND source_id=?',(merchant_id,kind,source_id)).fetchone()
        if row:
            conn.execute('COMMIT');return row[0]
        vid='void_'+uuid.uuid4().hex
        conn.execute('INSERT INTO observation_voids(id,merchant_id,source_kind,source_id,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?)',(vid,merchant_id,kind,source_id,actor_id,reason,at_utc))
        conn.execute('COMMIT');return vid
    except Exception:
        if conn.in_transaction:conn.execute('ROLLBACK')
        raise


def recorded_sales(conn:sqlite3.Connection, merchant_id:str, business_date:str, *, as_of_utc: str | None = None) -> dict:
    """Never says 'daily revenue'. Sums nonvoid recorded events within merchant-local business day."""
    start,end=ist_business_day_bounds(business_date)
    if as_of_utc is not None:
        # For an in-progress day, do not report future-dated event fixtures as already observed.
        end=min(end,_parse_ts(as_of_utc))
    rows=conn.execute('''SELECT e.id,e.amount_paise FROM sales_events e
     WHERE e.merchant_id=? AND e.observed_at>=? AND e.observed_at<?
     AND NOT EXISTS(SELECT 1 FROM observation_voids v WHERE v.merchant_id=e.merchant_id AND v.source_kind='SALE' AND v.source_id=e.id)
     ORDER BY e.id''',(merchant_id,start,end)).fetchall()
    if not rows:return {'observation_coverage':'NO_DATA','observed_sales_paise':None,'source_event_ids':[]}
    total=sum(int(r[1]) for r in rows)
    if not (0 <= total <= 9_000_000_000_000_000_000):raise DomainError('MONEY_AGGREGATE_OVERFLOW')
    return {'observation_coverage':'PARTIAL_UNVERIFIED','observed_sales_paise':total,'source_event_ids':[r[0] for r in rows]}


def inactivity(conn:sqlite3.Connection, merchant_id:str, customer_id:str, as_of_date:str, *, as_of_utc: str | None = None) -> dict:
    """Always labels RECORD-BASED gap, never proves that someone did not visit."""
    d=date.fromisoformat(as_of_date)
    end=ist_business_day_bounds(as_of_date)[1]
    if as_of_utc is not None:
        end=min(end,_parse_ts(as_of_utc))
    rows=conn.execute('''SELECT e.id,e.observed_at FROM visit_events e
       WHERE e.merchant_id=? AND e.customer_id=? AND e.observed_at<?
       AND NOT EXISTS(SELECT 1 FROM observation_voids v WHERE v.merchant_id=e.merchant_id AND v.source_kind='VISIT' AND v.source_id=e.id)
       ORDER BY e.observed_at''',(merchant_id,customer_id,end)).fetchall()
    # Day-level visits, dedup distinct calendar days to prevent double scanning counting as multiple trips.
    from zoneinfo import ZoneInfo
    unique=[];seen=set()
    for rid,raw in rows:
        local_date=datetime.fromisoformat(raw.replace('Z','+00:00')).astimezone(ZoneInfo('Asia/Kolkata')).date()
        if local_date not in seen:
            unique.append((rid,local_date));seen.add(local_date)
    if len(unique)<3:return {'status':'INSUFFICIENT_VISIT_HISTORY','source_event_ids':[r[0] for r in unique]}
    intervals=[(unique[i][1]-unique[i-1][1]).days for i in range(1,len(unique))]
    typical=int(median(intervals))
    gap=(d-unique[-1][1]).days
    if gap < 0:raise DomainError('FUTURE_VISIT_INVALID')
    threshold=max(7,2*typical)
    return {'status':'FLAG_RECORDED_GAP' if gap>=threshold else 'NO_GAP_SIGNAL',
      'days_since_last_recorded_visit':gap,'typical_interval_days':typical,
      'threshold_days':threshold,'source_event_ids':[r[0] for r in unique],
      'disclaimer':'No visit recorded in the available sample; not proof that the customer stopped visiting.'}
