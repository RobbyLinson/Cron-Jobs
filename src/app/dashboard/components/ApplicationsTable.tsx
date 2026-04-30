"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
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

function EditRow({
  app,
  onDone,
}: {
  app: Application;
  onDone: (updated: Application | null) => void;
}) {
  const [values, setValues] = useState({
    company: app.company,
    role: app.role ?? "",
    location: app.location ?? "",
    status: app.status,
    notes: app.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (field: string, value: string) => setValues((v) => ({ ...v, [field]: value }));

  async function handleSave() {
    setSaving(true);
    await updateApplication(app.id, values);
    onDone({ ...app, ...values, role: values.role || null, location: values.location || null, notes: values.notes || null });
  }

  async function handleDelete() {
    setSaving(true);
    await deleteApplication(app.id);
    onDone(null);
  }

  return (
    <tr className="bg-blue-50">
      <td className="px-4 py-2">
        <input
          className="border rounded px-2 py-1 text-sm w-full"
          value={values.company}
          onChange={(e) => set("company", e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <input
          className="border rounded px-2 py-1 text-sm w-full"
          placeholder="Role"
          value={values.role}
          onChange={(e) => set("role", e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <select
          className="border rounded px-2 py-1 text-sm w-full"
          value={values.status}
          onChange={(e) => set("status", e.target.value)}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          className="border rounded px-2 py-1 text-sm w-full"
          placeholder="Location"
          value={values.location}
          onChange={(e) => set("location", e.target.value)}
        />
      </td>
      <td className="px-4 py-2 text-gray-400 text-sm">{fmt(app.applied_at)}</td>
      <td className="px-4 py-2 text-gray-400 text-sm">{fmt(app.last_contact_at)}</td>
      <td className="px-4 py-2 text-gray-400 text-sm">{app.email_count}</td>
      <td className="px-4 py-2">
        <div className="flex gap-1 items-center">
          <button
            onClick={handleSave}
            disabled={saving}
            title="Save"
            className="p-1.5 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
          >
            <Check size={15} />
          </button>
          <button
            onClick={() => onDone(app)}
            disabled={saving}
            title="Cancel"
            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
          >
            <X size={15} />
          </button>
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-600 ml-1">Sure?</span>
              <button
                onClick={handleDelete}
                disabled={saving}
                title="Confirm delete"
                className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
              >
                <Check size={15} />
              </button>
              <button onClick={() => setConfirmDelete(false)} title="Cancel delete" className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                <X size={15} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete"
              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function ApplicationsTable({ applications: initial }: { applications: Application[] }) {
  const [apps, setApps] = useState(initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleDone(id: string, updated: Application | null) {
    if (updated === null) {
      setApps((prev) => prev.filter((a) => a.id !== id));
    } else {
      setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
    }
    setEditingId(null);
  }

  if (apps.length === 0) {
    return <p className="text-sm text-gray-500">No applications yet — run a sync to import your emails.</p>;
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {["Company", "Role", "Status", "Location", "Applied", "Last contact", "Emails", ""].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {apps.map((app) =>
            editingId === app.id ? (
              <EditRow key={app.id} app={app} onDone={(updated) => handleDone(app.id, updated)} />
            ) : (
              <tr key={app.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{app.company}</td>
                <td className="px-4 py-3 text-gray-600">{app.role ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {app.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{app.location ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(app.applied_at)}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(app.last_contact_at)}</td>
                <td className="px-4 py-3 text-gray-500">{app.email_count}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setEditingId(app.id)}
                    title="Edit"
                    className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded"
                  >
                    <Pencil size={15} />
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
