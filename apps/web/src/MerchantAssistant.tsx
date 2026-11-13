import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  api,
  money,
  post,
  toPaise,
  type Customer,
  type Commitment,
  type DueList,
  type AssistantAnswer,
  type FollowupDraft,
  type CommitmentEvent,
} from "./api";
import { useSavedOperation } from "./useSavedOperation";

type Page = { items: Commitment[]; next_cursor: string | null };
type History = { items: CommitmentEvent[]; next_after_version: number | null };
type Review = { outstanding_balance_paise: number; ledger_hash: string };
type Operation = {
  path: string;
  method: "POST" | "PATCH";
  key: string;
  body: object;
};
type Change = "create" | "edit" | "handle" | "cancel";
type Capability = {
  enabled: boolean;
  provider_mode: "DISABLED" | "MOCK" | "AUTHORIZED_LIVE";
};
const labels: Record<string, string> = {
  DUE_TODAY: "Due today",
  PAST_EXPECTED_DATE: "Past expected date",
  REVIEW_REQUIRED: "Ledger review required",
  UPCOMING: "Upcoming",
  SETTLED_BALANCE: "Zero recorded balance",
  CUSTOMER_ARCHIVED: "Customer archived",
  CANCELLED: "Cancelled",
  HANDLED: "Handled administratively",
};
const pathFor = (id: string) => "/commitments/" + encodeURIComponent(id);

function Evidence({ item }: { item: Commitment }) {
  return (
    <details className="hyd-evidence">
      <summary>Supporting records</summary>
      <p>Recorded ledger and commitment evidence · {item.as_of_date_ist} IST</p>
      <p>
        Commitment version {item.version} · {item.ledger_source_count} journal
        entries
      </p>
      {item.evidence_ids.map((id) => (
        <code key={id}>{id}</code>
      ))}
      <code>Facts hash {item.evidence_hash}</code>
    </details>
  );
}

export function MerchantAssistant({
  customers,
  merchantId,
}: {
  customers: Customer[];
  merchantId: string;
}) {
  const [due, setDue] = useState<DueList | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [active, setActive] = useState<Commitment | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionCustomer, setQuestionCustomer] = useState("");
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [previewFor, setPreviewFor] = useState<Commitment | null>(null);
  const [preview, setPreview] = useState<FollowupDraft | null>(null);
  const [history, setHistory] = useState<{ id: string; page: History } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const session = useRef<AbortController | null>(null);
  const reviewForm = useRef<HTMLFormElement | null>(null);
  const [pending, savePending] = useSavedOperation<Operation>(
    "vishwas.hyd.commitment." + merchantId,
  );

  async function refresh(signal?: AbortSignal) {
    const [nextDue, nextPage, status] = await Promise.all([
      api<DueList>("/followups/due?limit=50", { signal }),
      api<Page>("/commitments?limit=20", { signal }),
      api<Capability>("/assistant/status", { signal }),
    ]);
    if (!signal?.aborted) {
      setDue(nextDue);
      setPage(nextPage);
      setCapability(status);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    session.current = controller;
    void refresh(controller.signal).catch((e: Error) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (change) reviewForm.current?.focus();
  }, [change]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function start(mode: Change, item?: Commitment) {
    if (pending) return;
    void run(async () => {
      const latest = item ? await api<Commitment>(pathFor(item.id)) : null;
      const id = latest?.customer_id || customerId;
      const balance = await api<Review>(
        "/customers/" +
          encodeURIComponent(id) +
          "/balance?include_review_token=true",
      );
      setActive(latest);
      setReview(balance);
      setDate(latest?.expected_date || due?.as_of_date_ist || "");
      setAmount(
        latest?.promised_amount_paise == null
          ? ""
          : String(latest.promised_amount_paise / 100),
      );
      setReason("");
      setAck(false);
      setChange(mode);
      setPreviewFor(null);
      setPreview(null);
    });
  }

  async function write(operation: Operation) {
    savePending(operation);
    try {
      await api<Commitment>(operation.path, {
        method: operation.method,
        body: JSON.stringify(operation.body),
        headers: { "Client-Operation-Id": operation.key },
      });
    } catch (e) {
      if (
        e instanceof ApiError &&
        [400, 401, 403, 404, 409, 422].includes(e.status)
      ) {
        savePending(null);
        setChange(null);
        await refresh().catch(() => undefined);
      }
      throw e;
    }
    savePending(null);
    setChange(null);
    setPreviewFor(null);
    setPreview(null);
    setHistory(null);
    setAnswer(null);
    setNotice("Commitment change recorded. The journal balance is unchanged.");
    await refresh();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!change || !review || !ack || pending) return;
    void run(async () => {
      const details = {
        expected_date: date,
        promised_amount_paise: amount ? toPaise(amount) : null,
        reviewed_ledger_hash: review.ledger_hash,
        reason,
      };
      const edit = change === "edit";
      const operation: Operation =
        change === "create"
          ? {
              path: "/commitments",
              method: "POST",
              key: crypto.randomUUID(),
              body: { ...details, customer_id: customerId },
            }
          : {
              path: pathFor(active!.id) + (edit ? "" : "/" + change),
              method: edit ? "PATCH" : "POST",
              key: crypto.randomUUID(),
              body: {
                expected_version: active!.version,
                ...(edit
                  ? { ...details, review_latest_ledger: true }
                  : { reason, confirm: true }),
              },
            };
      await write(operation);
    });
  }

  function draft(item: Commitment, copy = false) {
    void run(async () => {
      if (!copy) setPreview(null);
      const signal = session.current?.signal;
      try {
        const current = await api<FollowupDraft>("/followups/drafts", {
          method: "POST",
          signal,
          body: JSON.stringify({
            commitment_id: item.id,
            expected_version: item.version,
            language: "en-IN",
            tone: "POLITE",
            facts_hash: item.evidence_hash,
            confirm_review: true,
          }),
        });
        if (signal?.aborted) return;
        if (copy) {
          await navigator.clipboard.writeText(current.text);
          setNotice("Draft copied to your clipboard.");
        }
        setPreview(current);
      } catch (e) {
        if (e instanceof ApiError && [401, 403, 404, 409].includes(e.status)) {
          setPreview(null);
          setPreviewFor(null);
          setAnswer(null);
          await refresh().catch(() => undefined);
        }
        throw e;
      }
    });
  }

  function showHistory(item: Commitment, after?: number) {
    void run(async () => {
      const result = await api<History>(
        pathFor(item.id) + "/events?limit=20&after_version=" + (after ?? 0),
      );
      setHistory({
        id: item.id,
        page:
          after != null && history?.id === item.id
            ? { ...result, items: [...history.page.items, ...result.items] }
            : result,
      });
    });
  }

  const customerOptions = customers
    .filter((c) => !c.archived)
    .map((c) => (
      <option value={c.id} key={c.id}>
        {c.display_name} · {c.id}
      </option>
    ));
  return (
    <div className="hyd-workspace" lang="en-IN" aria-busy={busy}>
      <div className="toolbar">
        <p className="caption">
          {capability?.enabled
            ? capability.provider_mode === "MOCK"
              ? "Mock provider · English typed questions"
              : capability.provider_mode === "AUTHORIZED_LIVE"
                ? "Live provider available for approved requests · English typed questions"
                : "Deterministic · English typed questions"
            : error
              ? "Assistant status unavailable"
              : "Assistant status pending"}
          {due && " · Business date " + due.as_of_date_ist + " IST"}
        </p>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setPreviewFor(null);
              setPreview(null);
              setAnswer(null);
              setChange(null);
              await refresh();
            })
          }
        >
          Refresh records
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {pending && (
        <div className="notice">
          A commitment operation is awaiting a receipt.
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void run(() => write(pending))}
          >
            Retry saved commitment operation
          </button>
        </div>
      )}
      <section className="panel" aria-labelledby="hyd-due-heading">
        <h2 id="hyd-due-heading">Due follow-ups</h2>
        {!due ? (
          <p className="caption">
            {error ? "Due list unavailable." : "Loading due follow-ups…"}
          </p>
        ) : !due.items.length ? (
          <p className="caption">No recorded expectations due for follow-up.</p>
        ) : (
          due.items.map((item) => (
            <article className="hyd-item" key={item.id}>
              <div className="hyd-item-heading">
                <strong>
                  {item.customer_display_name} <small>{item.customer_id}</small>
                </strong>
                <span className="mini-tag">{labels[item.due_status]}</span>
              </div>
              <p>
                {money(item.outstanding_paise)} recorded outstanding · Expected{" "}
                {item.expected_date}
              </p>
              {item.review_required && (
                <p className="notice">
                  Positive journal entries were added after the last review.
                  Review the ledger before using this expected date.
                </p>
              )}
              <Evidence item={item} />
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !!pending}
                  onClick={() => start("edit", item)}
                >
                  Review commitment
                </button>
                {item.followup_eligible && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      setPreview(null);
                      setPreviewFor(item);
                    }}
                  >
                    Review follow-up draft
                  </button>
                )}
              </div>
            </article>
          ))
        )}
        {previewFor && (
          <div className="hyd-preview">
            <h3>Follow-up for {previewFor.customer_display_name}</h3>
            <p>
              Review {money(previewFor.outstanding_paise)} recorded outstanding
              and expected date {previewFor.expected_date}.
            </p>
            {!preview ? (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => draft(previewFor)}
              >
                Confirm review and prepare draft
              </button>
            ) : (
              <div role="status">
                <strong>Draft not sent</strong>
                <p>{preview.text}</p>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => draft(previewFor, true)}
                >
                  Check freshness and copy
                </button>
              </div>
            )}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setPreviewFor(null);
                setPreview(null);
              }}
            >
              Dismiss preview
            </button>
          </div>
        )}
      </section>
      <div className="hyd-grid">
        <section className="panel" aria-labelledby="hyd-commitments-heading">
          <h2 id="hyd-commitments-heading">Repayment commitments</h2>
          <label>
            Commitment customer
            <select
              value={customerId}
              disabled={busy || change !== null}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Select a customer</option>
              {customerOptions}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!customerId || busy || !!pending || change !== null}
            onClick={() => start("create")}
          >
            Review new commitment
          </button>
          {change && review && (
            <form
              className="hyd-preview"
              ref={reviewForm}
              tabIndex={-1}
              onSubmit={submit}
            >
              <h3>
                {change === "create"
                  ? "Record expected date"
                  : change === "edit"
                    ? "Edit expected date"
                    : change === "cancel"
                      ? "Cancel expectation"
                      : "Mark expectation handled"}
              </h3>
              <p>
                Current recorded balance{" "}
                {money(review.outstanding_balance_paise)}
                {active && " · Version " + active.version}
              </p>
              {(change === "create" || change === "edit") && (
                <>
                  <label>
                    Expected date (IST)
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Promised amount (₹, optional)
                    <input
                      inputMode="decimal"
                      maxLength={10}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                </>
              )}
              <label>
                Reason
                <input
                  required
                  minLength={3}
                  maxLength={240}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="hyd-check">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                {change === "handle" || change === "cancel"
                  ? "I confirm this administrative change."
                  : "I reviewed this balance and expected date."}
              </label>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || !ack || !!pending}
                >
                  Save commitment change
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setChange(null)}
                >
                  Dismiss review
                </button>
              </div>
            </form>
          )}
          {page?.items.length === 0 && (
            <p className="caption">No commitments recorded.</p>
          )}
          {page?.items.map((item) => (
            <article className="hyd-item" key={item.id}>
              <strong>
                {item.customer_display_name} <small>{item.customer_id}</small>
              </strong>
              <p>
                {labels[item.due_status]} · {item.expected_date} · v
                {item.version}
              </p>
              <p>
                Recorded balance {money(item.outstanding_paise)} · Promise{" "}
                {item.promised_amount_paise == null
                  ? "unspecified"
                  : money(item.promised_amount_paise)}
              </p>
              <div className="button-row">
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => showHistory(item)}
                >
                  View history
                </button>
                {item.state === "ACTIVE" && (
                  <>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !!pending}
                      onClick={() => start("edit", item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !!pending}
                      onClick={() => start("cancel", item)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || !!pending}
                      onClick={() => start("handle", item)}
                    >
                      Mark handled
                    </button>
                  </>
                )}
              </div>
              {history?.id === item.id && (
                <ol className="hyd-history">
                  {history.page.items.map((event) => (
                    <li key={event.id}>
                      v{event.new_version} · {event.event_type} · {event.reason}
                    </li>
                  ))}
                  {history.page.next_after_version != null && (
                    <li>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          showHistory(item, history.page.next_after_version!)
                        }
                      >
                        More history
                      </button>
                    </li>
                  )}
                </ol>
              )}
            </article>
          ))}
          {page?.next_cursor && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const next = await api<Page>(
                    "/commitments?limit=20&cursor=" +
                      encodeURIComponent(page.next_cursor!),
                  );
                  setPage({ ...next, items: [...page.items, ...next.items] });
                })
              }
            >
              More commitments
            </button>
          )}
        </section>
        <section className="panel" aria-labelledby="hyd-questions-heading">
          <h2 id="hyd-questions-heading">Ask about your records</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                setAnswer(null);
                setAnswer(
                  await post<AssistantAnswer>("/assistant/questions", {
                    question,
                    language: "en-IN",
                    request_id: crypto.randomUUID(),
                    customer_id: questionCustomer || null,
                  }),
                );
              });
            }}
          >
            <label>
              Question customer (optional)
              <select
                value={questionCustomer}
                disabled={busy}
                onChange={(e) => {
                  setQuestionCustomer(e.target.value);
                  setAnswer(null);
                }}
              >
                <option value="">All customers</option>
                {customerOptions}
              </select>
            </label>
            <label>
              Question
              <textarea
                value={question}
                required
                maxLength={500}
                disabled={busy}
                placeholder="Who should I follow up with today?"
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setAnswer(null);
                }}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !capability?.enabled || !question.trim()}
            >
              Ask assistant
            </button>
          </form>
          {answer && (
            <div className="hyd-item" role="status">
              <p>{answer.rendered_text}</p>
              {answer.items.map(
                (item) =>
                  item.customer_id && (
                    <p key={item.customer_id}>
                      {item.customer_display_name} ·{" "}
                      {money(item.outstanding_paise)}
                      {item.expected_date &&
                        " · Expected " + item.expected_date}
                    </p>
                  ),
              )}
              <details className="hyd-evidence">
                <summary>Answer evidence</summary>
                <p>
                  {answer.coverage} · {answer.as_of_date_ist} IST
                </p>
                {answer.evidence_ids.map((id) => (
                  <code key={id}>{id}</code>
                ))}
                <code>Facts hash {answer.facts_hash}</code>
              </details>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
