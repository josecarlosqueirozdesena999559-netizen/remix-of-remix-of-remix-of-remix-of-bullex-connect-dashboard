import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { resetRobotPresentationState } from "@/lib/robotPresentation";
import { resetRobotSettings } from "@/lib/robotSettings";
import { useAuth } from "@/lib/useAuth";
import { resetBullExAccountState } from "@/hooks/useBullExAccount";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn&apos;t load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BullEx AutoBot" },
      {
        name: "description",
        content: "Painel de controle do BullEx AutoBot para operações automáticas.",
      },
      { name: "author", content: "BullEx" },
      { property: "og:title", content: "BullEx AutoBot" },
      {
        property: "og:description",
        content: "Painel de controle do BullEx AutoBot para operações automáticas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@BullEx" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthStateBoundary>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </AuthStateBoundary>
      <WhatsAppButton />
      <Toaster />
    </QueryClientProvider>
  );
}

function AuthStateBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  const [readyUserId, setReadyUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;

    const nextUserId = user?.id ?? null;
    if (previousUserIdRef.current === nextUserId) {
      setReadyUserId(nextUserId);
      return;
    }

    const previousUserId = previousUserIdRef.current ?? null;
    previousUserIdRef.current = nextUserId;
    setReadyUserId(undefined);
    console.log("[AUTH USER CHANGED]", {
      previous_user_id: previousUserId,
      user_id: nextUserId,
    });

    void queryClient.cancelQueries().then(() => {
      queryClient.clear();
      resetBullExAccountState(previousUserId);
      resetBullExAccountState(nextUserId);
      resetRobotSettings();
      resetRobotPresentationState();
      console.log("[ROBOT STATE RESET]");
      setReadyUserId(nextUserId);
    });
  }, [loading, queryClient, user?.id]);

  if (loading || readyUserId !== (user?.id ?? null)) return null;
  return children;
}
