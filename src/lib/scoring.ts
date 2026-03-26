// FanDuel MLB Scoring
// Batters: Single=3, Double=6, Triple=9, HR=12, RBI=3.5, Run=3.2, BB=3, HBP=3, SB=6
// Pitchers: Win=6, QS=4, ER=-3, K=3, IP out=1 (3 per full IP)

import { Player } from "./supabase";

// Convert American odds to implied probability (0-1)
export function oddsToProb(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

// Total bases → fantasy points mapping
// 1 TB = single (3pts), 2 TB = double (6pts), 3 TB = triple (9pts), 4 TB = HR (12pts)
// But we model expected composition from total bases
function tbToPoints(totalBases: number): number {
  // Average distribution for a given TB total
  if (totalBases <= 0) return 0;
  if (totalBases === 1) return 3;      // single
  if (totalBases === 2) return 5.4;    // mix of 2 singles (6) or 1 double (6) — weighted ~5.4
  if (totalBases === 3) return 8;      // mix of single+double, triple, etc
  if (totalBases === 4) return 11;     // HR most likely, or double+2 singles
  if (totalBases >= 5) return 14;      // HR + single typically
  return totalBases * 3;
}

export interface BatterProps {
  // Prop lines with American odds
  total_bases_line: number;     // e.g. 1.5
  total_bases_over_odds: number; // e.g. -130
  total_bases_upside: number;    // e.g. 4 (the 4+ threshold)
  total_bases_upside_odds: number; // e.g. +286
  hits_line: number;
  hits_over_odds: number;
  hrs_line: number;
  hrs_over_odds: number;
  rbis_line: number;
  rbis_over_odds: number;
  runs_line: number;
  runs_over_odds: number;
  walks_line: number;
  walks_over_odds: number;
  sbs_line: number;
  sbs_over_odds: number;
}

export interface PitcherProps {
  ks_line: number;
  ks_over_odds: number;
  outs_line: number;
  outs_over_odds: number;
  earned_runs_line: number;
  earned_runs_under_odds: number;  // under is good for pitchers
  win_prob: number;
  qs_prob: number;
}

export function calcBatterPoints(props: BatterProps): { projected: number; upside: number } {
  // Use implied probabilities to weight expected outcomes
  const tbOverProb = props.total_bases_over_odds ? oddsToProb(props.total_bases_over_odds) : 0.5;
  const tbUpsideProb = props.total_bases_upside_odds ? oddsToProb(props.total_bases_upside_odds) : 0;
  const hitsOverProb = props.hits_over_odds ? oddsToProb(props.hits_over_odds) : 0.5;
  const hrsOverProb = props.hrs_over_odds ? oddsToProb(props.hrs_over_odds) : 0;
  const rbisOverProb = props.rbis_over_odds ? oddsToProb(props.rbis_over_odds) : 0;
  const runsOverProb = props.runs_over_odds ? oddsToProb(props.runs_over_odds) : 0;
  const walksOverProb = props.walks_over_odds ? oddsToProb(props.walks_over_odds) : 0;
  const sbsOverProb = props.sbs_over_odds ? oddsToProb(props.sbs_over_odds) : 0;

  // Expected total bases (weighted by over probability)
  const expectedTB = props.total_bases_line * (0.5 + tbOverProb * 0.3);
  const tbPoints = tbToPoints(Math.round(expectedTB * 2) / 2);

  // Additional counting stats
  const expectedRBIs = props.rbis_line * (0.5 + rbisOverProb * 0.3);
  const expectedRuns = props.runs_line * (0.5 + runsOverProb * 0.3);
  const expectedBBs = props.walks_line * (0.5 + walksOverProb * 0.3);
  const expectedSBs = props.sbs_line * (0.5 + sbsOverProb * 0.3);

  const projected = tbPoints + expectedRBIs * 3.5 + expectedRuns * 3.2 + expectedBBs * 3 + expectedSBs * 6;

  // Upside: use the upside threshold props
  const upsideTBPoints = tbToPoints(props.total_bases_upside || props.total_bases_line + 1.5);
  const upsideRBIs = Math.max(props.rbis_line + 1, 2);
  const upsideRuns = Math.max(props.runs_line + 0.5, 1.5);
  const upsideBBs = props.walks_line + 0.5;
  const upsideSBs = props.sbs_line + 0.3;
  const hrBonus = hrsOverProb > 0.2 ? 12 * hrsOverProb : props.hrs_line * 12;

  // Weight upside by how likely the upside scenario is (higher odds = rarer but bigger)
  const upsideMultiplier = tbUpsideProb > 0 ? 1 + (1 - tbUpsideProb) * 0.3 : 1.15;

  const upside = (upsideTBPoints + upsideRBIs * 3.5 + upsideRuns * 3.2 + upsideBBs * 3 + upsideSBs * 6 + hrBonus * 0.5) * upsideMultiplier;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}

export function calcPitcherPoints(props: PitcherProps): { projected: number; upside: number } {
  const ksOverProb = props.ks_over_odds ? oddsToProb(props.ks_over_odds) : 0.5;
  const outsOverProb = props.outs_over_odds ? oddsToProb(props.outs_over_odds) : 0.5;
  const erUnderProb = props.earned_runs_under_odds ? oddsToProb(props.earned_runs_under_odds) : 0.5;

  const expectedKs = props.ks_line * (0.5 + ksOverProb * 0.3);
  const expectedOuts = props.outs_line * (0.5 + outsOverProb * 0.3);
  const expectedER = props.earned_runs_line * (0.5 + (1 - erUnderProb) * 0.3);

  const projected =
    expectedKs * 3 +
    expectedOuts * 1 +
    expectedER * -3 +
    (props.win_prob / 100) * 6 +
    (props.qs_prob / 100) * 4;

  const upside =
    (props.ks_line + 2) * 3 +
    (props.outs_line + 3) * 1 +
    Math.max(0, props.earned_runs_line - 1) * -3 +
    Math.min(1, (props.win_prob + 15) / 100) * 6 +
    Math.min(1, (props.qs_prob + 15) / 100) * 4;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}

// FanDuel MLB roster: P, C/1B, 2B, 3B, SS, OF, OF, OF, UTIL
export const SALARY_CAP = 35000;

export interface LineupSlot {
  position: string;
  player: Player | null;
}

function positionFits(playerPos: string, slotPos: string): boolean {
  if (slotPos === "UTIL") return playerPos !== "P";
  if (slotPos === "C/1B") return playerPos === "C" || playerPos === "1B";
  return playerPos === slotPos;
}

export function optimizeLineup(players: Player[], mode: "upside" | "projected" = "upside"): LineupSlot[] {
  const slots: LineupSlot[] = [
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

  const sorted = [...players].sort((a, b) => {
    const aVal = mode === "upside" ? a.upside_pts : a.projected_pts;
    const bVal = mode === "upside" ? b.upside_pts : b.projected_pts;
    return (bVal / (b.salary / 1000)) - (aVal / (a.salary / 1000));
  });

  let remainingSalary = SALARY_CAP;
  const usedIds = new Set<string>();

  for (const slot of slots) {
    if (slot.position === "UTIL") continue;
    const candidates = sorted
      .filter((p) => !usedIds.has(p.id) && positionFits(p.position, slot.position) && p.salary <= remainingSalary)
      .sort((a, b) => {
        const aVal = mode === "upside" ? a.upside_pts : a.projected_pts;
        const bVal = mode === "upside" ? b.upside_pts : b.projected_pts;
        return bVal - aVal;
      });

    if (candidates.length > 0) {
      const remainingSlots = slots.filter((s) => s.player === null && s !== slot).length;
      const pick = candidates.find((c) => (remainingSalary - c.salary) >= (remainingSlots - 1) * 3000) || candidates[0];
      slot.player = pick;
      usedIds.add(pick.id);
      remainingSalary -= pick.salary;
    }
  }

  const utilSlot = slots.find((s) => s.position === "UTIL");
  if (utilSlot) {
    const candidates = sorted
      .filter((p) => !usedIds.has(p.id) && p.position !== "P" && p.salary <= remainingSalary)
      .sort((a, b) => (mode === "upside" ? b.upside_pts - a.upside_pts : b.projected_pts - a.projected_pts));
    if (candidates.length > 0) {
      utilSlot.player = candidates[0];
      usedIds.add(candidates[0].id);
    }
  }

  return slots;
}
