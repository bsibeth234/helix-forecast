import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/format";

const variant: Record<string, "default" | "outline" | "yes" | "no" | "muted"> = {
  open: "yes",
  upcoming: "default",
  resolved: "muted",
  closed: "outline",
  paused: "outline",
  cancelled: "no",
  disputed: "no",
  draft: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={variant[status] ?? "outline"}>{statusLabel(status)}</Badge>;
}
