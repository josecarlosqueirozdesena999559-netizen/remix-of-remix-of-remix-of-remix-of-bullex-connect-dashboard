import { useEffect, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthSnapshot = {
  user: User | null;
  loading: boolean;
};

const listeners = new Set<() => void>();
const serverSnapshot: AuthSnapshot = { user: null, loading: true };
let authSnapshot: AuthSnapshot = serverSnapshot;
let initialized = false;

export function useAuth() {
  useEffect(() => {
    initializeAuth();
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function initializeAuth() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    updateSnapshot(session?.user ?? null, false);
  });

  void supabase.auth
    .getSession()
    .then(({ data }) => {
      updateSnapshot(data.session?.user ?? null, false);
    })
    .catch((error) => {
      console.error("[AUTH_INIT_ERROR]", error);
      updateSnapshot(null, false);
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return authSnapshot;
}

function getServerSnapshot() {
  return serverSnapshot;
}

function updateSnapshot(user: User | null, loading: boolean) {
  if (authSnapshot.user?.id === user?.id && authSnapshot.loading === loading) return;
  authSnapshot = { user, loading };
  listeners.forEach((listener) => listener());
}
