"use client";

import { useState, useMemo } from "react";
import { Pencil, Trash2, Check, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { updateApplication, deleteApplication } from "../actions";

export interface Application {
  id: string;
  company: string;
  role: string | null;
  location: string | null;
  status: string;
  applied_at: string | null;
  last_contact_at: string | null;
  email_count: number;
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  applied: "bg-blue-100 text-blue-800",
  screening: "bg-yellow-100 text-yellow-800",
  interviewing: "bg-purple-100 text-purple-800",
  offer: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  ghosted: "bg-gray-100 text-gray-600",
  withdrawn: "bg-gray-100 text-gray-600",
};

const STATUSES = ["applied", "screening", "interviewing", "offer", "rejected", "ghosted", "withdrawn"];

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IE", { day: "numeric", month: "short" });
}

// Minimal underline input — same line-height as surrounding text, no box change
const inputCls = "bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none w-full text-sm leading-none py-0";
const selectCls = "bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none text-xs font-medium cursor-pointer";

type SortKey = "company" | "role" | "status" | "last_contact_at" | "email_count";
type SortDir = "asc" | "desc";

const COLS: { label: string; key: SortKey | null }[] = [
  { label: "Company",      key: "company" },
  { label: "Role",         key: "role" },
  { label: "Status",       key: "status" },
  { label: "Location",     key: null },
  { label: "Applied",      key: null },
  { label: "Last contact", key: "last_contact_at" },
  { label: "Emails",       key: "email_count" },
  { label: "",             key: null },
];

function sortApps(apps: Application[], key: SortKey, dir: SortDir): Application[] {
  return [...apps].sort((a, b) => {
    let av: string | number, bv: string | number;
    if (key === "email_count") {
      av = a.email_count; bv = b.email_count;
    } else if (key === "last_contact_at") {
      av = a.last_contact_at ?? ""; bv = b.last_contact_at ?? "";
    } else {
      av = (a[key] ?? "").toLowerCase(); bv = (b[key] ?? "").toLowerCase();
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

export function ApplicationsTable({ applications: initial }: { applications: Application[] }) {
  const [apps, setApps]         = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft]       = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sortKey, setSortKey]   = useState<SortKey>("last_contact_at");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");

  const sorted = useMemo(() => sortApps(apps, sortKey, sortDir), [apps, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function startEdit(app: Application) {
    setDraft({ company: app.company, role: app.role ?? "", location: app.location ?? "", status: app.status, notes: app.notes ?? "" });
    setConfirmDelete(false);
    setEditingId(app.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setConfirmDelete(false);
  }

  async function handleSave(app: Application) {
    setSaving(true);
    await updateApplication(app.id, { company: draft.company, role: draft.role, location: draft.location, status: draft.status, notes: draft.notes });
    setApps((prev) => prev.map((a) => a.id === app.id
      ? { ...a, company: draft.company, role: draft.role || null, location: draft.location || null, status: draft.status, notes: draft.notes || null }
      : a));
    setSaving(false);
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    setSaving(true);
    await deleteApplication(id);
    setApps((prev) => prev.filter((a) => a.id !== id));
    setSaving(false);
    setEditingId(null);
    setConfirmDelete(false);
  }

  if (apps.length === 0) {
    return <p className="text-sm text-gray-700">No applications yet — run a sync to import your emails.</p>;
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {COLS.map(({ label, key }) => (
              <th key={label} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                {key ? (
                  <button onClick={() => handleSort(key)} className="flex items-center gap-1 hover:text-gray-900">
                    {label}
                    {sortKey === key
                      ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                      : <ChevronsUpDown size={12} className="text-gray-300" />}
                  </button>
                ) : label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((app) => {
            const isEditing = editingId === app.id;
            return (
              <>
                <tr key={app.id} className={isEditing ? "bg-blue-50/40" : "hover:bg-gray-50"}>
                  {/* Company */}
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {isEditing
                      ? <input className={inputCls} value={draft.company} onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))} />
                      : app.company}
                  </td>
                  {/* Role */}
                  <td className="px-4 py-3 text-gray-600">
                    {isEditing
                      ? <input className={inputCls} placeholder="—" value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} />
                      : (app.role ?? "—")}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    {isEditing
                      ? <select className={selectCls} value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      : <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-600"}`}>{app.status}</span>}
                  </td>
                  {/* Location */}
                  <td className="px-4 py-3 text-gray-700">
                    {isEditing
                      ? <input className={inputCls} placeholder="—" value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
                      : (app.location ?? "—")}
                  </td>
                  {/* Applied */}
                  <td className="px-4 py-3 text-gray-700">{fmt(app.applied_at)}</td>
                  {/* Last contact */}
                  <td className="px-4 py-3 text-gray-700">{fmt(app.last_contact_at)}</td>
                  {/* Emails */}
                  <td className="px-4 py-3 text-gray-700">{app.email_count}</td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <button
                        onClick={() => confirmDelete ? handleDelete(app.id) : setConfirmDelete(true)}
                        disabled={saving}
                        title={confirmDelete ? "Confirm delete" : "Delete"}
                        className={`p-1.5 rounded disabled:opacity-50 ${confirmDelete ? "text-red-600 bg-red-50" : "text-gray-500 hover:text-red-500 hover:bg-red-50"}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <button onClick={() => startEdit(app)} title="Edit" className="p-1.5 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded">
                        <Pencil size={15} />
                      </button>
                    )}
                  </td>
                </tr>

                {/* Action strip — slides in below editing row, outside the row shape */}
                {isEditing && (
                  <tr key={`${app.id}-actions`}>
                    <td colSpan={8} className="px-4 py-1.5 bg-blue-50 border-t border-blue-100">
                      <div className="flex items-center gap-3 text-xs">
                        <button
                          onClick={() => handleSave(app)}
                          disabled={saving}
                          className="flex items-center gap-1 text-green-700 hover:text-green-900 disabled:opacity-50 font-medium"
                        >
                          <Check size={13} /> {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
                        >
                          <X size={13} /> Cancel
                        </button>
                        {confirmDelete && (
                          <span className="ml-2 text-red-600 flex items-center gap-2">
                            Delete this application?
                            <button onClick={() => setConfirmDelete(false)} className="underline text-gray-500">No</button>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
