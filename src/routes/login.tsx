import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HelixMark } from "@/components/helix-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";
import { roleLabel } from "@/lib/permissions";
import { ensureDemoReady } from "@/lib/server/api";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0]!.email);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void ensureDemoReady();
  }, []);

  async function onEmailSignIn(nextEmail = email, nextPassword = password) {
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await authClient.signIn.email({
        email: nextEmail,
        password: nextPassword,
      });
      if (err) throw new Error(err.message ?? "Sign-in failed");
      const token = (data as { token?: string } | null)?.token;
      if (token) {
        try {
          sessionStorage.setItem("grok-auth.bearer-token", token);
        } catch {
          /* ignore */
        }
      }
      await authClient.getSession();
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between px-6 py-10 lg:px-12 lg:py-14">
          <Link to="/" className="flex items-center gap-3">
            <HelixMark />
            <span className="font-display text-2xl">Helix</span>
          </Link>
          <div className="max-w-xl py-12">
            <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">Internal forecasting room</p>
            <h1 className="mt-4 font-display text-5xl leading-[1.05] text-balance">Collective intelligence for sales outcomes.</h1>
            <p className="mt-5 max-w-md text-base text-muted-foreground">
              Helix is a private, company-operated market. You forecast measurable KPIs with virtual points — not money.
              Prices are probabilities. Nothing here is a wager, a bonus, or an employment score.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Northstar Commerce · virtual points only · no cash value</p>
        </section>

        <section className="border-t border-border bg-card px-6 py-10 lg:border-t-0 lg:border-l lg:px-10 lg:py-14">
          <h2 className="font-display text-2xl">Enter the room</h2>
          <p className="mt-1 text-sm text-muted-foreground">Demo accounts share the password {DEMO_PASSWORD}.</p>

          {authEnabled ? (
            <div className="mt-6 grid gap-2">
              {GROK_PROVIDERS.map((p) => (
                <Button key={p.providerId} type="button" variant="outline" onClick={() => signIn(p.providerId, { callbackURL: "/" })}>
                  Continue with {p.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Sign-in is disabled.</p>
          )}

          <div className="my-6 h-px bg-border" />

          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void onEmailSignIn();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in with email"}
            </Button>
          </form>

          <div className="mt-8">
            <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Try a role</p>
            <div className="mt-3 grid gap-2">
              {DEMO_ACCOUNTS.filter((a) =>
                ["usr_avery", "usr_jordan", "usr_sam", "usr_morgan", "usr_drew", "usr_jamie"].includes(a.id),
              ).map((account) => (
                <button
                  key={account.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                    void onEmailSignIn(account.email, DEMO_PASSWORD);
                  }}
                  className="flex h-12 items-center justify-between rounded-md border border-border bg-background px-3 text-left text-sm hover:border-primary/40"
                >
                  <span>
                    <span className="font-medium">{account.name}</span>
                    <span className="ml-2 text-muted-foreground">{roleLabel(account.role)}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">Enter</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
