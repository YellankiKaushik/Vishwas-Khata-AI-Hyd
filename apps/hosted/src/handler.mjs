import { createHmac, randomBytes, randomUUID } from 'node:crypto';

const COOKIE = '__Host-vishwas_demo';
const BODY_LIMIT = 8192;
const SESSION_AGE = 7200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;
const KINDS = ['CREDIT_GIVEN', 'REPAYMENT_RECEIVED'];
const ZONE = 'Asia/Kolkata';

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function invalid() {
  throw new RequestError(422, 'INVALID_INPUT', 'Review the required fields and try again.');
}
function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) invalid();
  return value.toLowerCase();
}
function integer(value, max = 100000000) {
  if (!Number.isInteger(value) || value < 1 || value > max) invalid();
  return value;
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value;
}
function digest(value) {
  if (typeof value !== 'string' || !DIGEST.test(value)) invalid();
  return value;
}
function explicit(value) {
  if (value !== true) invalid();
}
function kind(value) {
  if (!KINDS.includes(value)) invalid();
  return value;
}
function count(query, max) {
  const value = query.get('limit');
  return value === null ? max : integer(/^\d+$/.test(value) ? Number(value) : NaN, max);
}
function businessDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}
function isoDate(value) {
  if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\d$|^2100-\d\d-\d\d$/.test(value)) invalid();
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid();
  return value;
}
async function body(request, optional = false) {
  if (!request.body && optional) return {};
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json' || !request.body) {
    throw new RequestError(415, 'JSON_REQUIRED', 'Send a JSON request.');
  }
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > BODY_LIMIT) {
      void reader.cancel().catch(() => {});
      throw new RequestError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      (_key, value, context) => {
        if (typeof value === 'number' && (!/^-?\d+$/.test(context.source) || !Number.isSafeInteger(value))) {
          invalid();
        }
        return value;
      });
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'INVALID_JSON', 'Send valid UTF-8 JSON.');
  }
}

const rows = async (db, sql, parameters = []) => (await db.query(sql, parameters)).rows;
const scalar = async (db, sql, parameters) => (await rows(db, sql, parameters))[0]?.value;
const need = (value, code) => {
  if (!value) throw new RequestError(404, code, 'The record was not found in this demo session.');
  return value;
};
function receipt(row, draftId) {
  return {
    entry_id: row.entry_id, draft_id: draftId, customer_id: row.customer_id,
    entry_type: row.kind, amount_paise: Math.abs(Number(row.signed_paise)),
    outstanding_balance_paise: Number(row.balance_after_paise), posted_at: row.posted_at,
  };
}
function draftView(row) {
  return {
    draft_id: row.draft_id, version: row.version, expires_at: row.expires_at,
    state: row.posted_result ? 'CONFIRMED' : row.cancelled_at ? 'CANCELLED' : new Date(row.expires_at) <= new Date() ? 'EXPIRED' : 'AWAITING_CONFIRMATION',
    proposed: { customer_id: row.customer_id, entry_type: row.kind, amount_paise: row.amount_paise, currency: 'INR' },
    source: 'MANUAL', needs_review: false, warnings: [],
    ...(row.posted_result ? { posted_result: receipt(row.posted_result, row.draft_id) } : {}),
  };
}
async function commitmentView(db, data) {
  const [customer] = await rows(db, 'SELECT sample_name FROM hyd_demo.customers WHERE customer_id=$1', [data.customer_id]);
  const labels = { NOT_DUE: 'UPCOMING', SETTLED: 'SETTLED_BALANCE' };
  return {
    id: data.commitment_id, customer_id: data.customer_id, customer_display_name: customer.sample_name,
    expected_date: data.expected_date, state: data.state, version: data.version,
    promised_amount_paise: data.promised_paise, outstanding_paise: data.outstanding_paise,
    due_status: labels[data.due_status] || data.due_status, review_required: data.due_status === 'REVIEW_REQUIRED',
    followup_eligible: data.followup_eligible, evidence_hash: data.evidence_hash,
    as_of_date_ist: data.as_of_date_ist, ledger_source_count: data.evidence_ids.length,
    evidence_ids: [...data.evidence_ids, 'commitment:' + data.commitment_id + ':' + data.version],
  };
}
async function dueList(db, limit, customer = null) {
  const result = await rows(db, `SELECT hyd_demo.commitment_evidence(commitment_id) AS value
    FROM hyd_demo.commitments WHERE state='ACTIVE' AND ($1::uuid IS NULL OR customer_id=$1)
    ORDER BY expected_date, commitment_id`, [customer]);
  return Promise.all(result.map(row => row.value)
    .filter(data => data.followup_eligible || data.due_status === 'REVIEW_REQUIRED')
    .slice(0, limit).map(data => commitmentView(db, data)));
}
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);

async function dispatch(db, tenant, request, path, query, input, hash) {
  const method = request.method;
  const key = name => id(request.headers.get(name));
  if (method === 'GET' && path === '/merchants/me')
    return { id: tenant, display_name: 'Synthetic Merchant', timezone: ZONE, simulated: true };
  if (method === 'GET' && path === '/customers') {
    return rows(db, `SELECT customer_id AS id, sample_name AS display_name, false AS archived,
      true AS simulated FROM hyd_demo.customers ORDER BY sample_name LIMIT $1`, [count(query, 50)]);
  }
  let match = /^\/customers\/([^/]+)(\/balance)?$/.exec(path);
  if (method === 'GET' && match) {
    const cid = id(match[1]);
    if (match[2]) {
      const ledger = await scalar(db, 'SELECT hyd_demo.ledger_evidence($1) AS value', [cid]);
      return { outstanding_balance_paise: ledger.outstanding_paise, ...(query.get('include_review_token') === 'true' ? { ledger_hash: ledger.ledger_hash } : {}) };
    }
    const [customer] = await rows(db, `SELECT customer_id AS id, sample_name AS display_name, false AS archived,
      true AS simulated FROM hyd_demo.customers WHERE customer_id=$1`, [cid]);
    return need(customer, 'CUSTOMER_NOT_FOUND');
  }
  if (method === 'POST' && path === '/ledger/drafts') {
    const envelope = exact(input, ['transcript', 'language', 'parsed_override']);
    if (envelope.transcript !== '' || envelope.language !== 'en-IN') invalid();
    const data = exact(envelope.parsed_override, ['customer_id', 'entry_type', 'amount_paise', 'currency']);
    if (data.currency !== 'INR') invalid();
    return draftView(await scalar(db, 'SELECT hyd_demo.save_financial_draft(NULL,$1,NULL,$2,$3,$4,NULL) AS value',
      [key('client-operation-id'), id(data.customer_id), kind(data.entry_type), integer(data.amount_paise)]));
  }
  match = /^\/ledger\/drafts\/([^/]+)(?:\/(confirm|cancel))?$/.exec(path);
  if (match) {
    const draft = id(match[1]);
    if (method === 'GET' && !match[2]) {
      return draftView(need(await scalar(db, 'SELECT hyd_demo.get_financial_draft($1) AS value', [draft]), 'DRAFT_NOT_FOUND'));
    }
    if (method === 'PATCH' && !match[2]) {
      const data = exact(input, ['expected_version', 'customer_id', 'entry_type', 'amount_paise']);
      return draftView(await scalar(db, 'SELECT hyd_demo.save_financial_draft($1,NULL,$2,$3,$4,$5,NULL) AS value',
        [draft, integer(data.expected_version, 2147483647), id(data.customer_id), kind(data.entry_type), integer(data.amount_paise)]));
    }
    if (method === 'POST' && match[2] === 'cancel') {
      exact(input, []);
      return draftView(await scalar(db, 'SELECT hyd_demo.cancel_financial_draft($1) AS value', [draft]));
    }
    if (method === 'POST' && match[2] === 'confirm') {
      const data = exact(input, ['expected_version', 'confirm']);
      explicit(data.confirm);
      return receipt(await scalar(db, 'SELECT hyd_demo.confirm_financial_draft($1,$2,$3,true) AS value',
        [draft, key('idempotency-key'), integer(data.expected_version, 2147483647)]), draft);
    }
  }
  match = /^\/ledger\/entries\/([^/]+)\/reverse$/.exec(path);
  if (method === 'POST' && match) {
    const data = exact(input, ['confirm', 'reason']);
    explicit(data.confirm);
    if (typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 200) invalid();
    const original = id(match[1]);
    const [entry] = await rows(db, "SELECT customer_id FROM hyd_demo.journal WHERE entry_id=$1 AND kind<>'REVERSAL'", [original]);
    need(entry, 'REVERSIBLE_ENTRY_NOT_FOUND');
    const operation = key('idempotency-key');
    const draft = await scalar(db, "SELECT hyd_demo.save_financial_draft(NULL,$1,NULL,$2,'REVERSAL',NULL,$3,$4) AS value",
      [operation, entry.customer_id, original, data.reason.trim()]);
    return receipt(await scalar(db, 'SELECT hyd_demo.confirm_financial_draft($1,$2,1,true) AS value',
      [draft.draft_id, operation]), draft.draft_id);
  }
  if (method === 'GET' && path === '/ledger/entries') {
    const limit = count(query, 100);
    const cursor = query.get('cursor');
    if (cursor !== null && !/^\d{1,18}$/.test(cursor)) invalid();
    const result = await rows(db, `SELECT j.entry_id,j.customer_id,r.draft_id,j.kind AS entry_type,
      j.signed_paise::integer AS amount_paise_signed,j.posted_at,j.reverses_entry_id,r.reason,
      j.sequence::text AS cursor,true AS simulated,'MANUAL' AS source
      FROM hyd_demo.journal j LEFT JOIN hyd_demo.confirmation_receipts r USING (tenant_id,entry_id)
      WHERE ($1::bigint IS NULL OR sequence<$1) ORDER BY sequence DESC LIMIT $2`, [cursor, limit + 1]);
    return { items: result.slice(0, limit).map(({ cursor: unused, ...row }) => row),
      next_cursor: result.length > limit ? result[limit - 1].cursor : null };
  }
  if (method === 'GET' && path === '/commitments') {
    const limit = count(query, 50);
    const cursor = query.get('cursor');
    const result = await rows(db, `SELECT hyd_demo.commitment_evidence(commitment_id) AS value
      FROM hyd_demo.commitments WHERE ($1::uuid IS NULL OR commitment_id>$1)
      ORDER BY commitment_id LIMIT $2`, [cursor === null ? null : id(cursor), limit + 1]);
    return { items: await Promise.all(result.slice(0, limit).map(row => commitmentView(db, row.value))),
      next_cursor: result.length > limit ? result[limit - 1].value.commitment_id : null };
  }
  match = /^\/commitments\/([^/]+)(?:\/(cancel|handle|events))?$/.exec(path);
  if (match && method === 'GET') {
    const cid = id(match[1]);
    const evidence = await scalar(db, 'SELECT hyd_demo.commitment_evidence($1) AS value', [cid]);
    if (!match[2]) return commitmentView(db, evidence);
    if (match[2] === 'events') {
      const limit = count(query, 50);
      const after = query.get('after_version') || '0';
      if (!/^\d{1,9}$/.test(after)) invalid();
      const result = await rows(db, `SELECT commitment_id::text || ':' || version AS id, version AS new_version,
        event_type, coalesce(snapshot->>'last_reason','') AS reason FROM hyd_demo.commitment_events
        WHERE commitment_id=$1 AND version>$2 ORDER BY version LIMIT $3`, [cid, Number(after), limit + 1]);
      return { items: result.slice(0, limit), next_after_version: result.length > limit ? result[limit - 1].new_version : null };
    }
  }
  const action = method === 'POST' && path === '/commitments' ? 'CREATE' :
    method === 'PATCH' && match && !match[2] ? 'UPDATE' :
    method === 'POST' && match && ['cancel','handle'].includes(match[2]) ? match[2].toUpperCase() : null;
  if (action) {
    const create = action === 'CREATE';
    const review = create || action === 'UPDATE';
    const data = exact(input, create ? ['customer_id','expected_date','promised_amount_paise','reviewed_ledger_hash','reason'] :
      review ? ['expected_version','expected_date','promised_amount_paise','reviewed_ledger_hash','reason','review_latest_ledger'] :
        ['expected_version','reason','confirm']);
    if (typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 200) invalid();
    if (!create) explicit(review ? data.review_latest_ledger : data.confirm);
    const operation = key('client-operation-id');
    const commitment = create ? operation : id(match[1]);
    const current = create ? null : await scalar(db, 'SELECT hyd_demo.commitment_evidence($1) AS value', [commitment]);
    const updated = await scalar(db, 'SELECT hyd_demo.reviewed_commitment_change($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
      [create ? id(data.customer_id) : current.customer_id, commitment, operation, action,
        create ? 0 : integer(data.expected_version, 2147483647), review ? isoDate(data.expected_date) : null,
        review && data.promised_amount_paise !== null ? integer(data.promised_amount_paise) : null,
        review ? digest(data.reviewed_ledger_hash) : null, data.reason.trim()]);
    return commitmentView(db, updated);
  }
  if (method === 'GET' && path === '/followups/due')
    return { items: await dueList(db, count(query, 50)), as_of_date_ist: businessDate() };
  if (method === 'POST' && path === '/followups/drafts') {
    const data = exact(input, ['commitment_id','expected_version','language','tone','facts_hash','confirm_review']);
    if (data.language !== 'en-IN' || data.tone !== 'POLITE') invalid();
    explicit(data.confirm_review);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('hyd_demo.journal:' || $1::text, 0))", [tenant]);
    return scalar(db, 'SELECT hyd_demo.review_followup($1,$2,$3,true) AS value',
      [id(data.commitment_id), integer(data.expected_version, 2147483647), digest(data.facts_hash)]);
  }
  if (method === 'GET' && path === '/assistant/status') return { enabled: true, provider_mode: 'MOCK' };
  if (method === 'POST' && path === '/assistant/questions') {
    const data = exact(input, ['question','language','request_id','customer_id']);
    if (data.language !== 'en-IN' || typeof data.question !== 'string' || !data.question.trim() || data.question.length > 500) invalid();
    id(data.request_id);
    const customer = data.customer_id == null ? null : id(data.customer_id);
    const [selected] = customer ? await rows(db, 'SELECT sample_name FROM hyd_demo.customers WHERE customer_id=$1', [customer]) : [];
    if (customer) need(selected, 'CUSTOMER_NOT_FOUND');
    const question = data.question.trim();
    let items = [], evidence = [], rendered = 'Ask about recorded outstanding balances or repayment commitments.';
    if (/^(?:who is due(?: today)?|what (?:repayment )?commitments are due(?: today)?|show (?:me )?(?:the )?due (?:list|commitments)|who needs follow[- ]?up)\??$/i.test(question)) {
      items = await dueList(db, 20, customer);
      evidence = items.flatMap(item => item.evidence_ids);
      rendered = items.length ? items.map(item => `${item.customer_display_name}: ${money(item.outstanding_paise)} recorded, expected ${item.expected_date}, ${item.due_status.toLowerCase().replaceAll('_',' ')}.`).join(' ') : 'No recorded expectations are due or awaiting ledger review.';
    } else if (customer && /^(?:what is (?:the |(?:ramesh|priya|lakshmi)(?:'s)? )?(?:outstanding )?balance(?: now)?|show (?:the )?(?:recorded |outstanding )?balance|how much does (?:ramesh|priya|lakshmi) owe)\??$/i.test(question)) {
      const named = /\b(ramesh|priya|lakshmi)\b/i.exec(question);
      if (named && named[1].toLowerCase() !== selected.sample_name.toLowerCase())
        rendered = 'Select the same synthetic customer as the one in your question.';
      else {
        const ledger = await scalar(db, 'SELECT hyd_demo.ledger_evidence($1) AS value', [customer]);
        evidence = ledger.evidence_ids;
        items = [{ customer_id: customer, customer_display_name: selected.sample_name, outstanding_paise: ledger.outstanding_paise }];
        rendered = `${selected.sample_name}'s recorded outstanding balance is ${money(ledger.outstanding_paise)}.`;
      }
    }
    const asOf = businessDate();
    return { items, rendered_text: rendered, evidence_ids: evidence, as_of_date_ist: asOf,
      coverage: 'RECORDED_LEDGER_AND_COMMITMENTS_ONLY', facts_hash: hash(JSON.stringify([tenant, asOf, items, evidence])) };
  }
  throw new RequestError(404, 'NOT_FOUND', 'This operation is unavailable in the hosted synthetic demo.');
}

const conflicts = new Set(['IDEMPOTENCY_CONFLICT','VERSION_CONFLICT','DRAFT_EXPIRED','ALREADY_CONFIRMED',
  'DRAFT_TERMINAL','NEGATIVE_RECEIVABLE','ENTRY_ALREADY_REVERSED','STALE_LEDGER','STALE_EVIDENCE','REVIEW_REQUIRED']);
const missing = new Set(['CUSTOMER_NOT_FOUND','DRAFT_NOT_FOUND','COMMITMENT_NOT_FOUND','REVERSIBLE_ENTRY_NOT_FOUND']);
function safeError(error) {
  if (error instanceof RequestError) return error;
  if (conflicts.has(error.message)) return new RequestError(409, error.message, 'Review the latest recorded data and retry with the correct details.');
  if (missing.has(error.message) || error.code === '23503') return new RequestError(404, 'RECORD_NOT_FOUND', 'The record was not found in this demo session.');
  if (error.code === '23505') return new RequestError(409, 'CONFLICT', 'The requested change conflicts with an existing record.');
  if (['INVALID_PROMISE_AMOUNT','EXPLICIT_REVIEW_REQUIRED','INVALID_REASON'].includes(error.message) || error.code === '22023')
    return new RequestError(422, 'INVALID_INPUT', 'Review the required fields and try again.');
  return new RequestError(503, 'UNAVAILABLE', 'The demo service is temporarily unavailable.');
}
function response(data, status = 200, cookie) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Strict-Transport-Security': 'max-age=31536000',
    ...(cookie ? { 'Set-Cookie': cookie } : {}), ...(status === 429 ? { 'Retry-After': '60' } : {}) };
  return Response.json(data, { status, headers });
}
function sessionCookie(value, age) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
}

export function createHandler({ transact, origin, secret, log = () => {} }) {
  const allowed = new URL(origin);
  if (allowed.protocol !== 'https:' || allowed.origin !== origin || allowed.username || allowed.password ||
      typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('INVALID_HOSTED_CONFIGURATION');
  const hash = text => createHmac('sha256', secret).update(text).digest('hex');
  async function quota(db, bucket, limit) {
    return scalar(db, 'SELECT hyd_demo.consume_quota($1,$2) AS value', [hash(bucket), limit]);
  }
  return async (request, { clientAddress = 'unavailable' } = {}) => {
    try {
      const url = new URL(request.url);
      if (url.origin !== origin) throw new RequestError(403, 'ORIGIN_DENIED', 'Use the configured demo origin.');
      const path = url.pathname.slice(3);
      if (!url.pathname.startsWith('/v1/') || url.href.length > 2048) invalid();
      const method = request.method;
      if (!['GET','POST','PATCH','DELETE'].includes(method)) throw new RequestError(405, 'METHOD_DENIED', 'Unsupported method.');
      if (method !== 'GET' && (request.headers.get('origin') !== origin ||
          request.headers.get('sec-fetch-site') === 'cross-site')) {
        throw new RequestError(403, 'ORIGIN_DENIED', 'Use the configured demo origin.');
      }
      if (method === 'GET' && request.headers.get('sec-fetch-site') === 'cross-site')
        throw new RequestError(403, 'ORIGIN_DENIED', 'Use the configured demo origin.');
      if (method === 'GET' && path === '/health/live') return response({ status: 'alive' });
      if (method === 'GET' && path === '/health/ready') {
        await transact(db => scalar(db, 'SELECT hyd_demo.hosted_ready() AS value'));
        return response({ status: 'ready', schema_revision: '004', hyd_enabled: true, hosted: true,
          voice_provider: 'disabled', voice_live_verified: false, stt_verified_languages: [],
          tts_verified_languages: [], tts_live_verified: false, synthetic_clock: null });
      }
      const cookie = (request.headers.get('cookie') || '').split(';').map(value => value.trim())
        .filter(value => value.startsWith(COOKIE + '='));
      const token = cookie.length === 1 ? cookie[0].slice(COOKIE.length + 1) : '';
      const tokenHash = /^[A-Za-z0-9_-]{43}$/.test(token) ? hash('session:' + token) : null;
      if (method === 'POST' && path === '/demo/session') {
        exact(await body(request, true), []);
        const allowed = await transact(async db => {
          if (!await quota(db, 'open:' + clientAddress, 8)) return false;
          return quota(db, 'open:global', 60);
        });
        if (!allowed) throw new RequestError(429, 'RATE_LIMITED', 'Wait a minute before retrying.');
        const next = randomBytes(32).toString('base64url');
        const result = await transact(async db => {
          if (tokenHash) await scalar(db, 'SELECT hyd_demo.revoke_demo_session($1) AS value', [tokenHash]);
          return scalar(db, 'SELECT hyd_demo.open_demo_session($1) AS value', [hash('session:' + next)]);
        });
        return response({ mode: 'HOSTED_SYNTHETIC_ONLY', merchant_id: result }, 201, sessionCookie(next, SESSION_AGE));
      }
      if (!tokenHash) throw new RequestError(401, 'SESSION_REQUIRED', 'Start a synthetic demo session.');
      if (method === 'DELETE' && path === '/demo/session') {
        await transact(db => scalar(db, 'SELECT hyd_demo.revoke_demo_session($1) AS value', [tokenHash]));
        return response({ revoked: true }, 200, sessionCookie('', 0));
      }
      // Record quota independently of business success. The second binding checks expiry/revocation again.
      const allowed = await transact(async db => {
        if (!await scalar(db, 'SELECT hyd_demo.bind_demo_session($1) AS value', [tokenHash]))
          throw new RequestError(401, 'SESSION_EXPIRED', 'Start a new synthetic demo session.');
        return quota(db, (path === '/assistant/questions' ? 'assistant:' : 'session:') + tokenHash,
          path === '/assistant/questions' ? 20 : 120);
      });
      if (!allowed) throw new RequestError(429, 'RATE_LIMITED', 'Wait a minute before retrying.');
      const input = method === 'GET' ? null : await body(request, /^\/ledger\/drafts\/[^/]+\/cancel$/.test(path));
      const result = await transact(async db => {
        const tenant = await scalar(db, 'SELECT hyd_demo.bind_demo_session($1) AS value', [tokenHash]);
        if (!tenant) throw new RequestError(401, 'SESSION_EXPIRED', 'Start a new synthetic demo session.');
        return dispatch(db, tenant, request, path, url.searchParams, input, hash);
      });
      return response(result);
    } catch (error) {
      const failure = safeError(error);
      const requestId = randomUUID();
      if (failure.status === 503) log({ event: 'hosted_request_unavailable', request_id: requestId });
      return response({ error: { code: failure.code, message: failure.message, request_id: requestId } }, failure.status);
    }
  };
}
