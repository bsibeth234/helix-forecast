import type { Role } from "./permissions";

export const DEMO_PASSWORD = "Helix-Forecast-2026";
export const ORG_ID = "org_northstar";

export type DemoAccount = {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamId: string | null;
  title: string;
  onboarded: boolean;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: "usr_avery", name: "Avery Chen", email: "avery.chen@northstar.example", role: "platform_admin", teamId: null, title: "VP Operations", onboarded: true },
  { id: "usr_jordan", name: "Jordan Hale", email: "jordan.hale@northstar.example", role: "market_admin", teamId: null, title: "RevOps lead", onboarded: true },
  { id: "usr_sam", name: "Sam Rivera", email: "sam.rivera@northstar.example", role: "sales_manager", teamId: "tm_alpha", title: "Manager, Team Alpha", onboarded: true },
  { id: "usr_riley", name: "Riley Okonkwo", email: "riley.okonkwo@northstar.example", role: "sales_manager", teamId: "tm_bravo", title: "Manager, Team Bravo", onboarded: true },
  { id: "usr_casey", name: "Casey Nguyen", email: "casey.nguyen@northstar.example", role: "sales_manager", teamId: "tm_charlie", title: "Manager, Team Charlie", onboarded: true },
  { id: "usr_morgan", name: "Morgan Patel", email: "morgan.patel@northstar.example", role: "participant", teamId: "tm_alpha", title: "Account executive", onboarded: true },
  { id: "usr_quinn", name: "Quinn Brooks", email: "quinn.brooks@northstar.example", role: "participant", teamId: "tm_alpha", title: "Account executive", onboarded: true },
  { id: "usr_reese", name: "Reese Alvarez", email: "reese.alvarez@northstar.example", role: "participant", teamId: "tm_bravo", title: "Mid-market AE", onboarded: true },
  { id: "usr_taylor", name: "Taylor Kim", email: "taylor.kim@northstar.example", role: "participant", teamId: "tm_bravo", title: "Mid-market AE", onboarded: true },
  { id: "usr_jamie", name: "Jamie Singh", email: "jamie.singh@northstar.example", role: "participant", teamId: "tm_charlie", title: "Commercial AE", onboarded: false },
  { id: "usr_harper", name: "Harper Ellis", email: "harper.ellis@northstar.example", role: "participant", teamId: "tm_charlie", title: "New hire AE", onboarded: true },
  { id: "usr_drew", name: "Drew Fontaine", email: "drew.fontaine@northstar.example", role: "observer", teamId: null, title: "Chief Revenue Officer", onboarded: true },
  { id: "usr_alex", name: "Alex Romero", email: "alex.romero@northstar.example", role: "participant", teamId: "tm_alpha", title: "Enterprise AE", onboarded: true },
];
