import { useState } from "react";
import clsx from "clsx";
import { TrendingUp, Mail, Lock, Loader2, AlertCircle, CheckCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";

type Mode = "login" | "signup";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      const { error } = await signUp(email, password);
      if (error) {
        setError(error);
      } else {
        setSuccess("Account created! Check your email to confirm, then sign in.");
        setMode("login");
      }
    }
    setLoading(false);
  }

  return (
    <div className="h-screen bg-bg flex items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(46,230,168,0.08) 0%, transparent 60%)" }} />

      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-green/15 border border-green/20 flex items-center justify-center">
            <TrendingUp size={20} className="text-green" />
          </div>
          <div>
            <p className="text-white font-bold text-xl tracking-tight">StockWiz</p>
            <p className="text-muted text-xs">AI Stock Dashboard</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-2xl">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-card2 rounded-xl p-1 mb-6">
            {(["login", "signup"] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null); setShowPassword(false); }}
                className={clsx(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                  mode === m ? "bg-green/15 text-green" : "text-muted hover:text-white"
                )}>
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs text-muted block mb-1.5">Email</label>
              <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2.5 focus-within:border-green/40 transition-colors">
                <Mail size={14} className="text-muted flex-shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-muted block mb-1.5">Password</label>
              <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2.5 focus-within:border-green/40 transition-colors">
                <Lock size={14} className="text-muted flex-shrink-0" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 6 characters" : "••••••••"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="text-muted hover:text-white transition-colors flex-shrink-0">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error / success messages */}
            {error && (
              <div className="flex items-start gap-2 bg-red/10 border border-red/20 rounded-xl px-3 py-2.5">
                <AlertCircle size={14} className="text-red flex-shrink-0 mt-0.5" />
                <p className="text-red text-xs leading-relaxed">{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-start gap-2 bg-green/10 border border-green/20 rounded-xl px-3 py-2.5">
                <CheckCircle size={14} className="text-green flex-shrink-0 mt-0.5" />
                <p className="text-green text-xs leading-relaxed">{success}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green/15 hover:bg-green/25 disabled:opacity-50 border border-green/30 text-green rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 mt-2">
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> {mode === "login" ? "Signing in..." : "Creating account..."}</>
                : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {mode === "login" && (
            <p className="text-center text-xs text-muted mt-4">
              Don't have an account?{" "}
              <button onClick={() => { setMode("signup"); setError(null); }}
                className="text-green hover:text-green/80 transition-colors">
                Sign up
              </button>
            </p>
          )}
          {mode === "signup" && (
            <p className="text-center text-xs text-muted mt-4">
              Already have an account?{" "}
              <button onClick={() => { setMode("login"); setError(null); }}
                className="text-green hover:text-green/80 transition-colors">
                Sign in
              </button>
            </p>
          )}
        </div>

        <p className="text-center text-[10px] text-muted mt-4">
          By signing up you agree to our terms of service
        </p>
      </div>
    </div>
  );
}
