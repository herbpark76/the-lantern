import { BookOpen, Library, Bookmark, Settings, Moon, Sun, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useRouter } from "@/lib/router";

export function Nav() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { path, navigate } = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthor = profile?.role === "author" || profile?.role === "admin";

  const links = [
    { label: "Library", href: "/", icon: Library, show: true },
    { label: "My Shelf", href: "/shelf", icon: Bookmark, show: !!profile },
    { label: "Studio", href: "/studio", icon: Settings, show: isAuthor },
  ];

  const isActive = (href: string) => {
    if (href === "/") return path === "/";
    return path.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 bg-ink-50/85 dark:bg-ink-950/85 backdrop-blur-md border-b border-ink-200 dark:border-ink-800">
      <nav className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <button
          onClick={() => { navigate("/"); setMobileOpen(false); }}
          className="flex items-center gap-2 font-serif text-lg text-ink-900 dark:text-ink-50 hover:opacity-80 transition-opacity"
        >
          <BookOpen size={20} className="text-accent-500" />
          <span className="hidden sm:inline">The Lantern</span>
        </button>

        <div className="hidden sm:flex items-center gap-1">
          {links.filter((l) => l.show).map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.href}
                onClick={() => navigate(link.href)}
                className={`btn-ghost ${isActive(link.href) ? "text-accent-600 dark:text-accent-400 bg-ink-100 dark:bg-ink-800" : ""}`}
              >
                <Icon size={16} />
                {link.label}
              </button>
            );
          })}

          <button onClick={toggleTheme} className="btn-ghost" aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {profile ? (
            <button
              onClick={() => { signOut(); navigate("/"); }}
              className="btn-ghost"
              aria-label="Sign out"
            >
              <LogOut size={16} />
              <span className="hidden md:inline">{profile.display_name}</span>
            </button>
          ) : (
            <button onClick={() => navigate("/auth")} className="btn-primary !py-2 !px-4">
              Sign In
            </button>
          )}
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="sm:hidden btn-ghost !px-2"
          aria-label="Menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="sm:hidden border-t border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-950 animate-slide-up">
          <div className="px-4 py-3 flex flex-col gap-1">
            {links.filter((l) => l.show).map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.href}
                  onClick={() => { navigate(link.href); setMobileOpen(false); }}
                  className={`btn-ghost justify-start ${isActive(link.href) ? "text-accent-600 dark:text-accent-400" : ""}`}
                >
                  <Icon size={16} />
                  {link.label}
                </button>
              );
            })}
            <button onClick={toggleTheme} className="btn-ghost justify-start">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {profile ? (
              <button onClick={() => { signOut(); navigate("/"); setMobileOpen(false); }} className="btn-ghost justify-start">
                <LogOut size={16} />
                Sign out ({profile.display_name})
              </button>
            ) : (
              <button onClick={() => { navigate("/auth"); setMobileOpen(false); }} className="btn-primary justify-start">
                Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
