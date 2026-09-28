import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Connection, extractRecentAddresses, fetchConnections } from "../utils/recentConnections";

interface RecentUsersInputProps {
  /** Addresses already in the recipient list (lowercased), to flag them in the preview. */
  existingAddresses: readonly `0x${string}`[];
  /** Adds addresses to the shared recipient list; returns how many were actually new. */
  onAddressesAdd: (addresses: `0x${string}`[]) => number;
}

const HOUR_MS = 60 * 60 * 1000;

/** Quick ranges: each returns the start of the range, the end always being now. */
export const QUICK_RANGES: { label: string; getStart: (now: Date) => Date }[] = [
  { label: "last hour", getStart: (now) => new Date(now.getTime() - HOUR_MS) },
  { label: "last 4 hours", getStart: (now) => new Date(now.getTime() - 4 * HOUR_MS) },
  { label: "today", getStart: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
  { label: "last 7 days", getStart: (now) => new Date(now.getTime() - 7 * 24 * HOUR_MS) },
];

const DEFAULT_RANGE = "today";

/** Formats a Date as local time for a datetime-local input (YYYY-MM-DDTHH:mm). */
export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

const pluralize = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;

const RecentUsersInput = ({ existingAddresses, onAddressesAdd }: RecentUsersInputProps) => {
  // A quick range stays relative to the ticking clock ("last hour" keeps meaning the last hour);
  // typing a date switches to a fixed start.
  const [rangeLabel, setRangeLabel] = useState<string | null>(DEFAULT_RANGE);
  const [customFrom, setCustomFrom] = useState("");
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await fetchConnections(undefined, controller.signal);
      if (controller.signal.aborted) return;
      setConnections(result);
      setFetchedAt(Date.now());
      setNow(Date.now());
      setSuccessMessage("");
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(`Failed to load university court users: ${(err as Error).message}`);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  // Load on mount, refresh when the tab regains focus, abort on unmount
  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      abortRef.current?.abort();
    };
  }, [load]);

  // Keep the "updated X min ago" label current
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const activeRange = QUICK_RANGES.find(({ label }) => label === rangeLabel);

  // datetime-local values parse as local time, which compares correctly against the UTC timestamps
  const since = useMemo(() => {
    if (activeRange) return activeRange.getStart(new Date(now));
    return customFrom ? new Date(customFrom) : null;
  }, [activeRange, customFrom, now]);
  const isValidFrom = since !== null && !Number.isNaN(since.getTime());
  const from = activeRange && since ? toDateTimeLocal(since) : customFrom;

  const preview = useMemo(() => {
    if (!connections || !since || Number.isNaN(since.getTime())) return null;
    const { valid, invalid } = extractRecentAddresses(connections, since);
    const existing = new Set(existingAddresses.map((addr) => addr.toLowerCase()));
    const fresh = valid.filter((addr) => !existing.has(addr));
    const alreadyAdded = valid.filter((addr) => existing.has(addr));
    return { valid, fresh, alreadyAdded, invalid };
  }, [connections, since, existingAddresses]);

  const selectRange = useCallback((label: string) => {
    setRangeLabel(label);
    setNow(Date.now());
    setSuccessMessage("");
  }, []);

  const selectCustomFrom = useCallback((value: string) => {
    setRangeLabel(null);
    setCustomFrom(value);
    setSuccessMessage("");
  }, []);

  const handleAdd = useCallback(() => {
    if (!preview || preview.fresh.length === 0) return;
    const added = onAddressesAdd(preview.fresh);
    setSuccessMessage(`added ${pluralize(added, "address", "addresses")} to the recipients`);
  }, [preview, onAddressesAdd]);

  let buttonLabel: string;
  if (!isValidFrom) buttonLabel = "Pick a start date";
  else if (!preview) buttonLabel = isLoading ? "Loading..." : "Add Users";
  else if (preview.fresh.length === 0) buttonLabel = "Nothing new to add";
  else buttonLabel = `Add ${pluralize(preview.fresh.length, "user", "users")}`;

  return (
    <section>
      <h2>add university court users</h2>
      <p>add the addresses of users who connected between the chosen date and now.</p>

      <div className="range-chips">
        {QUICK_RANGES.map(({ label }) => (
          <button
            key={label}
            type="button"
            className={`range-chip${rangeLabel === label ? " active" : ""}`}
            aria-pressed={rangeLabel === label}
            onClick={() => selectRange(label)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="shadow">
        <label htmlFor="recent-users-from">from</label>
        <input
          id="recent-users-from"
          type="datetime-local"
          value={from}
          max={toDateTimeLocal(new Date(now))}
          onChange={(e) => selectCustomFrom(e.target.value)}
          className="amount-input"
        />
      </div>
      <p className="recent-users-hint">until now</p>

      <div className="recent-users-summary">
        <span aria-live="polite">
          {!isValidFrom && "pick a valid start date and time"}
          {isValidFrom && !preview && (isLoading ? "loading users..." : "")}
          {isValidFrom && preview && (
            <>
              {pluralize(preview.valid.length, "user", "users")} connected
              {preview.alreadyAdded.length > 0 && ` · ${preview.alreadyAdded.length} already in recipients`}
              {preview.invalid.length > 0 && ` · ${preview.invalid.length} invalid`}
            </>
          )}
        </span>
        <button
          type="button"
          className="refresh-button"
          onClick={load}
          disabled={isLoading}
          title="Refresh the list of users"
        >
          ↻ {isLoading ? "updating..." : fetchedAt ? `updated ${formatAge(now - fetchedAt)}` : "refresh"}
        </button>
      </div>

      {preview && preview.valid.length + preview.invalid.length > 0 && (
        <details className="recent-users-preview">
          <summary>show addresses</summary>
          <ul className="address-list">
            {preview.fresh.map((address) => (
              <li key={address} className="address-item">
                <span className="address-text">{address}</span>
              </li>
            ))}
            {preview.alreadyAdded.map((address) => (
              <li key={address} className="address-item muted">
                <span className="address-text">{address}</span>
                <span className="address-tag">already added</span>
              </li>
            ))}
            {preview.invalid.map((address) => (
              <li key={`invalid-${address}`} className="address-item invalid">
                <span className="address-text">{address}</span>
                <span className="address-tag">invalid</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={!preview || preview.fresh.length === 0}
        className="qr-scan-button"
      >
        {buttonLabel}
      </button>

      {errorMessage && <p className="error-message">{errorMessage}</p>}
      {successMessage && <p className="success-message">{successMessage}</p>}
    </section>
  );
};

export default memo(RecentUsersInput);
