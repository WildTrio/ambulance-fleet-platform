import React, { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ShieldAlert } from "lucide-react"
// @ts-expect-error - AuthContext is currently .jsx
import { useAuth } from "../context/AuthContext"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { notify } from "@/components/ui/Toast"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Redirect target after login
  const from = location.state?.from?.pathname || "/"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await login(email, password)
      notify.success("Successfully authenticated")
      navigate(from, { replace: true })
    } catch (err: any) {
      let errorMsg = "Invalid credentials or server connection failed."
      if (err?.non_field_errors) {
        errorMsg = err.non_field_errors[0]
      } else if (err?.detail) {
        errorMsg = err.detail
      } else if (typeof err === "object" && err !== null) {
        const keys = Object.keys(err)
        if (keys.length > 0) {
          const firstKey = keys[0]
          errorMsg = `${firstKey}: ${err[firstKey][0]}`
        }
      }
      setError(errorMsg)
      notify.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-soft">
            <ShieldAlert className="h-6 w-6 text-red-500" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-slate-900 font-sans">
          Lifeline Dispatch
        </h2>
        <p className="mt-2 text-center text-sm text-slate-500 font-body">
          Enterprise Fleet Management & Emergency Dispatch
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="border border-slate-200 shadow-soft bg-white p-6 rounded-2xl">
          <CardHeader className="p-0 pb-6">
            <CardTitle className="text-xl font-semibold text-slate-900">
              Sign In
            </CardTitle>
            <CardDescription className="text-sm text-slate-500 mt-1">
              Access your hospital dispatch console
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error && (
                <div
                  className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@hospital.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-600 uppercase tracking-wider"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full mt-2 font-semibold"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Secure Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-slate-400 leading-relaxed font-body">
          Protected by role-based access control and end-to-end audit logging.
        </p>
      </div>
    </div>
  )
}
