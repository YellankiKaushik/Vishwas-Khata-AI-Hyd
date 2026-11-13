import { useCallback, useState } from "react";

// Persist intent before issuing a write. Storage failure prevents the request.
export function useSavedOperation<T>(key: string) {
  const [value, setValue] = useState<T | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") as T | null;
    } catch {
      return null;
    }
  });
  const save = useCallback(
    (next: T | null) => {
      if (next === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(next));
      setValue(next);
    },
    [key],
  );
  return [value, save] as const;
}
