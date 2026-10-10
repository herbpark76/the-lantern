import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { RouterProvider, useRouter, parsePath } from "@/lib/router";
import { Nav } from "@/components/Nav";
import { AuthPage } from "@/pages/Auth";
import { ConfirmedPage } from "@/pages/Confirmed";
import { LibraryPage } from "@/pages/Library";
import { StoryDetailPage } from "@/pages/StoryDetail";
import { ReaderPage } from "@/pages/Reader";
import { ShelfPage } from "@/pages/Shelf";
import { StudioPage } from "@/pages/Studio";
import { InterviewPage } from "@/pages/Interview";

// "/interview/last%20exit" → "last exit"
function decodeSegment(seg: string | undefined): string | undefined {
  if (!seg) return seg;
  try { return decodeURIComponent(seg); } catch { return seg; }
}

function Routes() {
  const { path } = useRouter();
  const { segments } = parsePath(path);

  // Interview Mode is a full-screen, nav-free page. /interview/<slug> picks one of several interviews.
  if (segments[0] === "interview") return <InterviewPage slug={decodeSegment(segments[1])} />;

  let page: React.ReactNode;

  if (segments.length === 0) {
    page = <LibraryPage />;
  } else if (segments[0] === "auth" && segments[1] === "confirmed") {
    page = <ConfirmedPage />;
  } else if (segments[0] === "auth") {
    page = <AuthPage />;
  } else if (segments[0] === "shelf") {
    page = <ShelfPage />;
  } else if (segments[0] === "studio") {
    page = <StudioPage />;
  } else if (segments[0] === "story" && segments[1]) {
    page = <StoryDetailPage slug={segments[1]} />;
  } else if (segments[0] === "read" && segments[1] && segments[2]) {
    page = <ReaderPage slug={segments[1]} playthroughId={segments[2]} />;
  } else {
    page = (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-ink-500 dark:text-ink-400">Page not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <Nav />
      <main>{page}</main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider>
          <Routes />
        </RouterProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
