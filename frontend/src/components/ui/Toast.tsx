import { toast, type ToastOptions } from "react-hot-toast"

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
  },
}

export const notify = {
  success: (message: string, options?: ToastOptions) =>
    toast.success(message, {
      ...defaultOptions,
      iconTheme: {
        primary: "#10B981", // Success green
        secondary: "#FFFFFF",
      },
      ...options,
    }),
  error: (message: string, options?: ToastOptions) =>
    toast.error(message, {
      ...defaultOptions,
      iconTheme: {
        primary: "#EF4444", // Emergency red
        secondary: "#FFFFFF",
      },
      ...options,
    }),
  info: (message: string, options?: ToastOptions) =>
    toast(message, {
      ...defaultOptions,
      icon: "ℹ️",
      ...options,
    }),
}
