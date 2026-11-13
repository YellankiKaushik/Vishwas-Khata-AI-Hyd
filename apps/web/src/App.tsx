import { useEffect, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Users,
  ListOrdered,
  Sparkles,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  ChevronRight,
  Search,
  ShieldCheck,
  Menu,
  X,
  Download,
  RefreshCw,
  CalendarDays,
  ClipboardCheck,
  Mic,
  Check,
  ReceiptText,
  Footprints,
  CheckCircle2,
} from "lucide-react";
import {
  api,
  ApiError,
  post,
  money,
  entryLabel,
  toPaise,
  businessToday,
  type Merchant,
  type Customer,
  type Entry,
  type Receipt,
  type Pending,
  operationStorageKey,
  type Insights,
  type Briefing,
} from "./api";
import { Capture } from "./Capture";
import { BriefingAudio } from "./BriefingAudio";
import { MerchantAssistant } from "./MerchantAssistant";
import { useSavedOperation } from "./useSavedOperation";
import { Modal, Journal, Empty, Success } from "./components";
import "./style.css";

type View = "overview" | "customers" | "journal" | "briefing" | "assistant";
type Suggestion = {
  id: string;
  customer_id: string;
  reason_code: string;
  state: string;
  created_at: string;
};
const nav = [
  { id: "overview" as View, label: "Overview", icon: LayoutDashboard },
  { id: "customers" as View, label: "Customers", icon: Users },
  { id: "journal" as View, label: "Your journal", icon: ListOrdered },
  { id: "briefing" as View, label: "Daily briefing", icon: Sparkles },
  { id: "assistant" as View, label: "Merchant Assistant", icon: ClipboardCheck },
];
const slotNames = [
  "Your recorded activity",
  "Your records, in shape",
  "A customer to check in on",
  "A thoughtful what-if",
];
const slotIcons = [ReceiptText, ClipboardCheck, Footprints, Sparkles];

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [ready, setReady] = useState<{
    voice_live_verified: boolean;
    tts_live_verified?: boolean;
    stt_verified_languages?: string[];
    tts_verified_languages?: string[];
    voice_provider: string;
    synthetic_clock: string | null;
    hyd_enabled?: boolean;
    hosted?: boolean;
  } | null>(null);
  const hosted = ready?.hosted === true;
  const receiptKey = operationStorageKey("vishwas.lastReceipt", hosted, merchant?.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [capture, setCapture] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width:650px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width:650px)");
    const update = () => setIsMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [customerModal, setCustomerModal] = useState(false);
  const [reverse, setReverse] = useState<Entry | null>(null);
  const [reason, setReason] = useState("");
  const [reversalKey, setReversalKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportDate, setReportDate] = useState(businessToday());
  const [insights, setInsights] = useState<Insights | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [factsError, setFactsError] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [observation, setObservation] = useState<"sales" | "visits" | null>(
    null,
  );
  const [obsAmount, setObsAmount] = useState("");
  const [obsCustomer, setObsCustomer] = useState("");
  const [obsTime, setObsTime] = useState("");
  const [obsKey, setObsKey] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [voidRecord, setVoidRecord] = useState<{
    id: string;
    kind: "sales" | "visits";
  } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [revision, setRevision] = useState(0);
  const [pendingObservation, saveObservation] = useSavedOperation<{
    kind: "sales" | "visits";
    body: Record<string, unknown>;
  }>("vishwas.observation.v1");
  const [pendingReversal, saveReversal] = useSavedOperation<{
    entry_id: string;
    key: string;
    reason: string;
  }>(operationStorageKey("vishwas.reversal.v1", hosted, merchant?.id));

  async function submitObservation() {
    await action(async () => {
      if (!pendingObservation && !observation) return;
      if (!pendingObservation && observation === "visits" && !obsCustomer)
        throw new Error("Select the exact customer ID before recording a visit.");
      const operation = pendingObservation || {
        kind: observation!,
        body: {
          source: "MANUAL_OBSERVATION",
          client_operation_id: obsKey,
          observed_at: new Date(obsTime + ":00+05:30").toISOString(),
          ...(observation === "sales"
            ? { amount_paise: toPaise(obsAmount) }
            : { customer_id: obsCustomer }),
        },
      };
      saveObservation(operation);
      try {
        await post("/observations/" + operation.kind, operation.body);
      } catch (e) {
        if (e instanceof ApiError && [403, 404, 422].includes(e.status))
          saveObservation(null);
        throw e;
      }
      saveObservation(null);
      setObservation(null);
      setRevision((x) => x + 1);
      setMessage(
        "Synthetic observation recorded once. Supporting facts are recalculated.",
      );
    });
  }

  async function submitReversal() {
    await action(async () => {
      if (!pendingReversal && !reverse) return;
      const operation = pendingReversal || {
        entry_id: reverse!.entry_id,
        key: reversalKey,
        reason,
      };
      saveReversal(operation);
      try {
        await post(
          "/ledger/entries/" + operation.entry_id + "/reverse",
          { confirm: true, reason: operation.reason },
          { "Idempotency-Key": operation.key },
        );
      } catch (e) {
        if (e instanceof ApiError && [404, 409, 422].includes(e.status))
          saveReversal(null);
        throw e;
      }
      saveReversal(null);
      setReverse(null);
      await load();
      setMessage("Reversal posted once. The original entry is preserved.");
    });
  }

  async function load() {
    setError("");
    try {
      // Preserve the current trusted session across refreshes and successful writes.
      // A new demo session is needed only when the existing one is absent/expired.
      try {
        await api<Merchant>("/merchants/me");
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401) throw e;
        await post("/demo/session");
      }
      const [m, cs, j, r] = await Promise.all([
        api<Merchant>("/merchants/me"),
        api<Customer[]>("/customers?limit=50"),
        api<{ items: Entry[]; next_cursor: string | null }>(
          "/ledger/entries?limit=100",
        ),
        api<NonNullable<typeof ready>>("/health/ready"),
      ]);
      const balances = await Promise.all(
        cs.map((c) =>
          api<{ outstanding_balance_paise: number }>(
            `/customers/${c.id}/balance`,
          ),
        ),
      );
      setMerchant(m);
      setCustomers(
        cs.map((c, i) => ({
          ...c,
          balance: balances[i].outstanding_balance_paise,
        })),
      );
      setEntries(j.items);
      setCursor(j.next_cursor);
      setReady(r);
      if (r.synthetic_clock)
        setReportDate(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(r.synthetic_clock)),
        );
      setRevision((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!merchant || hosted) return;
    let stopped = false;
    setInsights(null);
    setBriefing(null);
    setFactsError("");
    Promise.all([
      api<Insights>("/insights/daily?date=" + reportDate),
      api<Briefing>("/briefings/daily?date=" + reportDate),
      api<{ items: Suggestion[] }>("/suggestions"),
    ])
      .then(([i, b, s]) => {
        if (!stopped) {
          setInsights(i);
          setBriefing(b);
          setSuggestions(s.items);
        }
      })
      .catch((e) => {
        if (!stopped) setFactsError(e.message);
      });
    return () => {
      stopped = true;
    };
  }, [merchant?.id, reportDate, revision, hosted]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (hosted && e instanceof ApiError && e.status === 401) await load();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(v: View) {
    setView(v);
    setMobileNav(false);
    setSelected(null);
    setMessage("");
  }
  const total = customers.reduce((s, c) => s + (c.balance || 0), 0);
  const outstanding = customers.filter((c) => (c.balance || 0) > 0);
  const gap = insights?.visit_observations.find(
    (g) => g.status === "RECORDED_GAP",
  );
  const activeSuggestion = suggestions.find(
    (s) => s.customer_id === gap?.customer_id,
  );
  async function posted(r: Receipt) {
    setCapture(false);
    setReceipt(r);
    setMessage(
      `${entryLabel(r.entry_type)} posted once. Receipt balance: ${money(r.outstanding_balance_paise)}. Current balances are shown on the dashboard.`,
    );
    await load();
  }
  async function retryLast() {
    await action(async () => {
      const saved = JSON.parse(
        localStorage.getItem(receiptKey) || "null",
      ) as { operation: Pending; result: Receipt } | null;
      if (!saved)
        throw new Error("Complete one confirmation in this browser first.");
      const r = await post<Receipt>(
        "/ledger/drafts/" + saved.operation.draft_id + "/confirm",
        { confirm: true, expected_version: saved.operation.version },
        { "Idempotency-Key": saved.operation.key },
      );
      if (r.entry_id !== saved.result.entry_id)
        throw new Error("Unexpected replay result. Inspect the journal.");
      setMessage(
        `Replay verified: same entry ${r.entry_id.slice(-10)}. No duplicate money.`,
      );
      await load();
    });
  }
  async function more() {
    await action(async () => {
      const result = await api<{ items: Entry[]; next_cursor: string | null }>(
        "/ledger/entries?limit=100&cursor=" + cursor,
      );
      setEntries((prev) => [
        ...prev,
        ...result.items.filter(
          (e) => !prev.some((x) => x.entry_id === e.entry_id),
        ),
      ]);
      setCursor(result.next_cursor);
    });
  }
  async function exportLedger() {
    await action(async () => {
      let all: Entry[] = [],
        next: string | null = null;
      do {
        const result: { items: Entry[]; next_cursor: string | null } =
          await api(
            "/ledger/entries?limit=100" + (next ? "&cursor=" + next : ""),
          );
        all.push(...result.items);
        next = result.next_cursor;
      } while (next);
      const csv = [
        "entry_id,customer_id,entry_type,amount_paise_signed,posted_at,source,simulated",
        ...all.map((e) =>
          [
            e.entry_id,
            e.customer_id,
            e.entry_type,
            e.amount_paise_signed,
            e.posted_at,
            e.source,
            true,
          ].join(","),
        ),
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "vishwas-synthetic-journal.csv";
      a.click();
      URL.revokeObjectURL(url);
      setMessage(
        "Synthetic journal exported in integer paise. Names are omitted from the CSV.",
      );
    });
  }
  function openObservation(kind: "sales" | "visits") {
    if (pendingObservation) {
      setError(
        "Resolve the saved observation before creating another. Use Retry saved observation.",
      );
      return;
    }
    setObservation(kind);
    setObsCustomer("");
    setObsAmount("");
    setObsTime(
      new Date(ready?.synthetic_clock || Date.now())
        .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
        .replace(" ", "T")
        .slice(0, 16),
    );
    setObsKey(crypto.randomUUID());
    setError("");
  }
  const observationSources = insights
    ? [
        ...new Set(
          insights.facts
            .filter(
              (f) =>
                f.fact_id === "f_sales" || f.fact_id.startsWith("f_visits_"),
            )
            .flatMap((f) => f.source_event_ids),
        ),
      ]
    : [];
  const sourceDetails = (
    <details className="source-details">
      <summary>Inspect supporting facts & sources</summary>
      <div>
        <p>
          Business date {insights?.date} · Asia/Kolkata
          <br />
          Window [{insights?.window_start_utc}, {insights?.window_end_utc})
          <br />
          Evidence cutoff: {insights?.as_of}
        </p>
        {insights?.facts.map((f) => (
          <div className="fact" key={f.fact_id}>
            <strong>
              {f.metric}: {String(f.value ?? "NO_DATA")}
            </strong>
            <span>
              {f.fact_id} · {f.method} · {f.coverage_status}
            </span>
            <code>
              {[...f.source_entry_ids, ...f.source_event_ids].join(", ") ||
                "No contributing records"}
            </code>
          </div>
        ))}
        <small>Facts hash: {insights?.facts_hash}</small>
        {observationSources.length > 0 && (
          <div className="source-corrections">
            <h3>Correct a recorded observation</h3>
            <p>
              Voiding appends a reasoned correction. The original event remains
              in the database.
            </p>
            {observationSources.map((id) => (
              <div key={id}>
                <code>{id}</code>
                <button
                  className="text-button"
                  aria-label={"Void observation " + id}
                  onClick={() => {
                    setError("");
                    setVoidReason("");
                    setVoidRecord({
                      id,
                      kind: insights!.facts
                        .find((f) => f.fact_id === "f_sales")
                        ?.source_event_ids.includes(id)
                        ? "sales"
                        : "visits",
                    });
                  }}
                >
                  Review void
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );

  return (
    <div className="app-shell">
      <aside
        id="merchant-navigation"
        className={`sidebar ${mobileNav ? "open" : ""}`}
        inert={isMobile && !mobileNav ? true : undefined}
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <BookOpen size={23} />
          </span>
          <div>
            Vishwas-Khata-AI<span>HYDERABAD</span>
          </div>
        </a>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        >
          <X />
        </button>
        <div className="workspace-label">MERCHANT WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.filter((n) => (n.id !== "assistant" || ready?.hyd_enabled) && (!hosted || n.id !== "briefing")).map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              aria-current={view === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "briefing" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={23} />
            <strong>Built on your confirmation.</strong>
            <p>
              You review. You approve.
              <br />
              Your khata stays in your hands.
            </p>
          </div>
          <div className="merchant-mini">
            <span>K</span>
            <div>
              <strong>{merchant?.display_name || "Kirana Demo Shop"}</strong>
              <small>{hosted ? "Hosted synthetic workspace" : "Local synthetic workspace"}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            aria-expanded={mobileNav}
            aria-controls="merchant-navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="top-status">
            <span className="status-dot" />
            {hosted ? "Hosted demo" : "Local demo"} <span className="synthetic-badge">SYNTHETIC DATA</span>
            <div className="avatar">K</div>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR SHOP, IN CLEAR VIEW</div>
              <h1>
                {view === "overview"
                  ? "A little clarity. A better day."
                  : view === "customers"
                    ? "People behind your khata."
                    : view === "journal"
                      ? "Every entry, accounted for."
                      : view === "assistant" ? "Merchant Assistant" : "Your day. Four useful things."}
              </h1>
              <p>
                {view === "overview"
                  ? `Welcome to ${merchant?.display_name || "your shop"}. Let’s keep business simple.`
                  : view === "customers"
                    ? "Synthetic customer labels, exact balances and a clear history."
                    : view === "journal"
                      ? "An immutable record of credit, repayments and reviewed corrections."
                      : view === "assistant" ? "Review repayment commitments and prepare follow-up drafts." : "A grounded briefing from your records, with the evidence close by."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setError("");
                setCapture(true);
              }}
              disabled={loading || !merchant}
            >
              <Plus size={19} />
              Record transaction
            </button>
          </div>
          <div className="demo-strip">
            <ShieldCheck size={15} />
            <span>
              Independent hackathon prototype · invented customers and records ·
              no Paytm data or payment integration
            </span>
          </div>
          {ready?.synthetic_clock && (
            <div className="notice">
              Synthetic replay clock: {ready.synthetic_clock}. Entries and
              reports use this declared time.
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {message && <Success text={message} />}
          {!hosted && pendingObservation && (
            <div className="notice" role="status">
              An observation response is unresolved. Its original data and
              operation ID are saved.
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void submitObservation()}
              >
                Retry saved observation
              </button>
            </div>
          )}
          {pendingReversal && (
            <div className="notice" role="status">
              A reversal response is unresolved. Its original entry, reason and
              key are saved.
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void submitReversal()}
              >
                Retry saved reversal
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <RefreshCw className="spin" />
              <h3>Opening your khata…</h3>
            </div>
          ) : !merchant ? (
            <Empty
              title="Couldn’t open your shop"
              text="Check that the API is running, then refresh the workspace."
            />
          ) : (
            <>
              {view === "overview" && (
                <>
                  <div className="stats-grid">
                    <section className="receivables-card">
                      <div>
                        <span className="eyebrow">TOTAL OUTSTANDING</span>
                        <span className="mini-tag">LIVE LEDGER</span>
                      </div>
                      <strong data-testid="total-outstanding">
                        {money(total)}
                      </strong>
                      <p>
                        To collect across {outstanding.length}{" "}
                        {outstanding.length === 1 ? "customer" : "customers"}
                      </p>
                      <div className="balance-foot">
                        <span>Sum of signed journal entries</span>
                        <button
                          onClick={() => navigate("customers")}
                          aria-label="View outstanding customers"
                        >
                          <ArrowUpRight size={21} />
                        </button>
                      </div>
                    </section>
                    <section className="stat-card">
                      <span className="stat-symbol">
                        <ArrowUpRight size={21} />
                      </span>
                      <span>Credit given</span>
                      <strong>
                        {insights ? money(insights.credit_given_paise) : "—"}
                      </strong>
                      <p>Receivables added · {reportDate}</p>
                      <small>Credit is separate from sales.</small>
                    </section>
                    <section className="stat-card">
                      <span className="stat-symbol green">
                        <ArrowDownLeft size={21} />
                      </span>
                      <span>Repayments recorded</span>
                      <strong>
                        {insights
                          ? money(insights.repayments_received_paise)
                          : "—"}
                      </strong>
                      <p>Receivables reduced · {reportDate}</p>
                      <small>Settlement is unverified.</small>
                    </section>
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">THE DAY-TO-DAY</span>
                          <h2>Recent activity</h2>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("journal")}
                        >
                          View journal <ArrowRight size={15} />
                        </button>
                      </div>
                      <Journal
                        entries={entries.slice(0, 5)}
                        customers={customers}
                      />
                      <div className="panel-footer">
                        <ShieldCheck size={15} />
                        <span>Every entry begins with your confirmation.</span>
                      </div>
                    </section>
                    <section className="insight-card">
                      <div className="insight-label">
                        <Sparkles size={17} />
                        FROM YOUR RECORDS
                      </div>
                      <h2>
                        {gap
                          ? `${gap.display_name} comes to mind.`
                          : "Good records. Clearer decisions."}
                      </h2>
                      <p>
                        {gap
                          ? `No visit recorded in ${gap.gap_days} days. The sample shows a median interval of ${gap.median_interval_days} days.`
                          : "Open the daily briefing to see what your recorded activity supports, and where more data is needed."}
                      </p>
                      {gap && (
                        <span className="gap-pill">
                          {gap.recorded_dates.length} recorded dates ·{" "}
                          {gap.threshold_days}-day threshold
                        </span>
                      )}
                      <p className="small-muted">
                        {gap?.disclaimer ||
                          "Missing records mean unknown activity. Suggestions are always yours to act on."}
                      </p>
                      <button
                        className="secondary"
                        onClick={() => navigate("briefing")}
                      >
                        See the evidence <ArrowRight size={16} />
                      </button>
                    </section>
                  </div>
                  <div className="lower-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">A QUICK CHECK-IN</span>
                          <h2>Outstanding customers</h2>
                        </div>
                        <Users size={21} />
                      </div>
                      {outstanding.length ? (
                        outstanding.slice(0, 4).map((c) => (
                          <button
                            className="customer-line"
                            key={c.id}
                            onClick={() => {
                              navigate("customers");
                              setSelected(c.id);
                            }}
                          >
                            <span className="customer-avatar">
                              {c.display_name[0]}
                            </span>
                            <div>
                              <strong>{c.display_name}</strong>
                              <small>{c.id}</small>
                            </div>
                            <b>{money(c.balance)}</b>
                            <ChevronRight size={16} />
                          </button>
                        ))
                      ) : (
                        <div className="simple-empty">
                          No customer has an outstanding balance yet.
                        </div>
                      )}
                    </section>
                    <section className="recording-card">
                      <div className="circle-icon">
                        <Mic size={24} />
                      </div>
                      <div>
                        <span className="eyebrow">{hosted ? "REVIEW. CONFIRM." : "SPEAK. REVIEW. CONFIRM."}</span>
                        <h2>A khata that keeps up with you.</h2>
                        <p>
                          {hosted ? "Use exact fields and review each detail before posting." :
                            "Use exact fields or a simple sentence. Check every detail before it becomes a record."}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => setCapture(true)}
                        >
                          Make an entry <ArrowRight size={16} />
                        </button>
                      </div>
                    </section>
                  </div>
                </>
              )}
              {view === "customers" && (
                <>
                  <div className="toolbar">
                    <div className="search-input">
                      <Search size={18} />
                      <input
                        aria-label="Search customers"
                        placeholder="Search customer name or ID…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <button
                      className="secondary"
                      hidden={hosted}
                      onClick={() => {
                        setError("");
                        setCustomerModal(true);
                        setNewName("");
                      }}
                    >
                      <Plus size={17} />
                      Add synthetic customer
                    </button>
                  </div>
                  <div className="customer-grid">
                    {customers
                      .filter((c) =>
                        (c.display_name + " " + c.id)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((c) => (
                        <button
                          key={c.id}
                          className={`customer-card ${selected === c.id ? "selected" : ""}`}
                          onClick={() =>
                            setSelected(selected === c.id ? null : c.id)
                          }
                        >
                          <div>
                            <span className="customer-avatar">
                              {c.display_name[0]}
                            </span>
                            <ChevronRight size={18} />
                          </div>
                          <h2>{c.display_name}</h2>
                          <small>{c.id}</small>
                          <span className="caption">
                            Outstanding receivable
                          </span>
                          <strong>{money(c.balance)}</strong>
                        </button>
                      ))}
                  </div>
                  {selected && (
                    <section className="panel customer-history">
                      <div className="section-heading">
                        <h2>
                          {
                            customers.find((c) => c.id === selected)
                              ?.display_name
                          }{" "}
                          · activity
                        </h2>
                        <span>{selected}</span>
                      </div>
                      <Journal
                        entries={entries}
                        customers={customers}
                        selected={selected}
                        onMore={cursor ? () => void more() : undefined}
                      />
                    </section>
                  )}
                </>
              )}
              {view === "journal" && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Your signed journal</h2>
                      <p className="caption">
                        + increases receivables · − reduces receivables · all
                        entries are synthetic
                      </p>
                    </div>
                    <div className="button-row">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void retryLast()}
                      >
                        <RefreshCw size={15} />
                        Verify last retry
                      </button>
                      <button
                        className="secondary"
                        onClick={() => void exportLedger()}
                        disabled={busy}
                      >
                        <Download size={16} />
                        Export
                      </button>
                    </div>
                  </div>
                  <Journal
                    entries={entries}
                    customers={customers}
                    onReverse={(e) => {
                      if (pendingReversal) {
                        setError(
                          "Resolve the saved reversal before creating another.",
                        );
                        return;
                      }
                      setError("");
                      setReverse(e);
                      setReason("");
                      setReversalKey(crypto.randomUUID());
                    }}
                    onMore={cursor ? () => void more() : undefined}
                  />
                </section>
              )}
              {view === "assistant" && merchant && ready?.hyd_enabled && (
                <MerchantAssistant key={merchant.id + ":" + revision} merchantId={merchant.id} customers={customers} />
              )}
              {view === "briefing" && (
                <>
                  <div className="toolbar">
                    <label className="date-select">
                      <CalendarDays size={17} />
                      Business date{" "}
                      <input
                        type="date"
                        aria-label="Briefing business date"
                        max={businessToday()}
                        value={reportDate}
                        onChange={(e) =>
                          e.target.value && setReportDate(e.target.value)
                        }
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className="secondary"
                        onClick={() => openObservation("sales")}
                      >
                        <ReceiptText size={16} />
                        Record sale observation
                      </button>
                      <button
                        className="secondary"
                        onClick={() => openObservation("visits")}
                      >
                        <Footprints size={16} />
                        Record visit
                      </button>
                    </div>
                  </div>
                  <div className="briefing-banner">
                    <span className="circle-icon">
                      <Sparkles />
                    </span>
                    <div>
                      <span className="eyebrow">
                        YOUR DAILY BUSINESS PARTNER
                      </span>
                      <h2>A useful pause, before the next customer.</h2>
                      <p>
                        Four deterministic sections. Recorded facts. Your
                        decisions.
                      </p>
                    </div>
                    <BriefingAudio
                      key={briefing?.briefing_id || "loading"}
                      briefingId={briefing?.briefing_id || ""}
                      enabled={
                        !!(
                          ready?.tts_live_verified &&
                          ready.tts_verified_languages?.includes(
                            briefing?.language || "",
                          )
                        )
                      }
                    />
                  </div>
                  {factsError ? (
                    <div className="error">
                      Briefing unavailable: {factsError}
                      <button
                        className="text-button"
                        onClick={() => setRevision((r) => r + 1)}
                      >
                        Retry facts
                      </button>
                    </div>
                  ) : !briefing ? (
                    <div className="loading">
                      Preparing evidence-backed briefing…
                    </div>
                  ) : (
                    <div className="briefing-grid">
                      {briefing.slots.map((slot, i) => {
                        const Icon = slotIcons[i];
                        return (
                          <section className="briefing-slot" key={slot.type}>
                            <div className="slot-top">
                              <span className="slot-number">0{i + 1}</span>
                              <Icon size={22} />
                            </div>
                            <h2>{slotNames[i]}</h2>
                            <p>{slot.text}</p>
                            <div className="slot-sources">
                              <ShieldCheck size={13} />
                              {slot.fact_ids.join(" · ") ||
                                "Insufficient supporting data"}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  )}
                  {gap && (
                    <section className="manual-action">
                      <div>
                        <h3>A check-in is your choice.</h3>
                        <p>
                          Review {gap.display_name}’s recorded gap. No message
                          is sent by this application.
                        </p>
                      </div>
                      {activeSuggestion?.state === "PROPOSED" ? (
                        <div className="button-row">
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await api(
                                  "/suggestions/" + activeSuggestion.id,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      state: "DISMISSED",
                                    }),
                                  },
                                );
                                setRevision((x) => x + 1);
                              })
                            }
                          >
                            Dismiss
                          </button>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await api(
                                  "/suggestions/" + activeSuggestion.id,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      state: "DONE_MANUALLY",
                                    }),
                                  },
                                );
                                setRevision((x) => x + 1);
                              })
                            }
                          >
                            <Check size={16} />
                            Mark handled manually
                          </button>
                        </div>
                      ) : (
                        <span className="mini-tag">
                          {activeSuggestion?.state || "Evidence available"}
                        </span>
                      )}
                    </section>
                  )}
                  {insights && (
                    <>
                      {sourceDetails}
                      <div className="provenance-line">
                        {briefing?.mode} · English · synthetic data ·{" "}
                        {insights.observation_coverage} · no complete-sales
                        claim
                      </div>
                    </>
                  )}
                  <p className="caption">
                    For the original fixture walkthrough, select 27 October
                    2026: Priya’s recorded gap is exactly 12 days. A later
                    report calculates the later gap.
                  </p>
                </>
              )}
              <footer>
                <span>
                  Vishwas-Khata-AI <i>·</i> Team Tic Tac Tech
                </span>
                <span>
                  <ShieldCheck size={13} />
                  Human confirmed. Evidence grounded.
                </span>
                <button
                  className="text-button"
                  onClick={() => void load()}
                  disabled={busy}
                >
                  <RefreshCw size={13} />
                  Refresh workspace
                </button>
              </footer>
            </>
          )}
        </main>
      </div>
      {capture && (
        <Capture
          key={merchant?.id || "no-shop"}
          scopeId={merchant?.id || "no-shop"}
          hosted={hosted}
          customers={customers}
          onClose={() => setCapture(false)}
          onPosted={(r) => void posted(r)}
          voiceAvailable={
            ready?.voice_provider === "sarvam" && ready.voice_live_verified
          }
          voiceLanguages={ready?.stt_verified_languages || []}
        />
      )}
      {customerModal && (
        <Modal
          error={error}
          title="Add a synthetic customer"
          onClose={() => setCustomerModal(false)}
        >
          <p className="caption">
            Use an invented label. Duplicate names are allowed; the unique
            customer ID keeps records separate.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await post("/customers", { display_name: newName });
                setCustomerModal(false);
                await load();
                setMessage("Synthetic customer added.");
              });
            }}
          >
            <label>
              Synthetic customer label
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={120}
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              <Plus size={17} />
              Add customer
            </button>
          </form>
        </Modal>
      )}
      {reverse && (
        <Modal
          error={error}
          title="Review a compensating reversal"
          onClose={() => setReverse(null)}
        >
          <div className="notice">
            The original entry stays in your journal. This adds{" "}
            {money(-reverse.amount_paise_signed)} to receivables. Corrections
            cannot create a negative balance.
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitReversal();
            }}
          >
            <label>
              Reason for correction
              <textarea
                value={reason}
                disabled={!!pendingReversal}
                onChange={(e) => setReason(e.target.value)}
                minLength={3}
                maxLength={240}
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              <Check size={16} />
              Confirm reversal of {entryLabel(reverse.entry_type)}
            </button>
          </form>
        </Modal>
      )}
      {observation && (
        <Modal
          error={error}
          title={
            observation === "sales"
              ? "Record a sales observation"
              : "Record a customer visit"
          }
          onClose={() => setObservation(null)}
        >
          <div className="notice">
            Synthetic, partial and unverified. An observation is separate from
            your financial journal.
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitObservation();
            }}
          >
            {observation === "sales" ? (
              <label>
                Recorded amount (₹)
                <input
                  inputMode="decimal"
                  value={obsAmount}
                  disabled={!!pendingObservation}
                  onChange={(e) => setObsAmount(e.target.value)}
                  required
                />
              </label>
            ) : (
              <label>
                Customer
                <select
                  value={obsCustomer}
                  disabled={!!pendingObservation}
                  onChange={(e) => setObsCustomer(e.target.value)}
                  required
                >
                  <option value="">Select customer by name and ID</option>
                  {customers.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.display_name} · {c.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Observed time (Asia/Kolkata)
              <input
                type="datetime-local"
                value={obsTime}
                disabled={!!pendingObservation}
                onChange={(e) => setObsTime(e.target.value)}
                required
              />
            </label>
            <button className="primary full" disabled={busy}>
              Record synthetic observation
            </button>
          </form>
        </Modal>
      )}
      {receipt && (
        <div className="receipt-toast" role="status">
          <CheckCircle2 size={24} />
          <div>
            <strong>Recorded, with your confirmation.</strong>
            <p>
              {money(receipt.outstanding_balance_paise)} outstanding in this receipt · entry{" "}
              {receipt.entry_id.slice(-8)}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss receipt"
            onClick={() => setReceipt(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {voidRecord && (
        <Modal
          error={error}
          title="Review observation correction"
          onClose={() => setVoidRecord(null)}
        >
          <div className="notice">
            Void {voidRecord.id}? The original remains. All supporting facts and
            briefing audio must be recalculated.
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await post(
                  "/observations/" +
                    voidRecord.kind +
                    "/" +
                    voidRecord.id +
                    "/void",
                  { confirm: true, reason: voidReason },
                );
                setVoidRecord(null);
                setRevision((x) => x + 1);
                setMessage(
                  "Correction appended. Facts and briefing regenerated from active sources.",
                );
              });
            }}
          >
            <label>
              Correction reason
              <textarea
                required
                minLength={5}
                maxLength={240}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </label>
            <button className="primary full" disabled={busy}>
              Confirm observation void
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
