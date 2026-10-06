"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../errors";

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  /** Re-fetches and replaces `data` (keeps the old data on screen while loading, and on failure). */
  reload: () => Promise<void>;
}

/**
 * Data for a screen: starts from `initial` (e.g. fetched on a server) or loads on mount, and `reload` refreshes it.
 * `key` identifies what is being shown (the month, say): when it changes the screen clears and loads again.
 * A response that arrives after a newer load started is dropped.
 */
export function useLoaded<T>(load: () => Promise<T>, initial: T | undefined, key: string): Loaded<T> {
  const [data, setData] = useState<T | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const loadedKey = useRef<string | null>(initial !== undefined ? key : null);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await loadRef.current();
      if (mine === seq.current) { setData(next); setError(null); }
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (loadedKey.current === key) return;
    if (loadedKey.current !== null) setData(null);
    loadedKey.current = key;
    void reload();
  }, [key, reload]);

  return { data, error, reload };
}
