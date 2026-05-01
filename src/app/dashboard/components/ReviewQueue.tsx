"use client";

import { useState } from "react";
import { resolveReview } from "../actions";

interface ReviewItem {
  email_id: string;
  application_id: string;
  subject: string;
  classification: string;
  confidence: number;
  from_address: string;
  received_at: string;
  company: string;
  role: string | null;
  status: string;
}

const STATUSES = ["applied", "screening", "interviewing", "offer", "rejected", "ghosted", "withdrawn"];

export function ReviewQueue({ items: initial }: { items: ReviewItem[] }) {
  const [items, setItems] = useState(initial);
  const [edits, setEdits] = useState<Record<string, { company: string; role: string; status: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-3">Review Queue</h2>
        <p className="text-sm text-gray-700">Nothing needs review.</p>
      </section>
    );
  }

  function getEdit(item: ReviewItem) {
    return edits[item.email_id] ?? { company: item.company, role: item.role ?? "", status: item.status };
  }

  function setEdit(emailId: string, field: string, value: string) {
    setEdits((prev) => ({
      ...prev,
      [emailId]: { ...getEdit(items.find((i) => i.email_id === emailId)!), [field]: value },
    }));
  }

  async function handleResolve(item: ReviewItem) {
    setSaving(item.email_id);
    const edit = getEdit(item);
    await resolveReview(item.email_id, item.application_id, edit);
    setItems((prev) => prev.filter((i) => i.email_id !== item.email_id));
    setSaving(null);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">
        Review Queue <span className="text-sm font-normal text-gray-700">({items.length})</span>
      </h2>
      <div className="space-y-3">
        {items.map((item) => {
          const edit = getEdit(item);
          const isSaving = saving === item.email_id;
          return (
            <div key={item.email_id} className="border border-amber-200 bg-amber-50 rounded-lg p-4">
              <div className="text-sm text-gray-700 mb-3">
                <span className="font-medium">{item.subject}</span>
                <span className="text-gray-600 ml-2">· {item.from_address}</span>
                <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {item.classification} ({Math.round(item.confidence * 100)}%)
                </span>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  className="border rounded px-2 py-1 text-sm w-40"
                  placeholder="Company"
                  value={edit.company}
                  onChange={(e) => setEdit(item.email_id, "company", e.target.value)}
                />
                <input
                  className="border rounded px-2 py-1 text-sm w-40"
                  placeholder="Role"
                  value={edit.role}
                  onChange={(e) => setEdit(item.email_id, "role", e.target.value)}
                />
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={edit.status}
                  onChange={(e) => setEdit(item.email_id, "status", e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleResolve(item)}
                  disabled={isSaving}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Mark resolved"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
