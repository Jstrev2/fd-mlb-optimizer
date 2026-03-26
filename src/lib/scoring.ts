import { Player } from "./supabase";

// === ODDS CONVERSION ===
export function oddsToProb(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

// === FANDUEL CONSTRAINTS ===
export const SALARY_CAP = 35000;
export const MAX_PER_TEAM = 4;

export interface LineupSlot {
  position: string;
  player: Player | null;
}

// === STACK FRAMEWORKS ===
// Each framework defines how many players from each "group" (team)
// e.g. [4,4] = two 4-stacks, [4,3,1] = one 4-stack + one 3-stack + 1 solo, etc.
// These apply to batters only (8 batter slots). Pitcher is separate.
export const STACK_FRAMEWORKS: { label: string; stacks: number[] }[] = [
  { label: "No Stack", stacks: [] },
  { label: "4×4", stacks: [4, 4] },
  { label: "4×3×1", stacks: [4, 3, 1] },
  { label: "4×2×2", stacks: [4, 2, 2] },
  { label: "3×3×2", stacks: [3, 3, 2] },
  { label: "3×3×1×1", stacks: [3, 3, 1, 1] },
  { label: "5×3", stacks: [5, 3] },
  { label: "4×3", stacks: [4, 3] },
  { label: "3×2×2×1", stacks: [3, 2, 2, 1] },
];

export interface OptimizerConfig {
  mode: "upside" | "projected";
  excludedTeams: Set<string>;
  stackFramework: number[]; // e.g. [4, 3, 1]
}

// === MANUAL CALC FUNCTIONS (for add player page) ===
export interface BatterProps {
  total_bases_line: number;
  total_bases_over_odds: number;
  total_bases_upside: number;
  total_bases_upside_odds: number;
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
  earned_runs_under_odds: number;
  win_prob: number;
  qs_prob: number;
}

export function calcBatterPoints(props: BatterProps): { projected: number; upside: number } {
  const tbOverProb = props.total_bases_over_odds ? oddsToProb(props.total_bases_over_odds) : 0.5;
  const tbUpsideProb = props.total_bases_upside_odds ? oddsToProb(props.total_bases_upside_odds) : 0;
  const hrsOverProb = props.hrs_over_odds ? oddsToProb(props.hrs_over_odds) : 0;
  const rbisOverProb = props.rbis_over_odds ? oddsToProb(props.rbis_over_odds) : 0;
  const runsOverProb = props.runs_over_odds ? oddsToProb(props.runs_over_odds) : 0;
  const walksOverProb = props.walks_over_odds ? oddsToProb(props.walks_over_odds) : 0;
  const sbsOverProb = props.sbs_over_odds ? oddsToProb(props.sbs_over_odds) : 0;

  const expectedTB = props.total_bases_line * (0.5 + tbOverProb * 0.3);
  const tbPoints = expectedTB <= 1 ? expectedTB * 3 : expectedTB <= 2 ? 3 + (expectedTB - 1) * 4.5 : 7.5 + (expectedTB - 2) * 5;
  const projected = tbPoints + (props.rbis_line * (0.5 + rbisOverProb * 0.3)) * 3.5 + (props.runs_line * (0.5 + runsOverProb * 0.3)) * 3.2 + (props.walks_line * (0.5 + walksOverProb * 0.3)) * 3 + (props.sbs_line * (0.5 + sbsOverProb * 0.3)) * 6;

  const upsideTBPts = props.total_bases_upside >= 4 ? 12 : props.total_bases_upside >= 3 ? 9 : 6;
  const upside = (upsideTBPts + 1.5 * 3.5 + 1.2 * 3.2 + 0.5 * 3 + sbsOverProb * 6 + hrsOverProb * 12) * (tbUpsideProb > 0 ? 1 + (1 - tbUpsideProb) * 0.3 : 1.15);

  return { projected: Math.round(projected * 10) / 10, upside: Math.round(upside * 10) / 10 };
}

export function calcPitcherPoints(props: PitcherProps): { projected: number; upside: number } {
  const ksOverProb = props.ks_over_odds ? oddsToProb(props.ks_over_odds) : 0.5;
  const outsOverProb = props.outs_over_odds ? oddsToProb(props.outs_over_odds) : 0.5;
  const expectedKs = props.ks_line * (0.5 + ksOverProb * 0.3);
  const expectedOuts = props.outs_line * (0.5 + outsOverProb * 0.3);
  const expectedER = props.earned_runs_line * 0.65;

  const projected = expectedKs * 3 + expectedOuts * 1 + expectedER * -3 + (props.win_prob / 100) * 6 + (props.qs_prob / 100) * 4;
  const upside = (props.ks_line + 2) * 3 + (props.outs_line + 3) * 1 + Math.max(0, props.earned_runs_line - 1) * -3 + Math.min(1, (props.win_prob + 15) / 100) * 6 + Math.min(1, (props.qs_prob + 15) / 100) * 4;

  return { projected: Math.round(projected * 10) / 10, upside: Math.round(upside * 10) / 10 };
}
