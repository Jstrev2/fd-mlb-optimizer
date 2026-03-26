import { NextResponse } from "next/server";
import { parseGames, deriveSlates } from "@/lib/slates";

const FD_API = "https://sbapi.il.sportsbook.fanduel.com/api";
const API_KEY = "FhMFpcPWXMeyZxOx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export async function GET() {
  try {
    const res = await fetch(
      `${FD_API}/content-managed-page?page=SPORT&eventTypeId=7511&_ak=${API_KEY}&timezone=America/New_York`,
      { headers: { "User-Agent": UA }, next: { revalidate: 300 } }
    );
    const data = await res.json();
    const events = data?.attachments?.events || {};

    // Filter to MLB games only (exclude college, futures, etc.)
    const mlbEvents: Record<string, { name: string; openDate: string }> = {};
    for (const [id, ev] of Object.entries(events)) {
      const e = ev as Record<string, string>;
      // MLB games have "Team (Pitcher) @ Team (Pitcher)" format
      if (e.name && e.name.includes("@") && e.name.includes("(") && !e.name.includes("NCAA") && !e.name.includes("Futures")) {
        // Skip non-MLB (Japanese baseball, college)
        const isMLB = Object.keys(TEAM_CHECK).some(t => e.name.includes(t));
        if (isMLB) mlbEvents[id] = { name: e.name, openDate: e.openDate || "" };
      }
    }

    const games = parseGames(mlbEvents);
    const slates = deriveSlates(games);

    return NextResponse.json({ slates, games: games.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

const TEAM_CHECK: Record<string, boolean> = {
  "Pirates": true, "Mets": true, "White Sox": true, "Brewers": true,
  "Nationals": true, "Cubs": true, "Twins": true, "Orioles": true,
  "Red Sox": true, "Reds": true, "Angels": true, "Astros": true,
  "Rays": true, "Cardinals": true, "Rangers": true, "Phillies": true,
  "Tigers": true, "Padres": true, "Dodgers": true, "Diamondbacks": true,
  "Mariners": true, "Guardians": true, "Yankees": true, "Blue Jays": true,
  "Braves": true, "Rockies": true, "Giants": true, "Royals": true,
  "Athletics": true, "Marlins": true,
};
