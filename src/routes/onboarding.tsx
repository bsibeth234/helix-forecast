import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { acceptConduct } from "@/lib/server/api";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

function Onboarding() {
  const navigate = useNavigate();
  const [conduct, setConduct] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Before you forecast</p>
          <h1 className="mt-2 font-display text-4xl">How Helix works</h1>
        </header>
        <ol className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">1. A market is a measurable question.</strong> Administrators publish an objective resolution statement and a CRM source. If the statement is true, the matching outcome pays.
          </li>
          <li>
            <strong className="text-foreground">2. You spend virtual points, not money.</strong> Points cannot be withdrawn, sold, or converted to cash. They are a scoring chip for calibration.
          </li>
          <li>
            <strong className="text-foreground">3. The price is a probability.</strong> Buying Yes raises the implied chance. Selling lowers it. Helix uses an automated market maker so you always have a counterparty.
          </li>
          <li>
            <strong className="text-foreground">4. Do not game the business to win a market.</strong> Operating activity that exists only to move a Helix price is a conduct violation.
          </li>
        </ol>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={conduct} onCheckedChange={(v) => setConduct(Boolean(v))} />
            <span>I understand participation is voluntary, points have no cash value, and Helix results are not the sole basis for employment decisions.</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={conflict} onCheckedChange={(v) => setConflict(Boolean(v))} />
            <span>I will disclose conflicts (for example, I own the CRM records that resolve a market I am forecasting) and will not manipulate operational activity to influence a price.</span>
          </label>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          disabled={!conduct || !conflict || busy}
          onClick={() => {
            setBusy(true);
            acceptConduct({ data: { conflictDisclosed: true } })
              .then(() => navigate({ to: "/" }))
              .catch((err: Error) => {
                setError(err.message);
                setBusy(false);
              });
          }}
        >
          {busy ? "Saving…" : "Enter Helix"}
        </Button>
      </div>
    </AppShell>
  );
}
