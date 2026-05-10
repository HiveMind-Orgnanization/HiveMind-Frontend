import { useEffect, useState } from "react";
import { apiConfigured, fetchBackendHealth } from "../../lib/api";

/** Lightweight ping so the UI shows whether the Fastify API is reachable. */
export function useBackendHealth() {
  const enabled = apiConfigured();
  const [up, setUp] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      setUp(null);
      return;
    }
    let cancelled = false;
    const ping = async () => {
      const { ok } = await fetchBackendHealth();
      if (!cancelled) setUp(ok);
    };
    void ping();
    const id = window.setInterval(ping, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  return { enabled, up, probing: enabled && up === null };
}
