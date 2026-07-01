import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthPage from "./components/AuthPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import "./index.css";

function Root() {
  const { user, loading } = useAuth();

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

  return user ? <App /> : <AuthPage />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
