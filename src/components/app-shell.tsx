import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Compass,
  Database,
  Gavel,
  LayoutDashboard,
  LineChart,
  Menu,
  Trophy,
  Wallet,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { HelixMark } from "@/components/helix-mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatPoints } from "@/lib/money";
import { canViewAdmin, roleLabel } from "@/lib/permissions";
import { getBootstrap } from "@/lib/server/api";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [boot, setBoot] = useState<Awaited<ReturnType<typeof getBootstrap>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!user) return;
    getBootstrap()
      .then(setBoot)
      .catch((err: Error) => setError(err.message));
  }, [user]);

  if (isPending) return <ShellSkeleton />;
  if (!user) return <RedirectToSignIn />;
  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!boot) return <ShellSkeleton />;
  if (!boot.actor.acceptedConductAt && pathname !== "/onboarding") {
    return <Navigate to="/onboarding" />;
  }

  const nav = [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/markets", label: "Markets", icon: Compass },
    { to: "/portfolio", label: "Portfolio", icon: Wallet },
    { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { to: "/notifications", label: "Inbox", icon: Bell, badge: boot.unread },
    ...(canViewAdmin(boot.actor.role)
      ? [
          { to: "/admin", label: "Admin", icon: Gavel },
          { to: "/admin/crm", label: "CRM", icon: Database },
        ]
      : []),
    { to: "/docs", label: "Guide", icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <HelixMark />
          <div>
            <p className="font-display text-xl leading-none">Helix</p>
            <p className="mt-1 text-[11px] tracking-[0.12em] text-muted-foreground uppercase">Northstar</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to))
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge ? (
                <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-muted text-xs font-medium">
              {initials(boot.actor.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{boot.actor.name}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabel(boot.actor.role)}</p>
            </div>
          </div>
          <p className="mt-3 font-mono text-lg tabular-nums">{formatPoints(boot.actor.balanceMilli, 0)} pts</p>
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => void signOut("/login")}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <SheetHeader className="p-5">
                <SheetTitle className="flex items-center gap-2">
                  <HelixMark className="size-7" /> Helix
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-3">
                {nav.map((item) => (
                  <Link key={item.to} to={item.to} className="flex h-11 items-center gap-3 rounded-md px-3 text-sm">
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <HelixMark className="size-7" />
          <span className="font-display text-lg">Helix</span>
          <span className="ml-auto font-mono text-sm tabular-nums">{formatPoints(boot.actor.balanceMilli, 0)}</span>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card lg:hidden">
        {nav.slice(0, 5).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 text-[10px]",
              pathname === item.to ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-background p-6">
      <Skeleton className="h-10 w-40" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <LineChart className="mt-10 size-8 text-muted" />
    </div>
  );
}
