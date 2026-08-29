export const ROLES = [
  "platform_admin",
  "market_admin",
  "sales_manager",
  "participant",
  "observer",
] as const;

export type Role = (typeof ROLES)[number];

export type MarketPrivacy = "public_org" | "team_only" | "restricted";
export type MarketStatus =
  | "draft"
  | "upcoming"
  | "open"
  | "paused"
  | "closed"
  | "resolved"
  | "cancelled"
  | "disputed";

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function canTrade(role: Role): boolean {
  return role !== "observer";
}

export function canManageMarkets(role: Role): boolean {
  return role === "market_admin" || role === "platform_admin";
}

export function canAdminOrg(role: Role): boolean {
  return role === "platform_admin";
}

export function canViewAdmin(role: Role): boolean {
  return role === "platform_admin" || role === "market_admin";
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "platform_admin":
      return "Platform admin";
    case "market_admin":
      return "Market admin";
    case "sales_manager":
      return "Sales manager";
    case "participant":
      return "Participant";
    case "observer":
      return "Observer";
  }
}

export type MarketAccess = {
  role: Role;
  userId: string;
  teamId: string | null;
};

export function canViewMarket(
  actor: MarketAccess,
  market: {
    privacy: MarketPrivacy;
    teamId: string | null;
    subjectUserId: string | null;
    ownerUserId: string;
    status: string;
  },
): boolean {
  if (market.status === "draft" && !canManageMarkets(actor.role) && actor.userId !== market.ownerUserId) {
    return false;
  }
  if (canManageMarkets(actor.role)) return true;
  if (market.privacy === "public_org") return true;
  if (market.privacy === "team_only") {
    return Boolean(market.teamId && actor.teamId === market.teamId);
  }
  return (
    actor.userId === market.subjectUserId ||
    actor.userId === market.ownerUserId ||
    (actor.role === "sales_manager" && Boolean(market.teamId && actor.teamId === market.teamId))
  );
}

const BANNED =
  /\b(fir(e|ed|ing)|terminat|layoff|redundan|salary|compensat|bonus|harass|misconduct|discriminat|disabilit|pregnant|leave of absence|medical condition|mental health|race|ethnicity|religion|sexual orientation|gender identity|whistleblow)\b/i;

export function forbiddenTopicReason(text: string): string | null {
  if (BANNED.test(text)) {
    return "This question touches a sensitive personal or employment topic. Helix only hosts team and aggregate operating forecasts.";
  }
  return null;
}
