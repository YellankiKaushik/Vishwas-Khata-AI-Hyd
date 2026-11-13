import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Pencil, ShieldCheck } from "lucide-react";
import {
  api,
  post,
  toPaise,
  money,
  entryLabel,
  ApiError,
  operationStorageKey,
  type Customer,
  type Draft,
  type EntryType,
  type Receipt,
  type Pending,
} from "./api";
import { Modal } from "./components";
import { VoiceCapture } from "./VoiceCapture";
import { useSavedOperation } from "./useSavedOperation";
import { captureLocale } from "./locales";

const STORAGE = "vishwas.pending";
function stored<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
export function Capture({
  customers,
  onClose,
  onPosted,
  voiceAvailable = false,
  voiceLanguages = [],
  scopeId = "local-shop",
  hosted = false,
}: {
  customers: Customer[];
  onClose: () => void;
  onPosted: (r: Receipt) => void;
  voiceAvailable?: boolean;
  voiceLanguages?: string[];
  scopeId?: string;
  hosted?: boolean;
}) {
  const pendingKey = operationStorageKey(STORAGE, hosted, scopeId);
  const draftKey = operationStorageKey("vishwas.draft", hosted, scopeId);
  const receiptKey = operationStorageKey("vishwas.lastReceipt", hosted, scopeId);
  const [mode, setMode] = useState<"typed" | "sentence">("typed");
  const [cid, setCid] = useState("");
  const [kind, setKind] = useState<EntryType>("CREDIT_GIVEN");
  const [amount, setAmount] = useState("");
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const locale = captureLocale(language);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<Pending | null>(
    stored<Pending>(pendingKey),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const lastVoiceText = useRef<string | null>(null);
  function changeVoiceSelection(next: string, field: "customer" | "language") {
    if (lastVoiceText.current !== null && transcript === lastVoiceText.current)
      setTranscript("");
    lastVoiceText.current = null;
    if (field === "customer") setCid(next);
    else setLanguage(next);
  }
  const [draftIntent, saveDraftIntent] = useSavedOperation<{
    key: string;
    body: Record<string, unknown>;
  }>(operationStorageKey("vishwas.draft-intent.v1", hosted, scopeId));
  const name =
    customers.find((c) => c.id === (draft?.proposed.customer_id || cid))
      ?.display_name || "Select a customer";
  function adopt(d: Draft) {
    setDraft(d);
    setCid(d.proposed.customer_id || "");
    setKind(d.proposed.entry_type || "CREDIT_GIVEN");
    setAmount(
      d.proposed.amount_paise != null
        ? String(d.proposed.amount_paise / 100)
        : "",
    );
    setEditing(d.needs_review);
    localStorage.setItem(draftKey, d.draft_id);
  }
  useEffect(() => {
    const id = pending?.draft_id || localStorage.getItem(draftKey);
    if (id) {
      setBusy(true);
      api<Draft>("/ledger/drafts/" + id)
        .then((d) => {
          adopt(d);
          if (["CANCELLED", "REJECTED", "EXPIRED"].includes(d.state)) {
            localStorage.removeItem(draftKey);
            if (!pending) setDraft(null);
          }
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
  }, []);
  async function run(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    await run(async () => {
      const data =
        draftIntent?.body ||
        (mode === "typed"
          ? {
              transcript: "",
              language,
              parsed_override: {
                customer_id: cid,
                entry_type: kind,
                amount_paise: toPaise(amount),
                currency: "INR",
              },
            }
          : { transcript, language, ...(cid ? { customer_id: cid } : {}) });
      const intent = draftIntent || { key: crypto.randomUUID(), body: data };
      saveDraftIntent(intent);
      let d: Draft;
      try {
        d = await post<Draft>("/ledger/drafts", data, {
          "Client-Operation-Id": intent.key,
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) saveDraftIntent(null);
        throw e;
      }
      saveDraftIntent(null);
      if (d.state === "REJECTED") {
        setError(
          "This sentence cannot create a ledger draft. Enter the customer, amount and type directly.",
        );
        return;
      }
      adopt(d);
    });
  }
  async function save() {
    if (!draft) return;
    await run(async () => {
      const d = await api<Draft>("/ledger/drafts/" + draft.draft_id, {
        method: "PATCH",
        body: JSON.stringify({
          expected_version: draft.version,
          customer_id: cid,
          entry_type: kind,
          amount_paise: toPaise(amount),
        }),
      });
      adopt(d);
      setEditing(false);
    });
  }
  async function confirm() {
    if (!draft) return;
    await run(async () => {
      const operation = pending || {
        draft_id: draft.draft_id,
        version: draft.version,
        key: crypto.randomUUID(),
      };
      localStorage.setItem(pendingKey, JSON.stringify(operation));
      setPending(operation);
      try {
        const result = await post<Receipt>(
          "/ledger/drafts/" + operation.draft_id + "/confirm",
          { confirm: true, expected_version: operation.version },
          { "Idempotency-Key": operation.key },
        );
        localStorage.setItem(
          receiptKey,
          JSON.stringify({ operation, result }),
        );
        localStorage.removeItem(pendingKey);
        localStorage.removeItem(draftKey);
        onPosted(result);
      } catch (e) {
        if (e instanceof ApiError && e.code === "ALREADY_CONFIRMED") {
          const current = await api<Draft>(
            "/ledger/drafts/" + operation.draft_id,
          );
          if (current.state === "CONFIRMED" && current.posted_result) {
            localStorage.removeItem(pendingKey);
            localStorage.removeItem(draftKey);
            onPosted(current.posted_result);
            return;
          }
        }
        if (
          e instanceof ApiError &&
          [
            "VERSION_CONFLICT",
            "DRAFT_EXPIRED",
            "DRAFT_TERMINAL",
            "NEEDS_REVIEW",
          ].includes(e.code)
        ) {
          const current = await api<Draft>(
            "/ledger/drafts/" + operation.draft_id,
          );
          if (current.posted_result) {
            localStorage.removeItem(pendingKey);
            localStorage.removeItem(draftKey);
            onPosted(current.posted_result);
            return;
          }
          localStorage.removeItem(pendingKey);
          setPending(null);
          if (["EXPIRED", "CANCELLED", "REJECTED"].includes(current.state)) {
            localStorage.removeItem(draftKey);
            setDraft(null);
          } else adopt(current);
        }
        // Definitive validation rejection means no money posted. Transport/server uncertainty retains the exact key.
        if (e instanceof ApiError && e.status === 422) {
          localStorage.removeItem(pendingKey);
          setPending(null);
        }
        throw e;
      }
    });
  }
  async function cancel() {
    if (!draft) return onClose();
    await run(async () => {
      await post("/ledger/drafts/" + draft.draft_id + "/cancel");
      localStorage.removeItem(draftKey);
      onClose();
    });
  }
  const fields = (
    <div className="field-grid">
      <label className="span-two">
        Customer
        <select value={cid} onChange={(e) => setCid(e.target.value)} required>
          <option value="">Select customer by name and ID</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name} · {c.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Transaction type
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EntryType)}
        >
          <option value="CREDIT_GIVEN">Credit given (+ receivable)</option>
          <option value="REPAYMENT_RECEIVED">
            Repayment received (− receivable)
          </option>
        </select>
      </label>
      <label>
        Exact amount in rupees
        <div className="rupee-input">
          <span>₹</span>
          <input
            aria-label="Exact amount in rupees"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </label>
    </div>
  );
  return (
    <Modal
      title={draft ? "Review your entry" : "Record a transaction"}
      onClose={onClose}
      error={error}
      wide
    >
      <div className="steps">
        <span className="complete">1 · Capture</span>
        <span className={draft ? "complete" : ""}>2 · Review</span>
        <span>3 · Confirm</span>
      </div>
      {!draft ? (
        <>
          {draftIntent && (
            <div className="notice">
              A draft response is unresolved. Its original details are saved; no
              money has been posted.
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void create()}
              >
                Recover saved draft
              </button>
            </div>
          )}
          {!hosted && <div className="mode-tabs">
            <button
              className={mode === "typed" ? "active" : ""}
              onClick={() => setMode("typed")}
            >
              Exact fields
            </button>
            <button
              className={mode === "sentence" ? "active" : ""}
              onClick={() => setMode("sentence")}
            >
              Type / speak a sentence
            </button>
          </div>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <fieldset disabled={!!draftIntent}>
              {mode === "typed" ? (
                fields
              ) : (
                <>
                  <VoiceCapture
                    key={`${scopeId}:${language}:${cid}`}
                    language={language}
                    providerAvailable={
                      voiceAvailable && voiceLanguages.includes(language)
                    }
                    onTranscript={(value) => {
                      lastVoiceText.current = value.transcript;
                      setTranscript(value.transcript);
                    }}
                    onActivity={setVoiceBusy}
                  />
                  <label>
                    Language
                    <select
                      aria-label="Speech language"
                      value={language}
                      disabled={voiceBusy}
                      onChange={(e) =>
                        changeVoiceSelection(e.target.value, "language")
                      }
                    >
                      <option value="en-IN">English (India)</option>
                      <option value="hi-IN">हिन्दी · Hindi</option>
                      <option value="te-IN">తెలుగు · Telugu</option>
                    </select>
                  </label>
                  <p className="caption" role="status">
                    {voiceAvailable && voiceLanguages.includes(language)
                      ? "Selected speech language individually verified; every returned detail still needs review."
                      : "Selected speech language is unverified. Local recording and typed correction remain available."}
                  </p>
                  <label>
                    Sentence or corrected transcript
                    <textarea
                      lang={locale.lang}
                      value={transcript}
                      readOnly={voiceBusy}
                      onChange={(e) => setTranscript(e.target.value)}
                      maxLength={500}
                      placeholder={locale.example}
                      required
                    />
                  </label>
                  <p className="caption" lang={locale.lang}>{locale.review}</p>
                  <label>
                    Customer (select the exact ID)
                    <select
                      value={cid}
                      onChange={(e) =>
                        changeVoiceSelection(e.target.value, "customer")
                      }
                    >
                      <option value="">
                        Let parser suggest; ambiguous names require selection
                      </option>
                      {customers.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.display_name} · {c.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="caption">
                    Deterministic parser supports numeric English
                    credit/returned sentences and the documented Hindi/Telugu
                    demo examples. Unclear details require editing.
                  </p>
                </>
              )}
              <div className="trust-note">
                <ShieldCheck size={18} />
                Nothing is posted until you review and confirm.
              </div>
              <button
                className="primary full"
                disabled={busy || voiceBusy || !!draftIntent}
              >
                {busy ? "Preparing draft…" : "Review draft"}
                <ArrowRight size={18} />
              </button>
            </fieldset>
          </form>
        </>
      ) : (
        <>
          {pending && (
            <div className="notice">
              A confirmation may be pending. Retry uses the original key and
              version, including after refresh. Details stay locked until
              resolved.
            </div>
          )}
          {editing && !pending ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {fields}
              <button className="primary full" disabled={busy}>
                Save revised draft <Check size={17} />
              </button>
            </form>
          ) : (
            <div className="review-card">
              <span className="eyebrow">
                {entryLabel(draft.proposed.entry_type || "Needs clarification")}
              </span>
              <strong>{money(draft.proposed.amount_paise)}</strong>
              <h3>{name}</h3>
              <p>
                {draft.proposed.customer_id} · draft v{draft.version} ·{" "}
                {draft.source}
              </p>
              <div>
                {draft.proposed.entry_type === "CREDIT_GIVEN"
                  ? "Increases the amount this customer owes your shop."
                  : "Reduces the amount this customer owes your shop."}
              </div>
              <small>
                This does not verify a payment settlement or revenue.
              </small>
            </div>
          )}
          {!editing && draft.state !== "REJECTED" && (
            <div className="review-actions">
              <button
                className="secondary"
                disabled={busy || !!pending || draft.state === "CONFIRMED"}
                onClick={() => setEditing(true)}
              >
                <Pencil size={16} />
                Edit details
              </button>
              <button
                className="primary"
                disabled={
                  busy || (!pending && draft.state !== "AWAITING_CONFIRMATION")
                }
                onClick={() => void confirm()}
              >
                <Check size={18} />
                {busy
                  ? "Verifying…"
                  : pending
                    ? "Retry original confirmation"
                    : "Confirm and post"}
              </button>
            </div>
          )}
          <button
            className="text-button danger"
            disabled={busy || !!pending || draft.state === "CONFIRMED"}
            onClick={() => void cancel()}
          >
            Cancel this draft
          </button>
          <p className="caption">
            Draft expires{" "}
            {new Date(draft.expires_at).toLocaleTimeString("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            IST. Posted entries are immutable; corrections use a separate
            reversal.
          </p>
        </>
      )}
    </Modal>
  );
}
