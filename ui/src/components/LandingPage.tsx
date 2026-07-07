import { useState, useRef, useEffect } from "react";
import clsx from "clsx";
import {
  TrendingUp, BarChart2, Bot, Zap, ShieldCheck, ChevronRight,
  Star, ArrowRight, Eye, EyeOff, Mail, Lock, Loader2,
  AlertCircle, CheckCircle, Monitor,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInView } from "../hooks/useInView";

// ── Animated counter ──────────────────────────────────────────────────────

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const { ref, inView } = useInView(0.3);

  useEffect(() => {
    if (!inView) return;
    const duration = 1200;
    const steps = 40;
    const inc = to / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += inc;
      if (current >= to) { setVal(to); clearInterval(interval); }
      else setVal(Math.floor(current));
    }, duration / steps);
    return () => clearInterval(interval);
  }, [inView, to]);

  return <span ref={ref}>{val}{suffix}</span>;
}

// ── Fade-in wrapper ───────────────────────────────────────────────────────

function FadeIn({ children, delay = 0, direction = "up", className = "" }: {
  children: React.ReactNode; delay?: number; direction?: "up" | "left" | "right" | "none"; className?: string;
}) {
  const { ref, inView } = useInView(0.1);
  const transforms: Record<string, string> = {
    up: "translateY(28px)", left: "translateX(-28px)", right: "translateX(28px)", none: "none",
  };
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "none" : transforms[direction],
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ── Browser frame mockup ──────────────────────────────────────────────────

function BrowserFrame({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={clsx("rounded-2xl overflow-hidden border border-border/60 shadow-2xl", className)}>
      {/* Chrome bar */}
      <div className="bg-card2 border-b border-border/50 px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red/60" />
          <div className="w-3 h-3 rounded-full bg-orange/60" />
          <div className="w-3 h-3 rounded-full bg-green/60" />
        </div>
        <div className="flex-1 bg-card border border-border/40 rounded-md px-3 py-1 flex items-center gap-2 mx-4">
          <Monitor size={10} className="text-muted" />
          <span className="text-[10px] text-muted">stockwiz.com</span>
        </div>
      </div>
      <img src={src} alt={alt} className="w-full block" />
    </div>
  );
}

// ── Auth form ─────────────────────────────────────────────────────────────

type Mode = "login" | "signup";

function AuthForm() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!email.trim() || !password.trim()) { setError("Email and password required."); return; }
    setLoading(true);
    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      const { error } = await signUp(email, password);
      if (error) setError(error);
      else { setSuccess("Account created! Check your email to confirm, then sign in."); setMode("login"); }
    }
    setLoading(false);
  }

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-2xl w-full max-w-sm backdrop-blur-sm">
      <div className="flex gap-1 bg-card2 rounded-xl p-1 mb-5">
        {(["signup", "login"] as Mode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null); }}
            className={clsx("flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
              mode === m ? "bg-green/15 text-green" : "text-muted hover:text-white")}>
            {m === "signup" ? "Get Started" : "Sign In"}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2.5 focus-within:border-green/40 transition-colors">
          <Mail size={13} className="text-muted flex-shrink-0" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com" autoComplete="email"
            className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none" />
        </div>
        <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2.5 focus-within:border-green/40 transition-colors">
          <Lock size={13} className="text-muted flex-shrink-0" />
          <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Min 6 characters" : "Password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none" />
          <button type="button" onClick={() => setShowPw(v => !v)} className="text-muted hover:text-white transition-colors">
            {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 bg-red/10 border border-red/20 rounded-xl px-3 py-2">
            <AlertCircle size={13} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-xs leading-relaxed">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-green/10 border border-green/20 rounded-xl px-3 py-2">
            <CheckCircle size={13} className="text-green flex-shrink-0 mt-0.5" />
            <p className="text-green text-xs leading-relaxed">{success}</p>
          </div>
        )}
        <button type="submit" disabled={loading}
          className="w-full bg-green/15 hover:bg-green/25 disabled:opacity-50 border border-green/30 text-green rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
          {loading
            ? <><Loader2 size={14} className="animate-spin" />{mode === "login" ? "Signing in..." : "Creating account..."}</>
            : mode === "login" ? "Sign In" : "Create Free Account"}
        </button>
      </form>
      <p className="text-center text-[11px] text-muted mt-3">
        {mode === "signup" ? "Already have an account? " : "No account yet? "}
        <button onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); }}
          className="text-green hover:underline">
          {mode === "signup" ? "Sign in" : "Sign up free"}
        </button>
      </p>
    </div>
  );
}

// ── Feature tab preview ───────────────────────────────────────────────────

const FEATURE_TABS = [
  {
    id: "dashboard",
    label: "Analysis Dashboard",
    icon: <BarChart2 size={14} />,
    img: "/screenshots/feature3.png",
    title: "Live charts + AI analysis, side by side",
    desc: "Candlestick charts, 6-month area, ROI, and Volume Profile — all powered by live Yahoo Finance data. Search any stock, click it to pull up a detailed breakdown, and consult the per-stock AI agent to ask questions like 'is this a good entry point?' or 'what are the biggest risks right now?'",
  },
  {
    id: "screener",
    label: "Portfolio Tracker",
    icon: <TrendingUp size={14} />,
    img: "/screenshots/feature2.png",
    title: "Track your positions with real P&L and AI sell signals",
    desc: "See your portfolio's combined value over time, allocation by holding, and live unrealized gains. Screener signals on the right show which stocks currently meet your buy or watch criteria — so you always know what to act on alongside what you already own.",
  },
  {
    id: "portfolio",
    label: "Market Assistant",
    icon: <Bot size={14} />,
    img: "/screenshots/feature1.png",
    title: "Ask anything about markets, strategies, and economics",
    desc: "A general-purpose AI financial assistant with live market data injected at query time. Ask about sector rotation, compare two stocks, get a bear market strategy, or just talk through your investment thesis. It knows the current SPY price, VIX level, and can pull live data on any ticker you mention.",
  },
];

// ── Sticky scroll feature showcase ───────────────────────────────────────

function ScrollFeatureShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 within current tab

  useEffect(() => {
    function onScroll() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const raw = Math.max(0, Math.min(1, -rect.top / scrollable));
      // Map 0..1 to 0..N tabs
      const total = FEATURE_TABS.length;
      const scaled = raw * total;
      const idx = Math.min(total - 1, Math.floor(scaled));
      const prog = scaled - Math.floor(scaled);
      setActiveIndex(idx);
      setProgress(prog);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const tab = FEATURE_TABS[activeIndex];
  const nextTab = FEATURE_TABS[Math.min(activeIndex + 1, FEATURE_TABS.length - 1)];
  // Crossfade: current fades out when progress > 0.7, next fades in
  const fadeOut = progress > 0.7 ? (progress - 0.7) / 0.3 : 0;
  const imgOpacity = 1 - fadeOut;
  const nextImgOpacity = fadeOut;

  return (
    /* Outer tall container — provides scroll room (300vh) */
    <div ref={containerRef} style={{ height: `${FEATURE_TABS.length * 100}vh` }} className="relative w-full">
      {/* Sticky inner — fills full viewport, content centered */}
      <div style={{ position: "sticky", top: 0, height: "100vh", width: "100%", background: "var(--bg, #0B0D12)" }}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "2rem 2rem", maxWidth: "80rem", margin: "0 auto" }}>

        {/* Section header */}
        <div className="text-center mb-4 flex-shrink-0">
          <p className="text-green text-xs font-semibold uppercase tracking-widest mb-2">Product</p>
          <h2 className="text-4xl font-bold text-white">See it in action</h2>
          <p className="text-muted mt-2 text-sm">Every feature is built around real data. No mock charts, no placeholders.</p>
        </div>

        <div className="flex gap-10 items-center flex-1 min-h-0">

          {/* Left — text + progress indicators */}
          <div className="w-72 flex-shrink-0 space-y-6">
            {/* Progress dots */}
            <div className="flex gap-2 mb-8">
              {FEATURE_TABS.map((_, i) => (
                <div key={i} className="flex-1 h-0.5 rounded-full bg-border/40 overflow-hidden">
                  <div className="h-full bg-green rounded-full transition-all duration-100"
                    style={{ width: i < activeIndex ? "100%" : i === activeIndex ? `${progress * 100}%` : "0%" }} />
                </div>
              ))}
            </div>

            {/* Tab labels — all three visible, active one highlighted */}
            <div className="space-y-1">
              {FEATURE_TABS.map((t, i) => (
                <div key={t.id}
                  className={clsx("flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300",
                    i === activeIndex ? "bg-green/10 border border-green/20" : "opacity-40")}>
                  <span className={i === activeIndex ? "text-green" : "text-muted"}>{t.icon}</span>
                  <span className={clsx("text-sm font-medium", i === activeIndex ? "text-white" : "text-muted")}>
                    {t.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Active tab description — fades with progress */}
            <div style={{ opacity: 1 - fadeOut * 2 }} className="transition-opacity duration-100">
              <h3 className="text-white font-bold text-lg mb-2 leading-snug">{tab.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{tab.desc}</p>
            </div>
          </div>

          {/* Right — stacked images with crossfade */}
          <div className="flex-1 min-w-0 relative overflow-hidden" style={{ maxHeight: "calc(100vh - 280px)" }}>
            {/* Glow */}
            <div className="absolute -inset-4 rounded-3xl blur-3xl opacity-25 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(46,230,168,0.3), transparent 70%)" }} />

            {/* Current image */}
            <div className="relative rounded-2xl overflow-hidden border border-border/60 shadow-2xl" style={{ opacity: imgOpacity, transition: "opacity 0.15s ease" }}>
              <div className="bg-card2 border-b border-border/50 px-4 py-2 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red/60" /><div className="w-2.5 h-2.5 rounded-full bg-orange/60" /><div className="w-2.5 h-2.5 rounded-full bg-green/60" />
                </div>
                <div className="flex-1 bg-card border border-border/40 rounded-md px-3 py-0.5 mx-3">
                  <span className="text-[10px] text-muted">stockwiz.com</span>
                </div>
              </div>
              <img src={tab.img} alt={tab.label} style={{ width: "100%", display: "block", maxHeight: "calc(100vh - 340px)", objectFit: "cover", objectPosition: "top" }} />
            </div>

            {/* Next image — fades in on top */}
            {nextTab.id !== tab.id && (
              <div className="absolute inset-0 rounded-2xl overflow-hidden border border-border/60 shadow-2xl" style={{ opacity: nextImgOpacity, transition: "opacity 0.15s ease" }}>
                <div className="bg-card2 border-b border-border/50 px-4 py-2 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red/60" /><div className="w-2.5 h-2.5 rounded-full bg-orange/60" /><div className="w-2.5 h-2.5 rounded-full bg-green/60" />
                  </div>
                  <div className="flex-1 bg-card border border-border/40 rounded-md px-3 py-0.5 mx-3">
                    <span className="text-[10px] text-muted">stockwiz.com</span>
                  </div>
                </div>
                <img src={nextTab.img} alt={nextTab.label} style={{ width: "100%", display: "block", maxHeight: "calc(100vh - 340px)", objectFit: "cover", objectPosition: "top" }} />
              </div>
            )}
          </div>
        </div>

        {/* Scroll hint */}
        {activeIndex === 0 && progress < 0.15 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-muted text-[10px] anim-fade-up">
            <div className="w-4 h-7 border border-muted/40 rounded-full flex items-start justify-center pt-1">
              <div className="w-1 h-2 bg-muted/60 rounded-full animate-bounce" />
            </div>
            scroll to explore
          </div>
        )}
        </div>{/* end max-w inner */}
      </div>{/* end sticky */}
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────

export default function LandingPage() {
  const authRef = useRef<HTMLDivElement>(null);

  function scrollToAuth() {
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="min-h-screen bg-bg text-white">
      <style>{`body { overflow-x: hidden; }`}</style>

      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(46,230,168,0.10) 0%, transparent 60%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 40% at 100% 70%, rgba(128,85,245,0.07) 0%, transparent 55%)" }} />
        {/* Slow-moving gradient orbs */}
        <div className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: "rgba(46,230,168,0.15)", top: "10%", left: "5%", animation: "float 12s ease-in-out infinite" }} />
        <div className="absolute w-72 h-72 rounded-full opacity-15 blur-3xl"
          style={{ background: "rgba(128,85,245,0.2)", bottom: "20%", right: "10%", animation: "float 16s ease-in-out infinite reverse" }} />
      </div>

      {/* ── NAV ── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-border/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-green/15 border border-green/20 flex items-center justify-center">
            <TrendingUp size={16} className="text-green" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">StockWiz</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-muted">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>
        <button onClick={scrollToAuth}
          className="flex items-center gap-2 bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl px-4 py-2 text-sm font-semibold transition-all">
          Get Started <ArrowRight size={14} />
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="relative z-10 px-8 pt-10 pb-4 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-start gap-12">

          {/* Left */}
          <div className="flex-1 min-w-0 pt-4">
            <FadeIn direction="up">
              <div className="inline-flex items-center gap-2 bg-green/10 border border-green/20 rounded-full px-3 py-1 text-xs text-green font-medium mb-6">
                <Zap size={11} /> AI-Powered Stock Intelligence
              </div>
            </FadeIn>

            <FadeIn direction="up" delay={80}>
              <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-1">Screen smarter.</h1>
            </FadeIn>
            <FadeIn direction="up" delay={140}>
              <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-1 text-green">Invest better.</h1>
            </FadeIn>
            <FadeIn direction="up" delay={200}>
              <h1 className="text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6 text-white/40">Act with clarity.</h1>
            </FadeIn>

            <FadeIn direction="up" delay={260}>
              <p className="text-white/55 text-lg leading-relaxed max-w-md mb-8">
                Live market data meets Claude AI — screen 500+ stocks,
                surface buy signals, and get plain-English analysis on any position.
              </p>
            </FadeIn>

            <FadeIn direction="up" delay={320}>
              <div className="flex items-center gap-4 flex-wrap mb-8">
                <button onClick={scrollToAuth}
                  className="flex items-center gap-2 bg-green text-bg rounded-xl px-6 py-3 text-sm font-bold hover:bg-green/90 transition-colors shadow-lg shadow-green/20">
                  Start for free <ArrowRight size={15} />
                </button>
                <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
                  className="flex items-center gap-2 text-muted hover:text-white text-sm transition-colors">
                  See features <ChevronRight size={14} />
                </button>
              </div>
            </FadeIn>

            <FadeIn direction="up" delay={380}>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {["#2EE6A8","#8055F5","#FFAC26","#00bcd4"].map((c, i) => (
                    <div key={i} className="w-7 h-7 rounded-full border-2 border-bg flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: c }}>{["J","A","M","S"][i]}</div>
                  ))}
                </div>
                <p className="text-muted text-xs">Join other Investors on StockWiz</p>
              </div>
            </FadeIn>
          </div>

          {/* Right — hero screenshot */}
          <div className="flex-1 min-w-0 w-full">
            <FadeIn direction="right" delay={200}>
              <div className="relative">
                {/* Glow behind the frame */}
                <div className="absolute -inset-4 rounded-3xl opacity-30 blur-2xl"
                  style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(46,230,168,0.3), transparent 70%)" }} />
                <BrowserFrame
                  src="/screenshots/dashboard.png"
                  alt="StockWiz dashboard showing candlestick charts and AI analysis"
                  className="relative"
                />
                {/* Floating badge */}
                <div className="absolute -bottom-4 -left-4 bg-card border border-green/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-2.5 anim-scale-in">
                  <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
                  <div>
                    <p className="text-white text-xs font-semibold">Live data</p>
                    <p className="text-muted text-[10px]">Yahoo Finance · real-time</p>
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 bg-card border border-purple/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-2.5">
                  <Bot size={14} className="text-purple-400" />
                  <div>
                    <p className="text-white text-xs font-semibold">Claude AI</p>
                    <p className="text-muted text-[10px]">Streaming analysis</p>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="relative z-10 px-8 py-2 max-w-7xl mx-auto">
        <FadeIn direction="up">
          <div className="bg-card/60 border border-border/40 rounded-2xl px-8 py-6 backdrop-blur-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 divide-x divide-border/30">
              {[
                { to: 500, suffix: "+", label: "Stocks in universe" },
                { to: 4,   suffix: "",  label: "Strategy presets" },
                { to: 6,   suffix: "",  label: "Chart types" },
                { to: 3,   suffix: "",  label: "AI chat modes" },
              ].map(({ to, suffix, label }) => (
                <div key={label} className="text-center px-4">
                  <p className="text-2xl font-bold font-mono text-white">
                    <Counter to={to} suffix={suffix} />
                  </p>
                  <p className="text-muted text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── STICKY SCROLL FEATURE SHOWCASE ── */}
      {/* The outer div is tall (300vh) to give scroll room. Content is sticky. */}
      <section id="features" className="relative z-10">
        <ScrollFeatureShowcase />
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="relative z-10 px-8 pt-8 pb-20 max-w-7xl mx-auto">
        <FadeIn direction="up">
          <div className="text-center mb-14">
            <p className="text-green text-xs font-semibold uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-4xl font-bold text-white">From data to decision in seconds</h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: "01", title: "Set your criteria", desc: "Pick a strategy preset — Value, Growth, Momentum, Conservative — or build your own rules with the visual editor.", delay: 0 },
            { step: "02", title: "Scan the universe", desc: "StockWiz evaluates 500+ stocks against your criteria and surfaces the ones worth watching — no manual research needed.", delay: 120 },
            { step: "03", title: "Get AI analysis", desc: "Click any stock and Claude AI gives you plain-English reasoning based on live data injected at request time.", delay: 240 },
          ].map(({ step, title, desc, delay }) => (
            <FadeIn key={step} direction="up" delay={delay}>
              <div className="relative p-6 bg-card border border-border/30 rounded-2xl hover:border-green/20 transition-colors">
                <div className="text-6xl font-black text-green/8 font-mono leading-none mb-4 select-none">{step}</div>
                <h3 className="text-white font-semibold text-base mb-2">{title}</h3>
                <p className="text-muted text-sm leading-relaxed">{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── FEATURES GRID ── */}
      <section className="relative z-10 px-8 py-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: <Bot size={17}/>,         title: "AI Stock Analysis",       desc: "Claude AI analyzes every stock with live data injected — no hallucinations, no generic advice.", delay: 0 },
            { icon: <Zap size={17}/>,         title: "Natural Language Search", desc: "Ask 'profitable tech stocks under PE 25' and get a filtered list back in seconds.", delay: 60 },
            { icon: <BarChart2 size={17}/>,   title: "Volume Profile Chart",    desc: "Real historical volume by price level — identifies support and resistance, not fake order book data.", delay: 120 },
            { icon: <TrendingUp size={17}/>,  title: "Portfolio P&L",           desc: "Track your real gains with auto-lookup of historical buy prices and AI sell signals.", delay: 0 },
            { icon: <ShieldCheck size={17}/>, title: "Custom Criteria",         desc: "Define your own buy/watch/sell rules visually. Changes apply to your screener immediately.", delay: 60 },
            { icon: <Star size={17}/>,        title: "90-Day Prediction",       desc: "Bull/base/bear price projections generated by Claude from recent momentum and fundamentals.", delay: 120 },
          ].map(({ icon, title, desc, delay }) => (
            <FadeIn key={title} direction="up" delay={delay}>
              <div className="bg-card border border-border/30 rounded-2xl p-5 hover:border-green/20 transition-colors group">
                <div className="w-9 h-9 rounded-xl bg-green/10 border border-green/20 flex items-center justify-center mb-4 text-green group-hover:bg-green/15 transition-colors">
                  {icon}
                </div>
                <p className="text-white font-semibold text-sm mb-1.5">{title}</p>
                <p className="text-muted text-xs leading-relaxed">{desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="relative z-10 px-8 py-20 max-w-7xl mx-auto">
        <FadeIn direction="up">
          <div className="text-center mb-12">
            <p className="text-green text-xs font-semibold uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-4xl font-bold text-white">Simple pricing, no surprises</h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <FadeIn direction="left" delay={0}>
            <div className="bg-card border border-green/20 rounded-2xl p-6 h-full">
              <p className="text-white font-bold text-lg mb-1">Free</p>
              <p className="text-3xl font-mono font-black text-white mb-1">$0<span className="text-muted text-sm font-normal">/mo</span></p>
              <p className="text-muted text-xs mb-5">Full dashboard, always free</p>
              <div className="space-y-2 mb-6">
                {["Stock Search Engine (500+ stocks)", "AI criteria builder + presets", "Portfolio tracker with P&L", "Live market data", "Volume Profile charts", "AI analysis + chat"].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-white/70">
                    <div className="w-4 h-4 rounded-full bg-green/15 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={9} className="text-green" />
                    </div>{f}
                  </div>
                ))}
              </div>
              <button onClick={scrollToAuth}
                className="w-full bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl py-2.5 text-sm font-semibold transition-colors">
                Get started free
              </button>
            </div>
          </FadeIn>
          <FadeIn direction="right" delay={100}>
            <div className="bg-card border border-border/40 rounded-2xl p-6 h-full relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-purple/20 text-purple-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple/30">Coming soon</div>
              <p className="text-white font-bold text-lg mb-1">Pro</p>
              <p className="text-3xl font-mono font-black text-white mb-1">$12<span className="text-muted text-sm font-normal">/mo</span></p>
              <p className="text-muted text-xs mb-5">For serious investors</p>
              <div className="space-y-2 mb-6">
                {["Everything in Free", "Price & criteria alerts (email)", "Backtesting engine", "News & earnings injection", "Priority AI analysis"].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-white/50">
                    <div className="w-4 h-4 rounded-full bg-purple/15 flex items-center justify-center flex-shrink-0">
                      <ChevronRight size={9} className="text-purple-400" />
                    </div>{f}
                  </div>
                ))}
              </div>
              <button disabled className="w-full bg-white/5 text-muted rounded-xl py-2.5 text-sm font-semibold cursor-not-allowed">Notify me</button>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── CTA + AUTH ── */}
      <section ref={authRef} className="relative z-10 px-8 py-20 max-w-7xl mx-auto">
        <FadeIn direction="up">
          <div className="bg-gradient-to-br from-green/8 to-purple-500/5 border border-green/15 rounded-3xl px-8 py-14 text-center">
            <h2 className="text-4xl font-bold text-white mb-3">Ready to invest smarter?</h2>
            <p className="text-muted mb-10 max-w-md mx-auto text-sm">
              Join investors using StockWiz to make data-driven decisions backed by live AI analysis.
            </p>
            <div className="flex justify-center">
              <AuthForm />
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-border/20 px-8 py-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-green/15 flex items-center justify-center">
              <TrendingUp size={12} className="text-green" />
            </div>
            <span className="text-white font-semibold text-sm">StockWiz</span>
          </div>
          <p className="text-muted text-xs">© 2026 StockWiz · Not financial advice. Past performance does not guarantee future results.</p>
          <div className="flex gap-6 text-xs text-muted">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </footer>

      {/* Float keyframe */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          33% { transform: translateY(-20px) translateX(10px); }
          66% { transform: translateY(10px) translateX(-10px); }
        }
      `}</style>
    </div>
  );
}
