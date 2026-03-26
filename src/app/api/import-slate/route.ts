import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FD_API = "https://sbapi.il.sportsbook.fanduel.com/api";
const API_KEY = "FhMFpcPWXMeyZxOx";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

// Step 1: Get today's MLB events from FanDuel
async function getTodayEvents(): Promise<{ id: string; name: string; date: string }[]> {
  const res = await fetch(
    `${FD_API}/content-managed-page?page=SPORT&eventTypeId=7511&_ak=${API_KEY}&timezone=America/Chicago`,
    { headers: HEADERS }
  );
  const data = await res.json();
  const events = data?.attachments?.events || {};
  const today = new Date().toISOString().split("T")[0]; // UTC date

  return Object.entries(events)
    .filter(([, ev]: [string, unknown]) => {
      const e = ev as { openDate?: string; name?: string };
      return e.openDate?.startsWith(today);
    })
    .map(([id, ev]: [string, unknown]) => {
      const e = ev as { openDate?: string; name?: string };
      return { id, name: e.name || "", date: e.openDate || "" };
    });
}

// Step 2: Get player props for a single event
interface PropData {
  name: string;
  team: string;
  // Batter
  tb_2plus: number | null;
  tb_3plus: number | null;
  tb_4plus: number | null;
  tb_5plus: number | null;
  hr_odds: number | null;
  hit_odds: number | null;
  rbi_odds: number | null;
  run_odds: number | null;
  sb_odds: number | null;
  hits_2plus: number | null;
  rbis_2plus: number | null;
  runs_2plus: number | null;
  // Pitcher
  ks_line: number | null;
  ks_over_odds: number | null;
  outs_line: number | null;
  outs_over_odds: number | null;
}

function getOdds(runner: Record<string, unknown>): number {
  const odds = runner?.winRunnerOdds as Record<string, unknown> | undefined;
  const display = odds?.americanDisplayOdds as Record<string, unknown> | undefined;
  return Number(display?.americanOdds) || 0;
}

async function getEventProps(eventId: string, eventName: string): Promise<Map<string, PropData>> {
  const playerMap = new Map<string, PropData>();
  
  // Parse teams from event name: "Away Team (Pitcher) @ Home Team (Pitcher)"
  const teamMatch = eventName.match(/^(.+?)\s*\(.+?\)\s*@\s*(.+?)\s*\(.+?\)$/);
  const awayTeam = teamMatch?.[1]?.trim() || "";
  const homeTeam = teamMatch?.[2]?.trim() || "";

  // Fetch batter props
  try {
    const bRes = await fetch(
      `${FD_API}/event-page?eventId=${eventId}&tab=batter-props&_ak=${API_KEY}`,
      { headers: HEADERS }
    );
    const bData = await bRes.json();
    const markets = bData?.attachments?.markets || {};

    for (const [, market] of Object.entries(markets)) {
      const m = market as Record<string, unknown>;
      const mt = (m.marketType as string) || "";
      const runners = (m.runners as Record<string, unknown>[]) || [];

      for (const runner of runners) {
        const name = (runner.runnerName as string) || "";
        if (!name || name === "Over" || name === "Under") continue;

        // Clean name (remove "Over"/"Under" suffix for O/U markets)
        const cleanName = name.replace(/ (Over|Under)$/, "").trim();
        if (!cleanName) continue;

        if (!playerMap.has(cleanName)) {
          // Try to figure out team - this is approximate
          playerMap.set(cleanName, {
            name: cleanName, team: "",
            tb_2plus: null, tb_3plus: null, tb_4plus: null, tb_5plus: null,
            hr_odds: null, hit_odds: null, rbi_odds: null, run_odds: null,
            sb_odds: null, hits_2plus: null, rbis_2plus: null, runs_2plus: null,
            ks_line: null, ks_over_odds: null, outs_line: null, outs_over_odds: null,
          });
        }
        const p = playerMap.get(cleanName)!;
        const odds = getOdds(runner);

        if (mt === "TO_RECORD_2+_TOTAL_BASES") p.tb_2plus = odds;
        else if (mt === "TO_RECORD_3+_TOTAL_BASES") p.tb_3plus = odds;
        else if (mt === "TO_RECORD_4+_TOTAL_BASES") p.tb_4plus = odds;
        else if (mt === "TO_RECORD_5+_TOTAL_BASES") p.tb_5plus = odds;
        else if (mt === "TO_HIT_A_HOME_RUN") p.hr_odds = odds;
        else if (mt === "PLAYER_TO_RECORD_A_HIT") p.hit_odds = odds;
        else if (mt === "TO_RECORD_AN_RBI") p.rbi_odds = odds;
        else if (mt === "TO_RECORD_A_RUN") p.run_odds = odds;
        else if (mt === "TO_RECORD_A_STOLEN_BASE") p.sb_odds = odds;
        else if (mt === "PLAYER_TO_RECORD_2+_HITS") p.hits_2plus = odds;
        else if (mt === "TO_RECORD_2+_RBIS") p.rbis_2plus = odds;
        else if (mt === "TO_RECORD_2+_RUNS") p.runs_2plus = odds;
      }
    }
  } catch (e) { console.error("Batter props error:", e); }

  // Fetch pitcher props
  try {
    const pRes = await fetch(
      `${FD_API}/event-page?eventId=${eventId}&tab=pitcher-props&_ak=${API_KEY}`,
      { headers: HEADERS }
    );
    const pData = await pRes.json();
    const markets = pData?.attachments?.markets || {};

    for (const [, market] of Object.entries(markets)) {
      const m = market as Record<string, unknown>;
      const mt = (m.marketType as string) || "";
      const mn = (m.marketName as string) || "";
      const runners = (m.runners as Record<string, unknown>[]) || [];

      // Pitcher strikeouts O/U
      if (mt === "PITCHER_A_TOTAL_STRIKEOUTS" || mt === "PITCHER_B_TOTAL_STRIKEOUTS") {
        // Extract pitcher name from market name: "Paul Skenes - Strikeouts"
        const pitcherName = mn.replace(/ - Strikeouts$/, "").trim();
        if (!playerMap.has(pitcherName)) {
          playerMap.set(pitcherName, {
            name: pitcherName, team: "",
            tb_2plus: null, tb_3plus: null, tb_4plus: null, tb_5plus: null,
            hr_odds: null, hit_odds: null, rbi_odds: null, run_odds: null,
            sb_odds: null, hits_2plus: null, rbis_2plus: null, runs_2plus: null,
            ks_line: null, ks_over_odds: null, outs_line: null, outs_over_odds: null,
          });
        }
        const p = playerMap.get(pitcherName)!;
        for (const runner of runners) {
          const rName = (runner.runnerName as string) || "";
          const hc = Number(runner.handicap) || 0;
          if (rName.includes("Over")) {
            p.ks_line = hc;
            p.ks_over_odds = getOdds(runner);
          }
        }
      }

      // Pitcher outs recorded O/U
      if (mt === "PITCHER_A_OUTS_RECORDED" || mt === "PITCHER_B_OUTS_RECORDED") {
        const pitcherName = mn.replace(/ Outs Recorded$/, "").trim();
        if (!playerMap.has(pitcherName)) {
          playerMap.set(pitcherName, {
            name: pitcherName, team: "",
            tb_2plus: null, tb_3plus: null, tb_4plus: null, tb_5plus: null,
            hr_odds: null, hit_odds: null, rbi_odds: null, run_odds: null,
            sb_odds: null, hits_2plus: null, rbis_2plus: null, runs_2plus: null,
            ks_line: null, ks_over_odds: null, outs_line: null, outs_over_odds: null,
          });
        }
        const p = playerMap.get(pitcherName)!;
        for (const runner of runners) {
          const rName = (runner.runnerName as string) || "";
          const hc = Number(runner.handicap) || 0;
          if (rName === "Over") {
            p.outs_line = hc;
            p.outs_over_odds = getOdds(runner);
          }
        }
      }
    }
  } catch (e) { console.error("Pitcher props error:", e); }

  return playerMap;
}

// Convert American odds to implied probability
function oddsToProb(odds: number): number {
  if (odds === 0) return 0;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

// Calculate points from props
function calcPoints(p: PropData, isPitcher: boolean): { projected: number; upside: number } {
  if (isPitcher) {
    const ksProb = p.ks_over_odds ? oddsToProb(p.ks_over_odds) : 0.5;
    const expectedKs = (p.ks_line || 5) * (0.5 + ksProb * 0.3);
    const outsProb = p.outs_over_odds ? oddsToProb(p.outs_over_odds) : 0.5;
    const expectedOuts = (p.outs_line || 16) * (0.5 + outsProb * 0.3);

    const projected = expectedKs * 3 + expectedOuts * 1 - 2.5 * 3 + 0.45 * 6 + 0.35 * 4;
    const upside = ((p.ks_line || 5) + 2) * 3 + ((p.outs_line || 16) + 3) * 1 - 1.5 * 3 + 0.6 * 6 + 0.5 * 4;

    return { projected: Math.round(projected * 10) / 10, upside: Math.round(upside * 10) / 10 };
  }

  // Batter: use total bases props as primary driver
  const tb2Prob = p.tb_2plus ? oddsToProb(p.tb_2plus) : 0.35;
  const tb3Prob = p.tb_3plus ? oddsToProb(p.tb_3plus) : 0.15;
  const tb4Prob = p.tb_4plus ? oddsToProb(p.tb_4plus) : 0.08;
  const tb5Prob = p.tb_5plus ? oddsToProb(p.tb_5plus) : 0.04;
  const hrProb = p.hr_odds ? oddsToProb(p.hr_odds) : 0.05;
  const hitProb = p.hit_odds ? oddsToProb(p.hit_odds) : 0.55;
  const rbiProb = p.rbi_odds ? oddsToProb(p.rbi_odds) : 0.3;
  const runProb = p.run_odds ? oddsToProb(p.run_odds) : 0.3;
  const sbProb = p.sb_odds ? oddsToProb(p.sb_odds) : 0.05;

  // Expected total bases from tiered probabilities
  const expectedTB = 1 * (hitProb - tb2Prob) + 2 * (tb2Prob - tb3Prob) + 3 * (tb3Prob - tb4Prob) + 4 * (tb4Prob - tb5Prob) + 5 * tb5Prob;

  // Convert TB to FD points (weighted: singles=3, doubles=6, triples=9, HR=12)
  // At 1 TB it's a single (3pts), at 2 TB avg ~5pts, at 3 TB avg ~8pts, at 4+ HR likely (12pts)
  const tbPoints = expectedTB <= 0 ? 0 :
    expectedTB <= 1 ? expectedTB * 3 :
    expectedTB <= 2 ? 3 + (expectedTB - 1) * 4.5 :
    expectedTB <= 3 ? 7.5 + (expectedTB - 2) * 5 :
    12.5 + (expectedTB - 3) * 3;

  const projected = tbPoints + rbiProb * 1.2 * 3.5 + runProb * 1.2 * 3.2 + (hitProb * 0.15) * 3 + sbProb * 0.8 * 6;

  // Upside: what if they hit TB 4+?
  const upsideTB = p.tb_4plus ? 4 : p.tb_3plus ? 3.5 : 2.5;
  const upsideTBPts = upsideTB >= 4 ? 12 : upsideTB >= 3 ? 9 : 6;
  const upside = upsideTBPts + 1.5 * 3.5 + 1.2 * 3.2 + 0.5 * 3 + sbProb * 1.5 * 6 + hrProb * 12;

  return { projected: Math.round(projected * 10) / 10, upside: Math.round(upside * 10) / 10 };
}

// Step 3: Get DFF salaries + positions
interface DFFPlayer {
  name: string;
  position: string;
  salary: number;
  team: string;
  dff_projected: number;
}

async function getDFFPlayers(): Promise<DFFPlayer[]> {
  const res = await fetch("https://www.dailyfantasyfuel.com/mlb/projections/fanduel", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const html = await res.text();
  // Strip HTML tags, decode entities, normalize to clean lines
  const rawText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const textLines = rawText.split("\n").map((l: string) => l.trim()).filter((l: string) => l);
  const text = textLines.join("\n");

  const players: DFFPlayer[] = [];

  // Pitcher regex - $ may be separate line from amount
  const pitcherRegex = /(?:^|\n)P\n([\w][\w\s.'-]+?)\s*(?:DTD\s*)?\n\u2022\s*\([LRS]\)\n\$\n?([\d.]+)k\n(?:YES|EXP\.)\n(\w{2,3})\n(\w{2,3})\n([\d.]+)/gm;
  let match;
  while ((match = pitcherRegex.exec(text)) !== null) {
    players.push({
      name: match[1].trim(), position: "P",
      salary: Math.round(parseFloat(match[2]) * 1000),
      team: match[3], dff_projected: parseFloat(match[5]) || 0,
    });
  }

  // Batter regex - handles multi-position and $ on separate line
  const batterRegex = /(?:^|\n)(C(?:\/OF)?|1B(?:\/1B)?|2B(?:\/(?:SS|OF|2B))?|3B(?:\/(?:2B|3B))?|SS(?:\/SS)?|OF(?:\/OF)?)\n([\w][\w\s.'-]+?)\s*(?:DTD\s*)?\n\u2022\s*\([LRS]\)\n\$\n?([\d.]+)k\n(?:YES|EXP\.)\n(\w{2,3})\n(\w{2,3})\n(\d+)\s*(?:\u2713)?\n([\d.]+)/gm;
  while ((match = batterRegex.exec(text)) !== null) {
    players.push({
      name: match[2].trim(), position: match[1].split("/")[0],
      salary: Math.round(parseFloat(match[3]) * 1000),
      team: match[4], dff_projected: parseFloat(match[7]) || 0,
    });
  }  return players;
}

// Name matching helper - normalize names for fuzzy matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/jr\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findPropMatch(dffName: string, propMap: Map<string, PropData>): PropData | null {
  // Exact match first
  if (propMap.has(dffName)) return propMap.get(dffName)!;

  const norm = normalizeName(dffName);

  // Try normalized match
  for (const [propName, data] of propMap.entries()) {
    if (normalizeName(propName) === norm) return data;
  }

  // Last name match
  const dffLast = norm.split(" ").pop() || "";
  for (const [propName, data] of propMap.entries()) {
    const propLast = normalizeName(propName).split(" ").pop() || "";
    if (dffLast === propLast && dffLast.length > 3) return data;
  }

  return null;
}

export async function POST() {
  try {
    // Step 1: Get DFF players (salaries + positions)
    const [dffPlayers, todayEvents] = await Promise.all([
      getDFFPlayers(),
      getTodayEvents(),
    ]);

    if (dffPlayers.length === 0) {
      return NextResponse.json({ error: "Could not parse DFF player data" }, { status: 400 });
    }

    // Step 2: Get FanDuel props for all games
    const allProps = new Map<string, PropData>();
    const propFetches = todayEvents.map(async (ev) => {
      const props = await getEventProps(ev.id, ev.name);
      for (const [name, data] of props) {
        allProps.set(name, data);
      }
    });
    await Promise.all(propFetches);

    // Step 3: Merge DFF + FD props
    const inserts = dffPlayers.map((dff) => {
      const props = findPropMatch(dff.name, allProps);
      const isPitcher = dff.position === "P";
      const pts = props
        ? calcPoints(props, isPitcher)
        : { projected: dff.dff_projected, upside: Math.round(dff.dff_projected * 1.3 * 10) / 10 };

      return {
        name: dff.name,
        team: dff.team,
        position: dff.position,
        salary: dff.salary,
        // Store the raw prop odds for reference
        total_bases_over_odds: props?.tb_2plus || null,
        total_bases_upside: props?.tb_4plus ? 4 : props?.tb_3plus ? 3 : null,
        total_bases_upside_odds: props?.tb_4plus || props?.tb_3plus || null,
        hrs_over_odds: props?.hr_odds || null,
        hits_over_odds: props?.hit_odds || null,
        rbis_over_odds: props?.rbi_odds || null,
        runs_over_odds: props?.run_odds || null,
        sbs_over_odds: props?.sb_odds || null,
        ks_line: props?.ks_line || null,
        ks_over_odds: props?.ks_over_odds || null,
        outs_line: props?.outs_line || null,
        outs_over_odds: props?.outs_over_odds || null,
        projected_pts: pts.projected,
        upside_pts: pts.upside,
        pts_per_k: dff.salary > 0 ? Math.round((pts.upside / (dff.salary / 1000)) * 10) / 10 : 0,
        slate_id: "main",
      };
    });

    // Clear and insert
    await supabase.from("players").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { data, error } = await supabase.from("players").insert(inserts).select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const withProps = inserts.filter((p) => p.total_bases_over_odds || p.ks_line);

    return NextResponse.json({
      imported: data?.length || 0,
      pitchers: inserts.filter((p) => p.position === "P").length,
      batters: inserts.filter((p) => p.position !== "P").length,
      withProps: withProps.length,
      totalProps: allProps.size,
      games: todayEvents.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
