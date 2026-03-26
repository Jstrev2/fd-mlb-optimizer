// FanDuel MLB Scoring
// Batters: Single=3, Double=6, Triple=9, HR=12, RBI=3.5, Run=3.2, BB=3, HBP=3, SB=6
// Pitchers: Win=6, QS=4, ER=-3, K=3, IP out=1 (3 per full IP)

export interface BatterProps {
  hits_ou: number;
  hrs_ou: number;
  rbis_ou: number;
  runs_ou: number;
  walks_ou: number;
  sbs_ou: number;
}

export interface PitcherProps {
  ks_ou: number;
  outs_ou: number;
  earned_runs_ou: number;
  win_prob: number;      // 0-100
  qs_prob: number;       // 0-100
}

export function calcBatterPoints(props: BatterProps): { projected: number; upside: number } {
  const { hits_ou, hrs_ou, rbis_ou, runs_ou, walks_ou, sbs_ou } = props;

  // Projected: use the o/u line as expected value
  const singles = Math.max(0, hits_ou - hrs_ou);  // non-HR hits are mostly singles
  const doublesTriples = singles * 0.2;            // ~20% of non-HR hits are XBH
  const actualSingles = singles - doublesTriples;

  const projected =
    actualSingles * 3 +          // singles
    doublesTriples * 0.7 * 6 +   // doubles (~70% of XBH)
    doublesTriples * 0.3 * 9 +   // triples (~30% of XBH)
    hrs_ou * 12 +                // HR
    rbis_ou * 3.5 +              // RBI
    runs_ou * 3.2 +              // Runs
    walks_ou * 3 +               // BB
    sbs_ou * 6;                  // SB

  // Upside: assume they hit the over on everything + bonus
  const upsideHits = hits_ou + 1;
  const upsideHrs = Math.min(hrs_ou + 0.5, upsideHits);
  const upsideSingles = Math.max(0, upsideHits - upsideHrs) * 0.8;
  const upsideXBH = Math.max(0, upsideHits - upsideHrs) * 0.2;

  const upside =
    upsideSingles * 3 +
    upsideXBH * 0.7 * 6 +
    upsideXBH * 0.3 * 9 +
    upsideHrs * 12 +
    (rbis_ou + 1) * 3.5 +
    (runs_ou + 0.5) * 3.2 +
    (walks_ou + 0.5) * 3 +
    (sbs_ou + 0.3) * 6;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}

export function calcPitcherPoints(props: PitcherProps): { projected: number; upside: number } {
  const { ks_ou, outs_ou, earned_runs_ou, win_prob, qs_prob } = props;

  const projected =
    ks_ou * 3 +                          // K
    outs_ou * 1 +                        // outs recorded (1pt each)
    earned_runs_ou * -3 +                // ER
    (win_prob / 100) * 6 +               // Win (weighted)
    (qs_prob / 100) * 4;                 // QS (weighted)

  // Upside: hit all overs, extra Ks, fewer ER
  const upside =
    (ks_ou + 2) * 3 +
    (outs_ou + 3) * 1 +
    Math.max(0, earned_runs_ou - 1) * -3 +
    Math.min(1, (win_prob + 15) / 100) * 6 +
    Math.min(1, (qs_prob + 15) / 100) * 4;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}

// FanDuel MLB roster: P, C/1B, 2B, 3B, SS, OF, OF, OF, UTIL
// Salary cap: $35,000
export const SALARY_CAP = 35000;
export const ROSTER_SLOTS = [
  { position: "P", label: "P", count: 1 },
  { position: "C/1B", label: "C/1B", count: 1 },
  { position: "2B", label: "2B", count: 1 },
  { position: "3B", label: "3B", count: 1 },
  { position: "SS", label: "SS", count: 1 },
  { position: "OF", label: "OF", count: 3 },
  { position: "UTIL", label: "UTIL", count: 1 },
];

export interface LineupSlot {
  position: string;
  player: Player | null;
}

import { Player } from "./supabase";

function positionFits(playerPos: string, slotPos: string): boolean {
  if (slotPos === "UTIL") return playerPos !== "P";
  if (slotPos === "C/1B") return playerPos === "C" || playerPos === "1B";
  return playerPos === slotPos;
}

// Greedy optimizer: maximize upside points within salary cap
export function optimizeLineup(players: Player[], mode: "upside" | "projected" = "upside"): LineupSlot[] {
  const slots: { position: string; player: Player | null }[] = [
    { position: "P", player: null },
    { position: "C/1B", player: null },
    { position: "2B", player: null },
    { position: "3B", player: null },
    { position: "SS", player: null },
    { position: "OF", player: null },
    { position: "OF", player: null },
    { position: "OF", player: null },
    { position: "UTIL", player: null },
  ];

  // Sort by value metric
  const sorted = [...players].sort((a, b) => {
    const aVal = mode === "upside" ? a.upside_pts : a.projected_pts;
    const bVal = mode === "upside" ? b.upside_pts : b.projected_pts;
    return (bVal / (b.salary / 1000)) - (aVal / (a.salary / 1000));
  });

  let remainingSalary = SALARY_CAP;
  const usedIds = new Set<string>();

  // Fill required positional slots first (not UTIL)
  for (const slot of slots) {
    if (slot.position === "UTIL") continue;

    // Find best available player for this slot
    const candidates = sorted.filter(
      (p) => !usedIds.has(p.id) && positionFits(p.position, slot.position) && p.salary <= remainingSalary
    );

    // Sort candidates by raw points for this pass
    candidates.sort((a, b) => {
      const aVal = mode === "upside" ? a.upside_pts : a.projected_pts;
      const bVal = mode === "upside" ? b.upside_pts : b.projected_pts;
      return bVal - aVal;
    });

    if (candidates.length > 0) {
      // Pick best that leaves enough salary for remaining slots
      const remainingSlots = slots.filter((s) => s.player === null && s !== slot).length;
      const minPerSlot = 3000; // minimum salary per remaining player

      const pick = candidates.find((c) => (remainingSalary - c.salary) >= (remainingSlots - 1) * minPerSlot) || candidates[0];
      slot.player = pick;
      usedIds.add(pick.id);
      remainingSalary -= pick.salary;
    }
  }

  // Fill UTIL with best remaining non-pitcher
  const utilSlot = slots.find((s) => s.position === "UTIL");
  if (utilSlot) {
    const utilCandidates = sorted.filter(
      (p) => !usedIds.has(p.id) && p.position !== "P" && p.salary <= remainingSalary
    );
    utilCandidates.sort((a, b) => {
      const aVal = mode === "upside" ? a.upside_pts : a.projected_pts;
      const bVal = mode === "upside" ? b.upside_pts : b.projected_pts;
      return bVal - aVal;
    });
    if (utilCandidates.length > 0) {
      utilSlot.player = utilCandidates[0];
      usedIds.add(utilCandidates[0].id);
      remainingSalary -= utilCandidates[0].salary;
    }
  }

  return slots;
}
