import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { BookOpen, Mail, Lock, User, Loader2 } from "lucide-react";

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const { navigate } = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "signup") {
      const { error } = await signUp(email, password, displayName || email.split("@")[0]);
      if (error) {
        setError(error);
        setLoading(false);
      } else {
        navigate("/");
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        setError(error);
        setLoading(false);
      } else {
        navigate("/");
      }
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <BookOpen size={32} className="text-accent-500 mx-auto mb-3" />
          <h1 className="font-serif text-2xl text-ink-900 dark:text-ink-50">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-2 font-sans">
            {mode === "signup"
              ? "The first account becomes the admin."
              : "Sign in to continue your stories."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-sans text-ink-600 dark:text-ink-400 mb-1.5">
                Display name
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-field pl-10"
                  placeholder="Jane Doe"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-sans text-ink-600 dark:text-ink-400 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-sans text-ink-600 dark:text-ink-400 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-error-500 bg-error-500/10 rounded-lg px-4 py-3 font-sans">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); }}
            className="btn-ghost"
          >
            {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
