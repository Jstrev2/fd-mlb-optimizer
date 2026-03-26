import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FD_API = "https://sbapi.il.sportsbook.fanduel.com/api";
const API_KEY = "FhMFpcPWXMeyZxOx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function getOdds(runner: Record<string, unknown>): number {
  const o = runner?.winRunnerOdds as Record<string, unknown> | undefined;
  const d = o?.americanDisplayOdds as Record<string, unknown> | undefined;
  return Number(d?.americanOdds) || 0;
}

function oddsToProb(odds: number): number {
  if (!odds) return 0;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

// ============ PROP DATA STRUCTURE ============
interface Props {
  // Hits tiered
  hit_odds: number | null;
  hits_2plus: number | null;
  hits_3plus: number | null;
  hits_4plus: number | null;
  // Hit types
  single_odds: number | null;
  double_odds: number | null;
  triple_odds: number | null;
  // HRs
  hr_odds: number | null;
  hr_2plus: number | null;
  // Total bases tiered
  tb_2plus: number | null;
  tb_3plus: number | null;
  tb_4plus: number | null;
  tb_5plus: number | null;
  // RBIs tiered
  rbi_odds: number | null;
  rbis_2plus: number | null;
  rbis_3plus: number | null;
  rbis_4plus: number | null;
  // Runs tiered
  run_odds: number | null;
  runs_2plus: number | null;
  runs_3plus: number | null;
  // SBs
  sb_odds: number | null;
  sbs_2plus: number | null;
  // H+R+RBI combo
  hrr_1plus: number | null;
  hrr_2plus: number | null;
  hrr_3plus: number | null;
  hrr_4plus: number | null;
  // Pitcher
  ks_line: number | null;
  ks_over_odds: number | null;
  ks_alt_3plus: number | null;
  ks_alt_4plus: number | null;
  ks_alt_5plus: number | null;
  ks_alt_6plus: number | null;
  ks_alt_7plus: number | null;
  ks_alt_8plus: number | null;
  ks_alt_9plus: number | null;
  ks_alt_10plus: number | null;
  outs_line: number | null;
  outs_over_odds: number | null;
  win_odds: number | null;
}

function emptyProps(): Props {
  return {
    hit_odds: null, hits_2plus: null, hits_3plus: null, hits_4plus: null,
    single_odds: null, double_odds: null, triple_odds: null,
    hr_odds: null, hr_2plus: null,
    tb_2plus: null, tb_3plus: null, tb_4plus: null, tb_5plus: null,
    rbi_odds: null, rbis_2plus: null, rbis_3plus: null, rbis_4plus: null,
    run_odds: null, runs_2plus: null, runs_3plus: null,
    sb_odds: null, sbs_2plus: null,
    hrr_1plus: null, hrr_2plus: null, hrr_3plus: null, hrr_4plus: null,
    ks_line: null, ks_over_odds: null,
    ks_alt_3plus: null, ks_alt_4plus: null, ks_alt_5plus: null,
    ks_alt_6plus: null, ks_alt_7plus: null, ks_alt_8plus: null,
    ks_alt_9plus: null, ks_alt_10plus: null,
    outs_line: null, outs_over_odds: null, win_odds: null,
  };
}

// ============ MARKET TYPE → PROP FIELD MAPPING ============
const BATTER_MARKET_MAP: Record<string, keyof Props> = {
  "PLAYER_TO_RECORD_A_HIT": "hit_odds",
  "PLAYER_TO_RECORD_2+_HITS": "hits_2plus",
  "PLAYER_TO_RECORD_3+_HITS": "hits_3plus",
  "PLAYER_TO_RECORD_4+_HITS": "hits_4plus",
  "TO_HIT_A_SINGLE": "single_odds",
  "TO_HIT_A_DOUBLE": "double_odds",
  "TO_HIT_A_TRIPLE": "triple_odds",
  "TO_HIT_A_HOME_RUN": "hr_odds",
  "TO_HIT_2+_HOME_RUNS": "hr_2plus",
  "TO_RECORD_2+_TOTAL_BASES": "tb_2plus",
  "TO_RECORD_3+_TOTAL_BASES": "tb_3plus",
  "TO_RECORD_4+_TOTAL_BASES": "tb_4plus",
  "TO_RECORD_5+_TOTAL_BASES": "tb_5plus",
  "TO_RECORD_AN_RBI": "rbi_odds",
  "TO_RECORD_2+_RBIS": "rbis_2plus",
  "TO_RECORD_3+_RBIS": "rbis_3plus",
  "TO_RECORD_4+_RBIS": "rbis_4plus",
  "TO_RECORD_A_RUN": "run_odds",
  "TO_RECORD_2+_RUNS": "runs_2plus",
  "TO_RECORD_3+_RUNS": "runs_3plus",
  "TO_RECORD_A_STOLEN_BASE": "sb_odds",
  "TO_RECORD_2+_STOLEN_BASES": "sbs_2plus",
  "PLAYER_TO_RECORD_1+_HITS+RUNS+RBIS": "hrr_1plus",
  "PLAYER_TO_RECORD_2+_HITS+RUNS+RBIS": "hrr_2plus",
  "PLAYER_TO_RECORD_3+_HITS+RUNS+RBIS": "hrr_3plus",
  "PLAYER_TO_RECORD_4+_HITS+RUNS+RBIS": "hrr_4plus",
};

// ============ FETCH FD EVENTS ============
async function getTodayEvents() {
  const res = await fetch(
    `${FD_API}/content-managed-page?page=SPORT&eventTypeId=7511&_ak=${API_KEY}&timezone=America/Chicago`,
    { headers: { "User-Agent": UA } }
  );
  const data = await res.json();
  const events = data?.attachments?.events || {};
  const today = new Date().toISOString().split("T")[0];
  return Object.entries(events)
    .filter(([, ev]: [string, unknown]) => ((ev as Record<string, string>).openDate || "").startsWith(today))
    .map(([id, ev]: [string, unknown]) => {
      const e = ev as Record<string, string>;
      return { id, name: e.name || "" };
    });
}

// ============ FETCH ALL PROPS FOR ONE EVENT ============
async function getEventProps(eventId: string): Promise<Map<string, Props>> {
  const playerMap = new Map<string, Props>();

  const getOrCreate = (name: string): Props => {
    const clean = name.replace(/ (Over|Under)$/, "").trim();
    if (!clean) return emptyProps();
    if (!playerMap.has(clean)) playerMap.set(clean, emptyProps());
    return playerMap.get(clean)!;
  };

  // --- BATTER PROPS ---
  try {
    const res = await fetch(`${FD_API}/event-page?eventId=${eventId}&tab=batter-props&_ak=${API_KEY}`, { headers: { "User-Agent": UA } });
    const data = await res.json();
    const markets = data?.attachments?.markets || {};

    for (const [, market] of Object.entries(markets)) {
      const m = market as Record<string, unknown>;
      const mt = (m.marketType as string) || "";
      const runners = (m.runners as Record<string, unknown>[]) || [];
      const field = BATTER_MARKET_MAP[mt];
      if (!field) continue;

      for (const runner of runners) {
        const name = (runner.runnerName as string) || "";
        if (!name || name === "Over" || name === "Under") continue;
        const p = getOrCreate(name);
        (p as unknown as Record<string, number | null>)[field] = getOdds(runner);
      }
    }
  } catch { /* skip */ }

  // --- PITCHER PROPS ---
  try {
    const res = await fetch(`${FD_API}/event-page?eventId=${eventId}&tab=pitcher-props&_ak=${API_KEY}`, { headers: { "User-Agent": UA } });
    const data = await res.json();
    const markets = data?.attachments?.markets || {};

    for (const [, market] of Object.entries(markets)) {
      const m = market as Record<string, unknown>;
      const mt = (m.marketType as string) || "";
      const mn = (m.marketName as string) || "";
      const runners = (m.runners as Record<string, unknown>[]) || [];

      // Strikeouts O/U
      if (/^PITCHER_[A-Z]_TOTAL_STRIKEOUTS$/.test(mt)) {
        const pitcherName = mn.replace(/ - Strikeouts$/, "").trim();
        const p = getOrCreate(pitcherName);
        for (const r of runners) {
          const rn = (r.runnerName as string) || "";
          if (rn.includes("Over")) {
            p.ks_line = Number(r.handicap) || 0;
            p.ks_over_odds = getOdds(r);
          }
        }
      }

      // Alt Strikeouts (tiered)
      if (/^PITCHER_[A-Z]_STRIKEOUTS$/.test(mt)) {
        for (const r of runners) {
          const rn = (r.runnerName as string) || "";
          const match = rn.match(/^(.+?)\s+(\d+)\+\s*Strikeouts$/);
          if (match) {
            const p = getOrCreate(match[1]);
            const tier = parseInt(match[2]);
            const odds = getOdds(r);
            if (tier === 3) p.ks_alt_3plus = odds;
            else if (tier === 4) p.ks_alt_4plus = odds;
            else if (tier === 5) p.ks_alt_5plus = odds;
            else if (tier === 6) p.ks_alt_6plus = odds;
            else if (tier === 7) p.ks_alt_7plus = odds;
            else if (tier === 8) p.ks_alt_8plus = odds;
          }
        }
      }

      // Pitching Specials (high-K tiers: 9+, 10+, 11+, 12+)
      if (/^PITCHING_SPECIALS/.test(mt)) {
        for (const r of runners) {
          const rn = (r.runnerName as string) || "";
          const match = rn.match(/^(.+?)\s+(\d+)\+\s*Strikeouts$/);
          if (match) {
            const p = getOrCreate(match[1]);
            const tier = parseInt(match[2]);
            const odds = getOdds(r);
            if (tier === 9) p.ks_alt_9plus = odds;
            else if (tier === 10) p.ks_alt_10plus = odds;
          }
        }
      }

      // Outs recorded O/U
      if (/^PITCHER_[A-Z]_OUTS_RECORDED$/.test(mt)) {
        const pitcherName = mn.replace(/ Outs Recorded$/, "").trim();
        const p = getOrCreate(pitcherName);
        for (const r of runners) {
          const rn = (r.runnerName as string) || "";
          if (rn === "Over") {
            p.outs_line = Number(r.handicap) || 0;
            p.outs_over_odds = getOdds(r);
          }
        }
      }

      // Moneyline (for win probability)
      if (mt === "MONEY_LINE") {
        // We'll get this from the event level, store per pitcher
      }
    }
  } catch { /* skip */ }

  return playerMap;
}

// ============ SCORING ENGINE ============
function calcBatterPoints(p: Props): { projected: number; upside: number } {
  // === PROJECTED: E[X] = sum of P(X >= k) for each stat tier ===
  const tb1 = p.hit_odds ? oddsToProb(p.hit_odds) : 0;
  const tb2 = p.tb_2plus ? oddsToProb(p.tb_2plus) : 0;
  const tb3 = p.tb_3plus ? oddsToProb(p.tb_3plus) : 0;
  const tb4 = p.tb_4plus ? oddsToProb(p.tb_4plus) : 0;
  const tb5 = p.tb_5plus ? oddsToProb(p.tb_5plus) : 0;
  const expTB = tb1 + tb2 + tb3 + tb4 + tb5;
  const hitPts = expTB * 3; // Each TB = 3 FD pts (1B=3,2B=6,3B=9,HR=12)

  const rbi1 = p.rbi_odds ? oddsToProb(p.rbi_odds) : 0;
  const rbi2 = p.rbis_2plus ? oddsToProb(p.rbis_2plus) : 0;
  const rbi3 = p.rbis_3plus ? oddsToProb(p.rbis_3plus) : 0;
  const rbi4 = p.rbis_4plus ? oddsToProb(p.rbis_4plus) : 0;
  const expRBI = rbi1 + rbi2 + rbi3 + rbi4;

  const run1 = p.run_odds ? oddsToProb(p.run_odds) : 0;
  const run2 = p.runs_2plus ? oddsToProb(p.runs_2plus) : 0;
  const run3 = p.runs_3plus ? oddsToProb(p.runs_3plus) : 0;
  const expRun = run1 + run2 + run3;

  const sb1 = p.sb_odds ? oddsToProb(p.sb_odds) : 0;
  const sb2 = p.sbs_2plus ? oddsToProb(p.sbs_2plus) : 0;
  const expSB = sb1 + sb2;

  const expBB = 0.35;
  const projected = hitPts + expRBI * 3.5 + expRun * 3.2 + expBB * 3 + expSB * 6;

  if (!p.hit_odds && !p.tb_2plus && !p.rbi_odds && !p.run_odds) return { projected: 0, upside: 0 };

  // === UPSIDE: interpolated 20% probability crossing point per stat ===
  function upInterp(tiers: [number, number | null][]): number {
    const probs = tiers.filter(([, o]) => o).map(([k, o]) => [k, oddsToProb(o!)] as const);
    if (!probs.length) return 0;
    let bestK = 0, bestP = 0, nextP = 0;
    for (let i = 0; i < probs.length; i++) {
      if (probs[i][1] >= 0.20) { bestK = probs[i][0]; bestP = probs[i][1]; nextP = i + 1 < probs.length ? probs[i + 1][1] : 0; }
    }
    if (!bestK) return 0;
    if (bestP > 0.20 && nextP < 0.20) { return bestK + (bestP - 0.20) / (bestP - nextP); }
    return bestK;
  }

  const upTB = upInterp([[1, p.hit_odds], [2, p.tb_2plus], [3, p.tb_3plus], [4, p.tb_4plus], [5, p.tb_5plus]]);
  const upRBI = upInterp([[1, p.rbi_odds], [2, p.rbis_2plus], [3, p.rbis_3plus], [4, p.rbis_4plus]]);
  const upRun = upInterp([[1, p.run_odds], [2, p.runs_2plus], [3, p.runs_3plus]]);
  const upSB = upInterp([[1, p.sb_odds], [2, p.sbs_2plus]]);

  const upside = upTB * 3 + upRBI * 3.5 + upRun * 3.2 + expBB * 3 + upSB * 6;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}

function calcPitcherPoints(p: Props): { projected: number; upside: number } {
  const ksLine = p.ks_line || 5;
  const ksOverProb = p.ks_over_odds ? oddsToProb(p.ks_over_odds) : 0.5;
  // Expected Ks: line + adjustment based on over probability
  const expectedKs = ksLine + (ksOverProb - 0.5) * 2;

  const outsLine = p.outs_line || 16;
  const outsOverProb = p.outs_over_odds ? oddsToProb(p.outs_over_odds) : 0.5;
  // Expected outs: if line is 16.5 and over is -110, expected ~ line + (overProb - 0.5) * 2
  const expectedOuts = outsLine + (outsOverProb - 0.5) * 2;

  // Rough ER estimate based on outs (more outs = more IP = slightly more ER but also QS)
  const expectedIP = expectedOuts / 3;
  const expectedER = expectedIP * 0.4; // ~3.6 ERA average

  // Win prob from moneyline or estimate
  const winProb = p.win_odds ? oddsToProb(p.win_odds) : 0.45;
  // QS = 6+ IP (18+ outs) and <= 3 ER. Estimate based on outs line.
  const qsProb = expectedOuts >= 18 ? 0.50 : expectedOuts >= 16 ? 0.35 : expectedOuts >= 14 ? 0.20 : 0.10;

  // FD Pitching: W=6, QS=4, ER=-3, K=3, IP(each out)=1 -- wait, FD scores IP as 3pts per full IP
  // Actually FD scores: each inning pitched = 3 pts, so each out = 1 pt. That IS correct.
  // But expectedOuts formula was off. Fix: expectedOuts should use the line directly.
  const projected = expectedKs * 3 + expectedOuts * 1 + expectedER * -3 + winProb * 6 + qsProb * 4;

  // Upside: ~90th percentile start. Great pitcher day = 50-70 FD pts.
  // Use alt K tiers to find realistic ceiling Ks.
  // Upside Ks: interpolated 20% probability crossing on alt K ladder
  let upsideKs = ksLine + 1;
  const kTiers: [number, number|null][] = [[3,p.ks_alt_3plus],[4,p.ks_alt_4plus],[5,p.ks_alt_5plus],[6,p.ks_alt_6plus],[7,p.ks_alt_7plus],[8,p.ks_alt_8plus],[9,p.ks_alt_9plus],[10,p.ks_alt_10plus]];
  const kProbs = kTiers.filter(([,o]) => o).map(([k, o]) => [k, oddsToProb(o!)] as const);
  if (kProbs.length) {
    let bk = ksLine + 1, bp = 0, np = 0;
    for (let i = 0; i < kProbs.length; i++) {
      if (kProbs[i][1] >= 0.20) { bk = kProbs[i][0]; bp = kProbs[i][1]; np = i + 1 < kProbs.length ? kProbs[i + 1][1] : 0; }
    }
    if (bp > 0.20 && np < 0.20) upsideKs = bk + (bp - 0.20) / (bp - np);
    else upsideKs = bk;
  }

  const upsideOuts = Math.min(outsLine + 3, 21); // cap at 7 IP
  const upsideER = Math.max(0, expectedER - 1.5);
  const upsideWin = Math.min(1, winProb + 0.15);
  const upsideQS = expectedIP >= 4.5 ? Math.min(1, qsProb + 0.25) : qsProb;

  const upside = upsideKs * 3 + upsideOuts * 1 + upsideER * -3 + upsideWin * 6 + upsideQS * 4;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}

// ============ DFF SALARY SCRAPER ============
interface DFFPlayer { name: string; position: string; salary: number; team: string; opponent: string; dff_projected: number; }

async function getDFFPlayers(): Promise<DFFPlayer[]> {
  const res = await fetch("https://www.dailyfantasyfuel.com/mlb/projections/fanduel", {
    headers: { "User-Agent": UA },
  });
  const html = await res.text();
  const rawText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const lines = rawText.split("\n").map((l: string) => l.trim()).filter((l: string) => l);
  const text = lines.join("\n");

  const players: DFFPlayer[] = [];

  const pitcherRegex = /(?:^|\n)P\n([\w][\w\s.'-]+?)\s*(?:DTD\s*)?\n?•\s*\([LRS]\)\n\$\n?([\d.]+)k\n(?:YES|EXP\.)\n(\w{2,3})\n(\w{2,3})\n([\d.]+)/gm;
  let match;
  while ((match = pitcherRegex.exec(text)) !== null) {
    players.push({ name: match[1].trim(), position: "P", salary: Math.round(parseFloat(match[2]) * 1000), team: match[3], opponent: match[4], dff_projected: parseFloat(match[5]) || 0 });
  }

  const batterRegex = /(?:^|\n)(C(?:\/OF)?|1B(?:\/1B)?|2B(?:\/(?:SS|OF|2B))?|3B(?:\/(?:2B|3B))?|SS(?:\/SS)?|OF(?:\/OF)?)\n([\w][\w\s.'-]+?)\s*(?:DTD\s*)?\n?•\s*\([LRS]\)\n\$\n?([\d.]+)k\n(?:YES|EXP\.)\n(\w{2,3})\n(\w{2,3})\n(\d+)\s*(?:✓)?\n([\d.]+)/gm;
  while ((match = batterRegex.exec(text)) !== null) {
    players.push({ name: match[2].trim(), position: match[1], salary: Math.round(parseFloat(match[3]) * 1000), team: match[4], opponent: match[5], dff_projected: parseFloat(match[7]) || 0 });
  }

  return players;
}

// ============ NAME MATCHING ============
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\./g, "").replace(/jr\.?$/i, "").replace(/\s+/g, " ").trim();
}

function findPropMatch(dffName: string, propMap: Map<string, Props>): Props | null {
  if (propMap.has(dffName)) return propMap.get(dffName)!;
  const norm = normalizeName(dffName);
  for (const [propName, data] of propMap.entries()) {
    if (normalizeName(propName) === norm) return data;
  }
  // Last name match (4+ chars)
  const dffLast = norm.split(" ").pop() || "";
  if (dffLast.length >= 4) {
    for (const [propName, data] of propMap.entries()) {
      const propLast = normalizeName(propName).split(" ").pop() || "";
      if (dffLast === propLast) return data;
    }
  }
  return null;
}

// ============ MAIN HANDLER ============
export async function POST() {
  try {
    const [dffPlayers, todayEvents] = await Promise.all([getDFFPlayers(), getTodayEvents()]);

    if (dffPlayers.length === 0) {
      return NextResponse.json({ error: "Could not parse DFF player data" }, { status: 400 });
    }

    // Fetch props from all games in parallel
    const allProps = new Map<string, Props>();
    await Promise.all(todayEvents.map(async (ev) => {
      const props = await getEventProps(ev.id);
      for (const [name, data] of props) allProps.set(name, data);
    }));

    // Count prop fields filled
    let totalPropFields = 0;
    for (const [, props] of allProps) {
      for (const v of Object.values(props)) {
        if (v !== null) totalPropFields++;
      }
    }

    // Merge DFF + FD props and calculate points
    const inserts = dffPlayers.map((dff) => {
      const props = findPropMatch(dff.name, allProps);
      const isPitcher = dff.position === "P";
      const pts = props
        ? (isPitcher ? calcPitcherPoints(props) : calcBatterPoints(props))
        : { projected: dff.dff_projected, upside: Math.round(dff.dff_projected * 1.3 * 10) / 10 };

      return {
        name: dff.name, team: dff.team, opponent: dff.opponent || '', position: dff.position, salary: dff.salary,
        ...(props || emptyProps()),
        projected_pts: pts.projected,
        upside_pts: pts.upside,
        pts_per_k: dff.salary > 0 ? Math.round((pts.upside / (dff.salary / 1000)) * 10) / 10 : 0,
        slate_id: "main",
      };
    });

    // BACKFILL: For games with no DFF data (started/removed), use FD props + avg salary
    const dffTeams = new Set(inserts.map((p) => p.team));
    const AVG_SALARY: Record<string, number> = { P: 9000, C: 2600, "1B": 3000, "2B": 3000, "3B": 2900, SS: 3100, OF: 2900 };

    for (const ev of todayEvents) {
      // Parse team names from event name: "Away Team (Pitcher) @ Home Team (Pitcher)"
      const tm = ev.name.match(/^(.+?)\s*\(.+?\)\s*@\s*(.+?)\s*\(.+?\)$/);
      if (!tm) continue;

      // Map full team names to abbreviations
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

      const awayAbbr = TEAM_ABBR[tm[1].trim()] || tm[1].trim().substring(0, 3).toUpperCase();
      const homeAbbr = TEAM_ABBR[tm[2].trim()] || tm[2].trim().substring(0, 3).toUpperCase();

      if (dffTeams.has(awayAbbr) && dffTeams.has(homeAbbr)) continue;

      // This game has missing DFF data — backfill from prop names
      const gameProps = await getEventProps(ev.id);
      for (const [playerName, props] of gameProps.entries()) {
        // Determine if pitcher or batter
        const isPitcher = props.ks_line !== null || props.ks_over_odds !== null;
        const guessTeam = isPitcher ? awayAbbr : ""; // rough guess
        const pts = isPitcher ? calcPitcherPoints(props) : calcBatterPoints(props);

        // Determine position from prop data
        let position = "OF"; // default for batters
        if (isPitcher) position = "P";

        const salary = AVG_SALARY[position] || 3000;
        const opp = isPitcher ? homeAbbr : "";

        // Only add if not already in inserts
        if (!inserts.find((p) => p.name === playerName)) {
          inserts.push({
            name: playerName,
            team: guessTeam || awayAbbr,
            opponent: opp || homeAbbr,
            position,
            salary,
            ...props,
            projected_pts: pts.projected,
            upside_pts: pts.upside,
            pts_per_k: salary > 0 ? Math.round((pts.upside / (salary / 1000)) * 10) / 10 : 0,
            slate_id: "main",
          });
        }
      }
    }

    // Clear and insert
    await supabase.from("players").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { data, error } = await supabase.from("players").insert(inserts).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const withProps = inserts.filter((p) => p.tb_2plus || p.ks_line);

    return NextResponse.json({
      imported: data?.length || 0,
      pitchers: inserts.filter((p) => p.position === "P").length,
      batters: inserts.filter((p) => p.position !== "P").length,
      withProps: withProps.length,
      totalPropsScraped: allProps.size,
      totalPropFields,
      games: todayEvents.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
