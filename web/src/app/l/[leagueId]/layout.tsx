import { LeagueShell } from "./LeagueShell";

export default function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { leagueId: string };
}) {
  return <LeagueShell lid={params.leagueId}>{children}</LeagueShell>;
}
