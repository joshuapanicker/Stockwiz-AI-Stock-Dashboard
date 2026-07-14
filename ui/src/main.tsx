import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import LandingPage from "./components/LandingPage";
import CustomCursor from "./components/CustomCursor";
import IntroLoader from "./components/landing/IntroLoader";
import { AuthProvider, useAuth } from "./context/AuthContext";
import "./index.css";

function Root() {
  const { user, loading } = useAuth();
  // Always show the intro splash on every page load / reload
  const [intro, setIntro] = useState(true);

  // Once auth finishes loading, if user is signed in the intro is already
  // playing (mounted from the start). If not signed in, hide it so the
  // landing page shows immediately.
  useEffect(() => {
    if (loading) return;
    if (!user) setIntro(false);
  }, [user, loading]);

  if (loading) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-green/30 border-t-green rounded-full animate-spin" />
          <p className="text-muted text-xs">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {user ? <App /> : <LandingPage />}
      {intro && (
        <IntroLoader
          key="post-auth-intro"
          onReveal={() => window.setTimeout(() => setIntro(false), 1000)}
        />
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
      <CustomCursor />
      <Analytics />
    </AuthProvider>
  </React.StrictMode>
);
