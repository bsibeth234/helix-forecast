import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createMarket, listLookups } from "@/lib/server/api";

export const Route = createFileRoute("/markets/new")({ component: NewMarket });

function NewMarket() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [lookups, setLookups] = useState<Awaited<ReturnType<typeof listLookups>> | null>(null);
  const [type, setType] = useState<"binary" | "multiple_choice" | "numeric_range">("binary");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resolution, setResolution] = useState("");
  const [source, setSource] = useState("Simulated CRM");
  const [period, setPeriod] = useState("Q3 2026");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [kpiId, setKpiId] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<"public_org" | "team_only" | "restricted">("public_org");
  const [scope, setScope] = useState<"organization" | "team" | "individual">("team");
  const [opensAt, setOpensAt] = useState(new Date().toISOString().slice(0, 16));
  const [closesAt, setClosesAt] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16));
  const [prob, setProb] = useState(50);
  const [choices, setChoices] = useState("Team Alpha\nTeam Bravo\nTeam Charlie");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listLookups().then(setLookups);
  }, []);

  const outcomes =
    type === "binary"
      ? [
          { key: "yes", label: "Yes" },
          { key: "no", label: "No" },
        ]
      : choices
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((label, i) => ({ key: `o${i}`, label }));

  const steps = ["Type", "Question", "Scope", "Timing", "Preview"];

  async function publish(asDraft: boolean) {
    setBusy(true);
    try {
      const resolveAfter = new Date(new Date(closesAt).getTime() + 86400000).toISOString();
      const result = await createMarket({
        data: {
          title,
          description,
          marketType: type,
          outcomes,
          scope,
          teamId,
          subjectUserId: null,
          privacy,
          kpiId,
          period,
          resolutionStatement: resolution,
          dataSource: source,
          opensAt: new Date(opensAt).toISOString(),
          closesAt: new Date(closesAt).toISOString(),
          resolveAfter,
          liquidityB: 400,
          maxPositionPoints: 2500,
          eligibility: "all",
          startingYesProb: type === "binary" ? prob / 100 : undefined,
          featured: false,
          autoResolve: Boolean(kpiId),
          publish: !asDraft,
          subjectConsent: scope !== "individual",
        },
      });
      toast.success(asDraft ? "Draft saved" : "Market published");
      await navigate({ to: "/markets/$marketId", params: { marketId: result.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create market");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Create</p>
      <h1 className="font-display text-4xl">New market</h1>
      <ol className="mt-4 flex gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className={i === step ? "font-medium text-foreground" : "text-muted-foreground"}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <div className="mt-8 max-w-2xl space-y-5">
        {step === 0 ? (
          <div className="grid gap-3">
            {(["binary", "multiple_choice", "numeric_range"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-xl border p-4 text-left ${type === t ? "border-primary" : "border-border"}`}
              >
                <p className="font-medium">{t === "binary" ? "Yes / No" : t === "multiple_choice" ? "Multiple choice" : "Numeric range buckets"}</p>
                <p className="text-sm text-muted-foreground">
                  {t === "binary" ? "A single measurable threshold." : t === "multiple_choice" ? "Which team or option wins." : "Discretized numeric KPI."}
                </p>
              </button>
            ))}
          </div>
        ) : null}
        {step === 1 ? (
          <div className="grid gap-3">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Will Team Alpha achieve at least 100% of its quarterly quota?" />
            <Label>Plain-language description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            <Label>Objective resolution statement</Label>
            <Textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder='Resolve “Yes” if the CRM reports that Team Alpha achieved at least 100% of its approved Q3 quota by 11:59 p.m. ET on September 30. Otherwise, resolve “No.”'
            />
            <Label>Authoritative data source</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} />
            {type !== "binary" ? (
              <>
                <Label>Outcomes (one per line)</Label>
                <Textarea value={choices} onChange={(e) => setChoices(e.target.value)} />
              </>
            ) : (
              <>
                <Label>Starting Yes probability ({prob}%)</Label>
                <Input type="range" min={10} max={90} value={prob} onChange={(e) => setProb(Number(e.target.value))} />
              </>
            )}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="grid gap-3">
            <Label>Scope</Label>
            <select className="h-11 rounded-md border border-input bg-card px-3" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="organization">Organization</option>
              <option value="team">Team</option>
              <option value="individual">Individual (restricted)</option>
            </select>
            <Label>Team</Label>
            <select className="h-11 rounded-md border border-input bg-card px-3" value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value || null)}>
              <option value="">None</option>
              {lookups?.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Label>KPI</Label>
            <select className="h-11 rounded-md border border-input bg-card px-3" value={kpiId ?? ""} onChange={(e) => setKpiId(e.target.value || null)}>
              <option value="">None</option>
              {lookups?.kpis.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <Label>Period</Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
            <Label>Privacy</Label>
            <select className="h-11 rounded-md border border-input bg-card px-3" value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
              <option value="public_org">Organization</option>
              <option value="team_only">Team only</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="grid gap-3">
            <Label>Opens</Label>
            <Input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            <Label>Closes</Label>
            <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </div>
        ) : null}
        {step === 4 ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-2xl">{title || "Untitled"}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
            <p className="text-sm">{resolution}</p>
            <p className="text-xs text-muted-foreground">
              {type} · {scope} · {period} · {outcomes.length} outcomes
            </p>
          </div>
        ) : null}
        <div className="flex gap-3">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : null}
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Continue</Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => void publish(true)}>
                Save draft
              </Button>
              <Button disabled={busy} onClick={() => void publish(false)}>
                Publish
              </Button>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
