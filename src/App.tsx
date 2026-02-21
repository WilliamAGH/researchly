/**
 * Root application component
 * - Auth state management (sign-in/sign-up modals)
 * - Theme provider wrapper
 * - Responsive header with branding
 * - Sidebar toggle for mobile
 * - Conditional rendering for auth/unauth users
 */

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";

const SignInModal = React.lazy(() =>
  import("@/components/SignInModal").then((mod) => ({
    default: mod.SignInModal,
  })),
);
const SignUpModal = React.lazy(() =>
  import("@/components/SignUpModal").then((mod) => ({
    default: mod.SignUpModal,
  })),
);
import { ControlPanel } from "@/components/ControlPanel/ControlPanel";
import { useClaimAnonymousChats } from "@/hooks/useClaimAnonymousChats";
import { ChatPage } from "@/components/ChatPage";
import { toastIcons } from "@/components/toastIcons";
import { DESKTOP_BREAKPOINT } from "@/lib/constants/layout";

export default function App() {
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasManuallyToggled, setHasManuallyToggled] = useState(false);

  // Keep the app pinned to the Visual Viewport on iOS Safari (address bar + keyboard).
  useEffect(() => {
    const setAppDvh = () => {
      const vv = globalThis.visualViewport;
      const height = vv?.height ?? globalThis.innerHeight;
      document.documentElement.style.setProperty("--app-dvh", `${height}px`);
    };

    setAppDvh();

    let rafId: number | null = null;
    const scheduleSetAppDvh = () => {
      if (rafId !== null) return;
      rafId = globalThis.requestAnimationFrame(() => {
        rafId = null;
        setAppDvh();
      });
    };

    const vv = globalThis.visualViewport;
    vv?.addEventListener("resize", setAppDvh);
    vv?.addEventListener("scroll", setAppDvh);
    globalThis.addEventListener("resize", setAppDvh);
    globalThis.addEventListener("orientationchange", setAppDvh);
    globalThis.addEventListener("scroll", scheduleSetAppDvh, true);

    return () => {
      vv?.removeEventListener("resize", setAppDvh);
      vv?.removeEventListener("scroll", setAppDvh);
      globalThis.removeEventListener("resize", setAppDvh);
      globalThis.removeEventListener("orientationchange", setAppDvh);
      globalThis.removeEventListener("scroll", scheduleSetAppDvh, true);
      if (rafId !== null) globalThis.cancelAnimationFrame(rafId);
    };
  }, []);

  useClaimAnonymousChats();

  // Handle responsive sidebar behavior
  useEffect(() => {
    const syncSidebarToLayout = (isDesktop: boolean) => {
      setIsSidebarOpen((current) => {
        if (!isDesktop && current) {
          return false;
        }
        return current;
      });
    };

    let lastIsDesktop = globalThis.innerWidth >= DESKTOP_BREAKPOINT;

    const handleResize = () => {
      const isDesktop = globalThis.innerWidth >= DESKTOP_BREAKPOINT;

      if (hasManuallyToggled) {
        if (isDesktop !== lastIsDesktop) {
          setHasManuallyToggled(false);
          syncSidebarToLayout(isDesktop);
        }
      } else {
        syncSidebarToLayout(isDesktop);
      }

      lastIsDesktop = isDesktop;
    };

    if (!hasManuallyToggled) {
      handleResize();
    }

    globalThis.addEventListener("resize", handleResize);
    return () => globalThis.removeEventListener("resize", handleResize);
  }, [hasManuallyToggled]);

  const openSignUp = useCallback(() => {
    setShowSignInModal(false);
    setShowSignUpModal(true);
  }, []);

  const openSignIn = useCallback(() => {
    setShowSignUpModal(false);
    setShowSignInModal(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      return !prev;
    });
    setHasManuallyToggled(true);
  }, []);

  const closeSignIn = useCallback(() => {
    setShowSignInModal(false);
  }, []);

  const closeSignUp = useCallback(() => {
    setShowSignUpModal(false);
  }, []);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="h-full min-w-0 overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800">
          <div className="h-full min-w-0 flex flex-col">
            <header className="flex-shrink-0 sticky top-0 z-50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200/30 dark:border-gray-700/30">
              <div className="h-[3.75rem] sm:h-16 flex items-center justify-between pl-3 sm:pl-4 pr-4 sm:pr-6 lg:pr-8">
                <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    className="flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ring-1 ring-gray-200/60 dark:ring-gray-700/60 hover:ring-emerald-400/50 dark:hover:ring-emerald-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    aria-label="Toggle sidebar"
                  >
                    <svg
                      className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>

                  <Link
                    to="/"
                    aria-label="Go home"
                    className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-md flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <title>Search</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </Link>
                  <span className="text-lg font-semibold !normal-case tracking-normal text-gray-900 dark:text-white truncate max-w-[40vw]">
                    Researchly
                  </span>
                </div>

                <ControlPanel onSignIn={openSignIn} onSignUp={openSignUp} />
              </div>
            </header>

            <main className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
              <Routes>
                {[
                  "/",
                  "/chat",
                  "/chat/:chatId",
                  "/s/:shareId",
                  "/p/:publicId",
                ].map((path) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <ChatPage
                        isSidebarOpen={isSidebarOpen}
                        onToggleSidebar={toggleSidebar}
                      />
                    }
                  />
                ))}
              </Routes>
            </main>

            <Toaster position="top-center" icons={toastIcons} />

            {showSignInModal && (
              <Suspense fallback={null}>
                <SignInModal
                  isOpen={showSignInModal}
                  onClose={closeSignIn}
                  onSwitchToSignUp={openSignUp}
                />
              </Suspense>
            )}
            {showSignUpModal && (
              <Suspense fallback={null}>
                <SignUpModal
                  isOpen={showSignUpModal}
                  onClose={closeSignUp}
                  onSwitchToSignIn={openSignIn}
                />
              </Suspense>
            )}
          </div>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
