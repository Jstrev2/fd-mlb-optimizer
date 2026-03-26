import { Player } from "./supabase";

// === ODDS CONVERSION ===
export function oddsToProb(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

// === FANDUEL CONSTRAINTS ===
export const SALARY_CAP = 35000;
export const MAX_PER_TEAM = 4; // FanDuel MLB max 4 from same team

export interface LineupSlot {
  position: string;
  player: Player | null;
}

function positionFits(playerPos: string, slotPos: string): boolean {
  if (slotPos === "UTIL") return playerPos !== "P";
  if (slotPos === "C/1B") return playerPos === "C" || playerPos === "1B";
  return playerPos === slotPos;
}

// === OPTIMIZER ===
export interface OptimizerConfig {
  mode: "upside" | "projected";
  excludedTeams: Set<string>;   // teams to exclude (weather, etc)
  stackTeam: string | null;     // team to stack (force 3-4 batters from this team)
  stackSize: number;            // how many from stack team (default 4)
}

export function optimizeLineup(players: Player[], config: OptimizerConfig): LineupSlot[] {
  const { mode, excludedTeams, stackTeam, stackSize } = config;

  // Filter out excluded teams
  const pool = players.filter((p) => !excludedTeams.has(p.team));

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

  const getValue = (p: Player) => mode === "upside" ? p.upside_pts : p.projected_pts;

  // Track used players and team counts
  const usedIds = new Set<string>();
  const teamCounts = new Map<string, number>();
  let remainingSalary = SALARY_CAP;

  const canAdd = (p: Player, slotsLeft: number): boolean => {
    if (usedIds.has(p.id)) return false;
    if (p.salary > remainingSalary) return false;
    // Max per team check
    const tc = teamCounts.get(p.team) || 0;
    if (tc >= MAX_PER_TEAM) return false;
    // Ensure enough salary for remaining slots
    const minPerSlot = 2500;
    if ((remainingSalary - p.salary) < (slotsLeft - 1) * minPerSlot) return false;
    return true;
  };

  const addPlayer = (slot: LineupSlot, player: Player) => {
    slot.player = player;
    usedIds.add(player.id);
    remainingSalary -= player.salary;
    teamCounts.set(player.team, (teamCounts.get(player.team) || 0) + 1);
  };

  // If stacking, pre-select stack players first
  if (stackTeam) {
    const stackPlayers = pool
      .filter((p) => p.team === stackTeam && p.position !== "P")
      .sort((a, b) => getValue(b) - getValue(a));

    let stackCount = 0;
    for (const sp of stackPlayers) {
      if (stackCount >= stackSize) break;

      // Find a positional slot this player fits
      const openSlot = slots.find(
        (s) => s.player === null && s.position !== "UTIL" && positionFits(sp.position, s.position)
      );
      if (openSlot && canAdd(sp, slots.filter((s) => !s.player).length)) {
        addPlayer(openSlot, sp);
        stackCount++;
        continue;
      }
      // Try UTIL
      const utilSlot = slots.find((s) => s.position === "UTIL" && !s.player);
      if (utilSlot && sp.position !== "P" && canAdd(sp, slots.filter((s) => !s.player).length)) {
        addPlayer(utilSlot, sp);
        stackCount++;
      }
    }
  }

  // Fill remaining positional slots (not UTIL)
  const positionalSlots = slots.filter((s) => s.player === null && s.position !== "UTIL");
  for (const slot of positionalSlots) {
    const emptyCount = slots.filter((s) => !s.player).length;
    const candidates = pool
      .filter((p) => positionFits(p.position, slot.position) && canAdd(p, emptyCount))
      .sort((a, b) => getValue(b) - getValue(a));

    if (candidates.length > 0) {
      addPlayer(slot, candidates[0]);
    }
  }

  // Fill UTIL last - any non-pitcher
  const utilSlot = slots.find((s) => s.position === "UTIL" && !s.player);
  if (utilSlot) {
    const emptyCount = slots.filter((s) => !s.player).length;
    const candidates = pool
      .filter((p) => p.position !== "P" && canAdd(p, emptyCount))
      .sort((a, b) => getValue(b) - getValue(a));

    if (candidates.length > 0) {
      addPlayer(utilSlot, candidates[0]);
    }
  }

  return slots;
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
  const hitsOverProb = props.hits_over_odds ? oddsToProb(props.hits_over_odds) : 0.5;

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
