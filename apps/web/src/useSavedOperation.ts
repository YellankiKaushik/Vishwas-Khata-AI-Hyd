import { useCallback, useSyncExternalStore } from "react";

// Persist intent before issuing a write. Storage failure prevents the request.
export function useSavedOperation<T>(key: string) {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener("vishwas:saved-operation", notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener("vishwas:saved-operation", notify);
    };
  }, []);
  const read = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, read);
  let value: T | null = null;
  try {
    value = JSON.parse(raw || "null") as T | null;
  } catch {
    // A malformed local record cannot be replayed.
  }
  const save = useCallback(
    (next: T | null) => {
      if (next === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event("vishwas:saved-operation"));
    },
    [key],
  );
  return [value, save] as const;
}
