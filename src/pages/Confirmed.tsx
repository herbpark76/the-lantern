import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { CheckCircle, Loader2, Library, Settings } from "lucide-react";

export function ConfirmedPage() {
  const { session, profile, loading } = useAuth();
  const { navigate } = useRouter();
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setWaiting(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const isAuthor = profile?.role === "author" || profile?.role === "admin";
  const hasSession = !!session;

  if (loading || (waiting && !hasSession)) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={24} className="animate-spin text-ink-400 mx-auto mb-3" />
          <p className="text-sm font-sans text-ink-500 dark:text-ink-400">Confirming your email…</p>
        </div>
      </div>
    );
  }

  if (hasSession) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center max-w-md animate-fade-in">
          <CheckCircle size={32} className="text-success-500 mx-auto mb-4" />
          <h1 className="font-serif text-2xl text-ink-900 dark:text-ink-50 mb-2">
            You're in
          </h1>
          <p className="text-ink-500 dark:text-ink-400 font-sans text-sm mb-6">
            Your email is confirmed. Welcome to The Lantern.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate("/")} className="btn-primary">
              <Library size={16} /> Go to Library
            </button>
            {isAuthor && (
              <button onClick={() => navigate("/studio")} className="btn-secondary">
                <Settings size={16} /> Author Studio
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="text-center max-w-md animate-fade-in">
        <CheckCircle size={32} className="text-success-500 mx-auto mb-4" />
        <h1 className="font-serif text-2xl text-ink-900 dark:text-ink-50 mb-2">
          Your email is confirmed
        </h1>
        <p className="text-ink-500 dark:text-ink-400 font-sans text-sm mb-6">
          Please sign in to continue.
        </p>
        <button onClick={() => navigate("/auth")} className="btn-primary">
          Sign In
        </button>
      </div>
    </div>
  );
}
