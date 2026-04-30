"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/cron/sync");
      const data = await res.json();
      if (data.ok) {
        setResult(`Done — ${data.emailsProcessed} email${data.emailsProcessed === 1 ? "" : "s"} processed`);
        router.refresh();
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch {
      setResult("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Syncing…" : "Run sync now"}
      </button>
      {result && <span className="text-sm text-gray-600">{result}</span>}
    </div>
  );
}
