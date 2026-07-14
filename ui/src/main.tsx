import React, { useEffect, useRef, useState } from "react";
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
  // The intro curtain plays when someone freshly signs in — email login,
  // signup, or OAuth return. A restored session on a normal page reload
  // skips it so returning users go straight to the dashboard.
  const wasSignedOut = useRef(false);
  const isOAuthReturn = useRef(
    typeof window !== "undefined" && window.location.hash.includes("access_token"),
  );
  const [intro, setIntro] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // User is on the landing/auth page — mark that we saw them signed out
      wasSignedOut.current = true;
      return;
    }
    // User is now signed in
    if (wasSignedOut.current || isOAuthReturn.current) {
      wasSignedOut.current = false;
      isOAuthReturn.current = false;
      setIntro(true);
    }
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
