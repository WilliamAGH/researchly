/**
 * Account section for the control panel dropdown.
 * Shows user email + sign-out when authenticated, sign-in/up when anonymous.
 */

import React, { useCallback } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";

interface AccountSectionProps {
  readonly onSignIn: () => void;
  readonly onSignUp: () => void;
  readonly onClose: () => void;
}

export const AccountSection = React.memo(function AccountSection({
  onSignIn,
  onSignUp,
  onClose,
}: AccountSectionProps) {
  const { isAuthenticated } = useConvexAuth();

  if (isAuthenticated) {
    return <AuthenticatedAccount onClose={onClose} />;
  }

  return <AnonymousAccount onSignIn={onSignIn} onSignUp={onSignUp} />;
});

function AuthenticatedAccount({ onClose }: Readonly<{ onClose: () => void }>) {
  const user = useQuery(api.auth.loggedInUser);
  const { signOut } = useAuthActions();

  const handleSignOut = useCallback(() => {
    onClose();
    void signOut();
  }, [onClose, signOut]);

  return (
    <div className="px-4 py-3">
      <span className="block text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 font-ui">
        Account
      </span>
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-sm text-gray-700 dark:text-gray-300 truncate font-ui"
          title={user?.email ?? undefined}
        >
          {user?.email ?? "Loading..."}
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          className="shrink-0 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors font-ui"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function AnonymousAccount({
  onSignIn,
  onSignUp,
}: Readonly<{ onSignIn: () => void; onSignUp: () => void }>) {
  return (
    <div className="px-4 py-3 flex items-center gap-2">
      <button
        type="button"
        onClick={onSignUp}
        className="flex-1 text-center text-sm font-medium py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-colors font-ui"
      >
        Sign up
      </button>
      <button
        type="button"
        onClick={onSignIn}
        className="flex-1 text-center text-sm font-medium py-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-ui"
      >
        Sign in
      </button>
    </div>
  );
}
