import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import {
  type Customer,
  type Entry,
  money,
  prettyTime,
  entryLabel,
} from "./api";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  error,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current!;
    const previous = document.activeElement as HTMLElement;
    node.showModal();
    return () => {
      node.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {error && (
        <div className="error" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </div>
      )}
      {children}
    </dialog>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <ShieldCheck size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function Journal({
  entries,
  customers,
  onReverse,
  onMore,
  selected,
}: {
  entries: Entry[];
  customers: Customer[];
  onReverse?: (e: Entry) => void;
  onMore?: () => void;
  selected?: string;
}) {
  const names = new Map(customers.map((c) => [c.id, c.display_name]));
  const list = entries.filter((e) => !selected || e.customer_id === selected);
  return list.length ? (
    <div className="journal-list">
      {list.map((e) => (
        <div className="journal-row" key={e.entry_id}>
          <span
            className={`entry-icon ${e.entry_type === "REPAYMENT_RECEIVED" ? "repayment" : ""}`}
          >
            {e.entry_type === "REVERSAL" ? (
              <RotateCcw size={19} />
            ) : e.amount_paise_signed > 0 ? (
              <ArrowUpRight size={20} />
            ) : (
              <ArrowDownLeft size={20} />
            )}
          </span>
          <div className="entry-name">
            <strong>{names.get(e.customer_id) || e.customer_id}</strong>
            <span>
              {entryLabel(e.entry_type)} <i>·</i> {prettyTime(e.posted_at)}
            </span>
            <small>
              {e.entry_id.slice(-10)} · {e.source} · synthetic
            </small>
          </div>
          <div
            className={`entry-amount ${e.amount_paise_signed < 0 ? "received" : ""}`}
          >
            <strong>
              {e.amount_paise_signed > 0 ? "+" : "−"}
              {money(Math.abs(e.amount_paise_signed))}
            </strong>
            <span>receivable change</span>
          </div>
          {onReverse &&
            e.entry_type !== "REVERSAL" &&
            !entries.some((x) => x.reverses_entry_id === e.entry_id) && (
              <button
                className="icon-button subtle"
                onClick={() => onReverse(e)}
                aria-label={`Reverse ${entryLabel(e.entry_type)} ${money(Math.abs(e.amount_paise_signed))}`}
                title="Review a reversal"
              >
                <RotateCcw size={16} />
              </button>
            )}
        </div>
      ))}
      {onMore && (
        <button className="text-button" onClick={onMore}>
          Load older entries
        </button>
      )}
    </div>
  ) : (
    <Empty
      title="A fresh page in your khata"
      text="Review and confirm your first credit or repayment. Only posted entries appear here."
    />
  );
}
export function Success({ text }: { text: string }) {
  return (
    <div className="success" role="status">
      <CheckCircle2 size={18} />
      {text}
    </div>
  );
}
