import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { HelixMark } from "@/components/helix-mark";

export const Route = createFileRoute("/docs")({ component: DocsPage });

function DocsPage() {
  const { user } = useCurrentUserState();
  const body = (
    <article className="prose-custom mx-auto max-w-3xl space-y-8">
      <h1 className="font-display text-4xl">Guide</h1>
      <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <h2 className="font-display text-2xl text-foreground">What Helix is</h2>
        <p>
          Helix is Northstar Commerce’s private forecasting room. Participants spend <strong className="text-foreground">virtual points</strong> to express how likely a measurable sales outcome is. Points have no cash value, cannot be withdrawn, and cannot leave the organization.
        </p>
        <h2 className="font-display text-2xl text-foreground">How a forecast is priced</h2>
        <p>
          Helix uses a Logarithmic Market Scoring Rule (LMSR). A liquidity parameter <em>b</em> controls how much a trade moves the probability. Buying an outcome raises its price; selling lowers it. Each share pays 1 point if that outcome is true and 0 otherwise.
        </p>
        <p>
          Worked example: with b = 100 and a 50/50 book, buying 10 Yes shares costs about 5.10 points and lifts Yes from 50.0% to 52.5%. If Yes resolves true those 10 shares pay 10 points.
        </p>
        <h2 className="font-display text-2xl text-foreground">Workplace rules</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Participation is voluntary.</li>
          <li>Team and aggregate questions are the default. Individual markets need consent and stay restricted.</li>
          <li>No markets on termination, compensation, health, leave, protected classes, or misconduct.</li>
          <li>Do not manipulate CRM activity to move a Helix price.</li>
          <li>Helix is not the sole basis for employment decisions.</li>
        </ul>
        <h2 className="font-display text-2xl text-foreground">Demo script</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Sign in as Jordan Hale (market admin) and publish a binary KPI market.</li>
          <li>Switch to Morgan Patel and buy Yes on Team Alpha’s quota market.</li>
          <li>Switch to Quinn Brooks and take the other side — watch the probability move.</li>
          <li>As Jordan, open CRM studio, advance a simulated week, then run the settlement job on the closed Bravo quota market.</li>
          <li>Inspect wallets, the leaderboard, and the market audit trail.</li>
          <li>Cancel a leftover market to confirm refunds, then open and dismiss the July win-rate dispute.</li>
        </ol>
        <p>
          Demo password for every seeded account: <span className="font-mono text-foreground">Helix-Forecast-2026</span>
        </p>
      </section>
    </article>
  );
  if (!user) {
    return (
      <main className="min-h-screen bg-background px-6 py-12">
        <div className="mb-8 flex items-center gap-3">
          <HelixMark />
          <span className="font-display text-2xl">Helix</span>
        </div>
        {body}
      </main>
    );
  }
  return <AppShell>{body}</AppShell>;
}
