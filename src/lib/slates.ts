/**
 * FanDuel DFS Slate Detection
 * Derives slates from game start times (ET).
 * FD typical slate windows:
 * - Main/All Day: all games
 * - Early: games before ~4:30 PM ET
 * - Late/Night: games starting ~7 PM ET+
 * - After Hours: games starting ~10 PM ET+
 */

export interface Slate {
  id: string;
  label: string;
  games: number;
  lockTime: string; // earliest game time formatted
  teams: string[];  // teams in this slate
}

export interface GameInfo {
  id: string;
  name: string;
  startTime: Date;
  away: string;
  home: string;
}

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
  "Athletics": "OAK",
};

export function parseGames(events: Record<string, { name: string; openDate: string }>): GameInfo[] {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  // Also include games that start after 10pm yesterday (they show as "today's" slate)
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return Object.entries(events)
    .filter(([, ev]) => {
      const d = ev.openDate || "";
      return d.startsWith(todayStr) || (d > todayStr); // today and tomorrow
    })
    .map(([id, ev]) => {
      const match = ev.name.match(/^(.+?)\s*\(.+?\)\s*@\s*(.+?)\s*\(.+?\)$/);
      if (!match) return null;
      return {
        id,
        name: ev.name,
        startTime: new Date(ev.openDate),
        away: TEAM_ABBR[match[1].trim()] || match[1].trim(),
        home: TEAM_ABBR[match[2].trim()] || match[2].trim(),
      };
    })
    .filter((g): g is GameInfo => g !== null)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

export function deriveSlates(games: GameInfo[]): Slate[] {
  if (games.length === 0) return [];

  const slates: Slate[] = [];
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

  // Group games by date
  const byDate = new Map<string, GameInfo[]>();
  for (const g of games) {
    // Use ET date for grouping
    const etDate = new Date(g.startTime.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const key = `${etDate.getFullYear()}-${String(etDate.getMonth() + 1).padStart(2, "0")}-${String(etDate.getDate()).padStart(2, "0")}`;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(g);
  }

  for (const [date, dayGames] of byDate) {
    const teamsFor = (gs: GameInfo[]) => gs.flatMap(g => [g.away, g.home]);

    // ALL GAMES slate
    if (dayGames.length >= 1) {
      slates.push({
        id: `${date}-all`,
        label: `${dayGames.length} Games · All Day`,
        games: dayGames.length,
        lockTime: fmt(dayGames[0].startTime),
        teams: teamsFor(dayGames),
      });
    }

    // Split by time windows (ET hours)
    const getETHour = (d: Date) => {
      const etStr = d.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
      return parseInt(etStr);
    };

    const early = dayGames.filter(g => getETHour(g.startTime) < 16); // before 4 PM ET
    const late = dayGames.filter(g => { const h = getETHour(g.startTime); return h >= 18 && h < 22; }); // 6-10 PM ET
    const afterHours = dayGames.filter(g => getETHour(g.startTime) >= 22); // 10 PM+ ET

    if (early.length >= 2 && early.length < dayGames.length) {
      slates.push({
        id: `${date}-early`,
        label: `${early.length} Games · Early`,
        games: early.length,
        lockTime: fmt(early[0].startTime),
        teams: teamsFor(early),
      });
    }

    if (late.length >= 2 && late.length < dayGames.length) {
      slates.push({
        id: `${date}-late`,
        label: `${late.length} Games · Late`,
        games: late.length,
        lockTime: fmt(late[0].startTime),
        teams: teamsFor(late),
      });
    }

    if (afterHours.length >= 1) {
      slates.push({
        id: `${date}-afterhours`,
        label: `${afterHours.length} Games · After Hours`,
        games: afterHours.length,
        lockTime: fmt(afterHours[0].startTime),
        teams: teamsFor(afterHours),
      });
    }

    // MAIN slate = typically the biggest chunk (exclude very early/very late if there's enough games)
    const main = dayGames.filter(g => { const h = getETHour(g.startTime); return h >= 13 && h < 22; });
    if (main.length >= 4 && main.length < dayGames.length) {
      slates.push({
        id: `${date}-main`,
        label: `${main.length} Games · Main`,
        games: main.length,
        lockTime: fmt(main[0].startTime),
        teams: teamsFor(main),
      });
    }
  }

  return slates;
}
