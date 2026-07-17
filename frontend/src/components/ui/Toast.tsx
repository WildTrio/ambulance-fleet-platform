import React from "react"
import { toast, type ToastOptions } from "react-hot-toast"
import { X } from "lucide-react"

const defaultOptions: ToastOptions = {
  duration: 5000,
  style: {
    background: "#FFFFFF",
    color: "#0F172A",
    border: "1px solid #E2E8F0",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
    fontSize: "0.875rem",
    fontWeight: 500,
    fontFamily: "Inter, sans-serif",
    maxWidth: "350px",
  },
}

export const notify = {
  success: (message: string, options?: ToastOptions) =>
    toast.success(
      (t) => (
        <span className="flex items-center justify-between gap-3 w-full">
          <span>{message}</span>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-md hover:bg-slate-50 shrink-0"
          >
            <X size={14} />
          </button>
        </span>
      ),
      {
        ...defaultOptions,
        iconTheme: {
          primary: "#10B981", // Success green
          secondary: "#FFFFFF",
        },
        ...options,
      }
    ),
  error: (message: string, options?: ToastOptions) =>
    toast.error(
      (t) => (
        <span className="flex items-center justify-between gap-3 w-full">
          <span>{message}</span>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-md hover:bg-slate-50 shrink-0"
          >
            <X size={14} />
          </button>
        </span>
      ),
      {
        ...defaultOptions,
        iconTheme: {
          primary: "#EF4444", // Emergency red
          secondary: "#FFFFFF",
        },
        ...options,
      }
    ),
  info: (message: string, options?: ToastOptions) =>
    toast(
      (t) => (
        <span className="flex items-center justify-between gap-3 w-full">
          <span>{message}</span>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-0.5 rounded-md hover:bg-slate-50 shrink-0"
          >
            <X size={14} />
          </button>
        </span>
      ),
      {
        ...defaultOptions,
        icon: "ℹ️",
        ...options,
      }
    ),
}
