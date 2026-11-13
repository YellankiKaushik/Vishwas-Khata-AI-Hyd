/** A staging-only status contract. No production transport, posting or payment initiation. */
const stages = new Set(['TXN_SUCCESS', 'TXN_FAILURE', 'PENDING', 'NO_RECORD_FOUND']);
const identifier = /^[A-Za-z0-9@_.-]{1,64}$/;
const amount = /^(0|[1-9][0-9]{0,7})\.([0-9]{2})$/;

export async function reviewStagingStatus(order, { fetchStatus, verifySignature }) {
  if (order.environment !== 'STAGING' || order.currency !== 'INR' ||
      typeof order.mid !== 'string' || !identifier.test(order.mid) ||
      typeof order.orderId !== 'string' || !identifier.test(order.orderId) ||
      !Number.isInteger(order.amountPaise) || order.amountPaise < 1 || order.amountPaise > 100000000) {
    throw new Error('INVALID_STAGING_ORDER');
  }
  const envelope = await fetchStatus({ mid: order.mid, orderId: order.orderId });
  if (!envelope?.body || typeof envelope.head?.signature !== 'string' ||
      !await verifySignature(envelope.body, envelope.head.signature)) {
    throw new Error('UNVERIFIED_GATEWAY_EVIDENCE');
  }
  const body = envelope.body;
  const status = body.resultInfo?.resultStatus;
  if (!stages.has(status) || body.mid !== order.mid || body.orderId !== order.orderId) {
    throw new Error('GATEWAY_STATUS_MISMATCH');
  }
  if (status !== 'TXN_SUCCESS') return { status, reconciliation: 'NO_LEDGER_EFFECT' };
  const match = typeof body.txnAmount === 'string' && amount.exec(body.txnAmount);
  if (!match || Number(match[1]) * 100 + Number(match[2]) !== order.amountPaise ||
      (body.currency !== undefined && body.currency !== order.currency) ||
      typeof body.txnId !== 'string' || !identifier.test(body.txnId) ||
      (order.txnId !== undefined && body.txnId !== order.txnId)) throw new Error('GATEWAY_STATUS_MISMATCH');
  return { status, reconciliation: 'MERCHANT_REVIEW_REQUIRED', gatewayTxnId: body.txnId,
    orderId: order.orderId, expectedCurrency: order.currency, amountPaise: order.amountPaise };
}
