import { NextResponse } from "next/server";

const FD_API = "https://sbapi.il.sportsbook.fanduel.com/api";
const API_KEY = "FhMFpcPWXMeyZxOx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const DFF_URL = "https://www.dailyfantasyfuel.com/mlb/projections/fanduel";

const TEAM_ABBR: Record<string, string> = {
  "Pittsburgh Pirates": "PIT", "New York Mets": "NYM", "Chicago White Sox": "CWS",
  "Milwaukee Brewers": "MIL", "Washington Nationals": "WAS", "Chicago Cubs": "CHC",
  "Minnesota Twins": "MIN", "Baltimore Orioles": "BAL", "Boston Red Sox": "BOS",
  "Cincinnati Reds": "CIN", "Los Angeles Angels": "LAA", "Houston Astros": "HOU",
  "Tampa Bay Rays": "TB", "St. Louis Cardinals": "STL", "Texas Rangers": "TEX",
  "Philadelphia Phillies": "PHI", "Detroit Tigers": "DET", "San Diego Padres": "SD",
  "Los Angeles Dodgers": "LAD", "Arizona Diamondbacks": "ARI", "Seattle Mariners": "SEA",
  "Cleveland Guardians": "CLE", "New York Yankees": "NYY", "Toronto Blue Jays": "TOR",
  "Atlanta Braves": "ATL", "Colorado Rockies": "COL", "San Francisco Giants": "SF",
  "Kansas City Royals": "KC", "Oakland Athletics": "OAK", "Miami Marlins": "MIA",
};

interface GameEvent {
  id: string;
  name: string;
  openDate: string;
  away: string;
  home: string;
}

export interface SlateInfo {
  id: string;
  label: string;
  lockTime: string;
  games: number;
  teams: string[];
  type: "classic" | "showdown";
}

/**
 * Parse DFF slate HTML to extract FanDuel DFS slates.
 * DFF's slate dropdown contains the actual FD slate structure.
 */
async function scrapeDFFSlates(): Promise<{ classic: { label: string; time: string; games: number }[]; showdown: { label: string; time: string }[] }> {
  try {
    const res = await fetch(DFF_URL, { headers: { "User-Agent": UA } });
    const html = await res.text();

    // Extract slate data from the projections-slates section
    // Classic slates: "X Games · Type\nDAY TIME ET"
    // Showdown slates: "TEAM @ TEAM\nDAY TIME ET"
    const classic: { label: string; time: string; games: number }[] = [];
    const showdown: { label: string; time: string }[] = [];

    // Find the "Classic" section
    const classicMatches = html.matchAll(/(\d+)\s*Games?\s*[·•]\s*([\w\s]+?)\s*<[^>]*>\s*(?:<[^>]*>)*\s*(\w{3}\s+\d{1,2}:\d{2}(?:AM|PM)\s*ET)/gi);
    for (const m of classicMatches) {
      classic.push({
        label: `${m[1]} Games · ${m[2].trim()}`,
        time: m[3].trim(),
        games: parseInt(m[1]),
      });
    }

    // Showdown: "TEX @ PHI" pattern
    const showdownMatches = html.matchAll(/([A-Z]{2,3})\s*@\s*([A-Z]{2,3})\s*<[^>]*>\s*(?:<[^>]*>)*\s*(\w{3}\s+\d{1,2}:\d{2}(?:AM|PM)\s*ET)/gi);
    for (const m of showdownMatches) {
      showdown.push({
        label: `${m[1]} @ ${m[2]}`,
        time: m[3].trim(),
      });
    }

    return { classic, showdown };
  } catch {
    return { classic: [], showdown: [] };
  }
}

/**
 * Get today's MLB events from FD sportsbook for team resolution.
 */
async function getFDEvents(): Promise<GameEvent[]> {
  try {
    const res = await fetch(
      `${FD_API}/content-managed-page?page=SPORT&eventTypeId=7511&_ak=${API_KEY}&timezone=America/New_York`,
      { headers: { "User-Agent": UA } }
    );
    const data = await res.json();
    const events = data?.attachments?.events || {};
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const games: GameEvent[] = [];
    for (const [id, ev] of Object.entries(events)) {
      const e = ev as Record<string, string>;
      if (!e.openDate || !e.name?.includes("@") || !e.name?.includes("(")) continue;
      // Only today/tomorrow MLB games
      const dateStr = e.openDate.split("T")[0];
      if (dateStr < todayStr) continue;

      const match = e.name.match(/^(.+?)\s*\(.+?\)\s*@\s*(.+?)\s*\(.+?\)$/);
      if (!match) continue;
      const away = TEAM_ABBR[match[1].trim()];
      const home = TEAM_ABBR[match[2].trim()];
      if (!away || !home) continue;

      games.push({ id, name: e.name, openDate: e.openDate, away, home });
    }

    return games.sort((a, b) => a.openDate.localeCompare(b.openDate));
  } catch {
    return [];
  }
}

/**
 * Match DFF slate game count to FD events to determine which teams are in each slate.
 * Classic slates are ordered by start time, so "X Games · Main" = the X games starting earliest
 * after any "Early" games, etc.
 */
function resolveSlateTeams(
  dffSlates: { label: string; time: string; games: number }[],
  fdGames: GameEvent[]
): SlateInfo[] {
  const slates: SlateInfo[] = [];

  // Sort FD games by start time
  const sorted = [...fdGames].sort((a, b) => a.openDate.localeCompare(b.openDate));

  for (const dff of dffSlates) {
    // "All Day" = all games
    // "Main" = largest chunk excluding early/late fringes
    // "Early" = first N games
    // "Late" = last N games before after-hours
    // "After Hours" = very late games (West Coast)

    let slateGames: GameEvent[] = [];
    const type = dff.label.toLowerCase();

    if (type.includes("all day")) {
      slateGames = sorted;
    } else if (type.includes("after hours")) {
      // Last N games
      slateGames = sorted.slice(-dff.games);
    } else if (type.includes("early")) {
      // First N games
      slateGames = sorted.slice(0, dff.games);
    } else if (type.includes("late")) {
      // Take from the end but before "after hours" games
      // Estimate: skip early games, take next chunk
      const afterHoursCount = dffSlates.find(s => s.label.toLowerCase().includes("after hours"))?.games || 0;
      const endIdx = sorted.length - afterHoursCount;
      slateGames = sorted.slice(endIdx - dff.games, endIdx);
    } else if (type.includes("main")) {
      // Main = the biggest slate, typically all except extreme early/late
      // Start from earliest eligible game, take N
      slateGames = sorted.slice(0, dff.games);
    } else {
      // Fallback: first N games
      slateGames = sorted.slice(0, dff.games);
    }

    const teams = slateGames.flatMap(g => [g.away, g.home]);

    slates.push({
      id: dff.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: dff.label,
      lockTime: dff.time,
      games: dff.games,
      teams: [...new Set(teams)],
      type: "classic",
    });
  }

  return slates;
}

export async function GET() {
  try {
    const [dffData, fdGames] = await Promise.all([scrapeDFFSlates(), getFDEvents()]);

    let slates: SlateInfo[] = [];

    if (dffData.classic.length > 0 && fdGames.length > 0) {
      // Best case: DFF slate data + FD game data for team resolution
      slates = resolveSlateTeams(dffData.classic, fdGames);

      // Add showdown slates
      for (const sd of dffData.showdown) {
        const parts = sd.label.split("@").map(s => s.trim());
        slates.push({
          id: `sd-${sd.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          label: sd.label,
          lockTime: sd.time,
          games: 1,
          teams: parts,
          type: "showdown",
        });
      }
    } else {
      // Fallback: derive from FD game times
      const fmt = (d: string) => {
        const dt = new Date(d);
        return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
      };

      if (fdGames.length > 0) {
        const allTeams = fdGames.flatMap(g => [g.away, g.home]);
        slates.push({
          id: "all-day",
          label: `${fdGames.length} Games · All Day`,
          lockTime: fmt(fdGames[0].openDate),
          games: fdGames.length,
          teams: [...new Set(allTeams)],
          type: "classic",
        });
      }
    }

    return NextResponse.json({
      slates,
      source: dffData.classic.length > 0 ? "dff" : "derived",
      games: fdGames.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
