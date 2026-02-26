import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useState, useRef, useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import "../styles.css";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800">
        <nav className="mx-auto flex max-w-6xl items-center gap-2 md:gap-6 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-2xl font-bold text-white hover:text-orange-400">
            <img src="/favicon.png" alt="" className="h-9 w-9" />
            <span className="hidden sm:inline">StrawHub</span>
          </Link>

          {/* Desktop nav links */}
          <Link to="/skills" className="hidden md:block text-sm text-gray-400 hover:text-white">
            Skills
          </Link>
          <Link to="/roles" className="hidden md:block text-sm text-gray-400 hover:text-white">
            Roles
          </Link>
          <Link to="/search" className="hidden md:block text-sm text-gray-400 hover:text-white">
            Search
          </Link>
          <Link to="/upload" className="hidden md:block text-sm text-gray-400 hover:text-white">
            Publish
          </Link>
          <Link to="/stars" className="hidden md:block text-sm text-gray-400 hover:text-white">
            Stars
          </Link>

          <div className="flex-1" />

          {isLoading ? (
            <span className="text-sm text-gray-500">...</span>
          ) : isAuthenticated ? (
            <UserMenu onSignOut={() => void signOut()} />
          ) : (
            <button
              onClick={() => void signIn("github")}
              className="text-sm text-gray-400 hover:text-white"
            >
              Sign in
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden ml-2 p-1.5 text-gray-400 hover:text-white"
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </nav>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-800 px-4 py-3 space-y-1">
            <Link to="/skills" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-gray-400 hover:text-white">
              Skills
            </Link>
            <Link to="/roles" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-gray-400 hover:text-white">
              Roles
            </Link>
            <Link to="/search" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-gray-400 hover:text-white">
              Search
            </Link>
            <Link to="/upload" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-gray-400 hover:text-white">
              Publish
            </Link>
            <Link to="/stars" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-sm text-gray-400 hover:text-white">
              Stars
            </Link>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-8">
        <Outlet />
      </main>
      <footer className="border-t border-gray-800 py-6 text-center text-sm text-gray-500">
        <p>
          StrawHub &middot; A{" "}
          <a
            href="https://strawpot.com"
            className="underline decoration-gray-700 hover:decoration-gray-400 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            StrawPot
          </a>{" "}
          project &middot;{" "}
          <a
            href="https://github.com/strawpot/strawhub"
            className="underline decoration-gray-700 hover:decoration-gray-400 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source (MIT)
          </a>{" "}
          &middot; Chris La
        </p>
      </footer>
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const user = useQuery(api.users.me);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-gray-700 py-1 pl-1 pr-3 text-sm text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
      >
        {user?.image ? (
          <img src={user.image} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-xs font-bold">
            {(user?.name || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <span>{user?.handle ? `@${user.handle}` : user?.name || "User"}</span>
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-lg z-50">
          <Link
            to="/dashboard"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Settings
          </Link>
          {(user?.role === "admin" || user?.role === "moderator") && (
            <>
              <div className="my-1 border-t border-gray-800" />
              <Link
                to="/reports"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Reports
              </Link>
              <Link
                to="/scan-queue"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                Scan Queue
              </Link>
            </>
          )}
          {user?.role === "admin" && (
            <Link
              to="/users"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Users
            </Link>
          )}
          <div className="my-1 border-t border-gray-800" />
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="block w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
