export type Customer = {
  id: string;
  display_name: string;
  archived: boolean;
  simulated: boolean;
  balance?: number;
};
export type Commitment = {
  id: string;
  customer_id: string;
  customer_display_name: string;
  state: "ACTIVE" | "CANCELLED" | "HANDLED";
  version: number;
  expected_date: string;
  promised_amount_paise: number | null;
  outstanding_paise: number;
  due_status: string;
  review_required: boolean;
  followup_eligible: boolean;
  evidence_hash: string;
  evidence_ids: string[];
  ledger_source_count: number;
  as_of_date_ist: string;
};
export type DueList = { items: Commitment[]; as_of_date_ist: string };
export type CommitmentEvent = { id: string; new_version: number; event_type: string; reason: string };
export type AssistantAnswer = {
  rendered_text: string;
  items: Partial<Pick<Commitment, "customer_id" | "customer_display_name" | "expected_date" | "outstanding_paise">>[];
  coverage: string;
  as_of_date_ist: string;
  evidence_ids: string[];
  facts_hash: string;
};
export type FollowupDraft = { status: "DRAFT_NOT_SENT"; sent: false; text: string; source_facts_hash: string };
export type Merchant = {
  id: string;
  display_name: string;
  timezone: string;
  simulated: boolean;
};
export type EntryType = "CREDIT_GIVEN" | "REPAYMENT_RECEIVED";
export type Entry = {
  entry_id: string;
  customer_id: string;
  draft_id: string | null;
  entry_type: EntryType | "REVERSAL";
  amount_paise_signed: number;
  posted_at: string;
  simulated: boolean;
  source: string;
  reason?: string;
  reverses_entry_id: string | null;
};
export type Draft = {
  draft_id: string;
  version: number;
  state: string;
  proposed: {
    customer_id: string | null;
    entry_type: EntryType | null;
    amount_paise: number | null;
    currency: "INR";
  };
  needs_review: boolean;
  expires_at: string;
  warnings: string[];
  source: string;
  posted_result?: Receipt;
};
export type Receipt = {
  entry_id: string;
  draft_id: string;
  customer_id: string;
  entry_type: EntryType;
  amount_paise: number;
  outstanding_balance_paise: number;
  posted_at: string;
};
export type Fact = {
  fact_id: string;
  metric: string;
  value: number | string | null;
  method: string;
  source_entry_ids: string[];
  source_event_ids: string[];
  coverage_status: string;
  business_date: string;
  calculated_at_utc: string;
};
export type Gap = {
  customer_id: string;
  display_name: string;
  status: string;
  gap_days?: number;
  median_interval_days?: number;
  threshold_days?: number;
  source_event_ids: string[];
  recorded_dates: string[];
  disclaimer: string;
};
export type Insights = {
  date: string;
  timezone: string;
  credit_given_paise: number;
  repayments_received_paise: number;
  receivables_net_change_paise: number;
  observed_sales_paise: number | null;
  observation_coverage: string;
  facts: Fact[];
  visit_observations: Gap[];
  window_start_utc: string;
  window_end_utc: string;
  as_of: string;
  facts_hash: string;
};
export type Briefing = {
  briefing_id: string;
  as_of: string;
  language: string;
  mode: string;
  facts_hash: string;
  slots: { type: string; text: string; fact_ids: string[] }[];
};
export type Pending = { draft_id: string; version: number; key: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
// The local FastAPI server and hosted service both expose a same-origin API.
export const operationStorageKey = (key: string, hosted: boolean, merchantId?: string) =>
  hosted ? `${key}.hosted.${merchantId || "unbound"}` : key;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/v1" + path, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(25000)])
        : AbortSignal.timeout(25000),
    });
  } catch {
    throw new ApiError(
      "Connection interrupted. No success is assumed. Recover saved operations with their original details, or retry this read.",
      0,
      "NETWORK_ERROR",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.error?.message || "Request failed. Refresh and try again.",
      response.status,
      body?.error?.code || "REQUEST_FAILED",
    );
  }
  return response.json();
}
export const post = <T>(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) =>
  api<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers,
  });
export const money = (paise: number | null | undefined) =>
  paise == null
    ? "Unknown"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(paise / 100);
export function toPaise(text: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text))
    throw new Error("Enter a positive amount with at most two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (value < 1 || value > 100000000)
    throw new Error("Amount must be between ₹0.01 and ₹10,00,000.");
  return value;
}
export const businessToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const entryLabel = (kind: string) =>
  ({
    CREDIT_GIVEN: "Credit given",
    REPAYMENT_RECEIVED: "Repayment received",
    REVERSAL: "Correction / reversal",
  })[kind] || kind;
export const prettyTime = (stamp: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(stamp));
