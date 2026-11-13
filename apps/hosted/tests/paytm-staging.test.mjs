import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewStagingStatus } from '../integrations/paytm-staging.mjs';

const order = { environment: 'STAGING', currency: 'INR', mid: 'SYNTHETIC_MID', orderId: 'sample-1', amountPaise: 30000 };
const body = { mid: order.mid, orderId: order.orderId, txnAmount: '300.00', txnId: 'synthetic-txn',
  resultInfo: { resultStatus: 'TXN_SUCCESS' } };
const transport = (overrides = {}, signature = 'valid') => ({
  fetchStatus: async input => {
    assert.deepEqual(input, { mid: order.mid, orderId: order.orderId });
    return { body: { ...body, ...overrides }, head: { signature } };
  },
  verifySignature: async (_, value) => value === 'valid',
});

test('Paytm staging status remains separate evidence requiring merchant review', async () => {
  const first = await reviewStagingStatus(order, transport());
  assert.deepEqual(first, { status: 'TXN_SUCCESS', reconciliation: 'MERCHANT_REVIEW_REQUIRED',
    gatewayTxnId: 'synthetic-txn', orderId: 'sample-1', expectedCurrency: 'INR', amountPaise: 30000 });
  assert.deepEqual(await reviewStagingStatus(order, transport()), first);
  for (const status of ['PENDING','NO_RECORD_FOUND','TXN_FAILURE'])
    assert.equal((await reviewStagingStatus(order, transport({ resultInfo: { resultStatus: status } }))).reconciliation, 'NO_LEDGER_EFFECT');
});
test('Paytm staging status rejects wrong signature, order, merchant, amount, currency and transaction', async () => {
  await assert.rejects(reviewStagingStatus(order, transport({}, 'invalid')), /UNVERIFIED_GATEWAY_EVIDENCE/);
  for (const mismatch of [{ mid: 'other' }, { orderId: 'other' }, { txnAmount: '300.01' },
    { txnAmount: '300' }, { currency: 'USD' }, { txnId: null }])
    await assert.rejects(reviewStagingStatus(order, transport(mismatch)), /GATEWAY_STATUS_MISMATCH/);
  await assert.rejects(reviewStagingStatus({ ...order, txnId: 'other' }, transport()), /GATEWAY_STATUS_MISMATCH/);
  await assert.rejects(reviewStagingStatus({ ...order, environment: 'PRODUCTION' }, transport()), /INVALID_STAGING_ORDER/);
  await assert.rejects(reviewStagingStatus(order, { ...transport(), fetchStatus: async () => { throw Error('timeout'); } }), /timeout/);
});
