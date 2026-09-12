import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchConfig, fetchData } from "./api";
import type { AppConfig, DataResponse } from "./types";

interface DataState {
  config: AppConfig | null;
  data: DataResponse | null;
  loading: boolean;
  error: (Error & { hint?: string }) | null;
  gid: string | undefined;
  setGid: (gid: string) => void;
  refresh: () => void;
  lastLoadedAt: number | null;
}

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [data, setData] = useState<DataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<(Error & { hint?: string }) | null>(null);
  const [gid, setGidState] = useState<string | undefined>(undefined);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  const load = useCallback(async (targetGid?: string) => {
    setLoading(true);
    setError(null);
    try {
      // Always pulls the sheet live from the server on every load.
      const resp = await fetchData(targetGid);
      setData(resp);
      setLastLoadedAt(Date.now());
    } catch (err) {
      setError(err as Error & { hint?: string });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    void load(gid);
  }, [gid, load]);

  const setGid = useCallback((next: string) => setGidState(next), []);
  const refresh = useCallback(() => void load(gid), [gid, load]);

  return (
    <Ctx.Provider value={{ config, data, loading, error, gid, setGid, refresh, lastLoadedAt }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData(): DataState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
