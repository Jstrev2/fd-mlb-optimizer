import { Player } from "./supabase";
import { SALARY_CAP, MAX_PER_TEAM, LineupSlot, OptimizerConfig } from "./scoring";

// Position slot requirements
const SLOT_POSITIONS = ["P", "C/1B", "2B", "3B", "SS", "OF", "OF", "OF", "UTIL"] as const;

function positionFits(playerPos: string, slotPos: string): boolean {
  if (slotPos === "UTIL") return playerPos !== "P";
  if (slotPos === "C/1B") return playerPos === "C" || playerPos === "1B";
  return playerPos === slotPos;
}

// Pre-filter: for each slot, get eligible players sorted by value
function getCandidatesPerSlot(players: Player[], mode: "upside" | "projected"): Player[][] {
  const getValue = (p: Player) => mode === "upside" ? p.upside_pts : p.projected_pts;

  return SLOT_POSITIONS.map((slotPos) => {
    return players
      .filter((p) => positionFits(p.position, slotPos))
      .sort((a, b) => getValue(b) - getValue(a))
      .slice(0, 25); // top 25 candidates per slot
  });
}

interface BestResult {
  players: Player[];
  value: number;
}

// Branch and bound solver
export function solve(allPlayers: Player[], config: OptimizerConfig): LineupSlot[] {
  const { mode, excludedTeams, stackFramework } = config;
  const players = allPlayers.filter((p) => !excludedTeams.has(p.team));
  const getValue = (p: Player) => mode === "upside" ? p.upside_pts : p.projected_pts;

  const candidates = getCandidatesPerSlot(players, mode);
  const best: BestResult = { players: [], value: -1 };

  // Upper bound: sum of best candidate per remaining slot (optimistic)
  function upperBound(slotIdx: number, usedIds: Set<string>, salary: number): number {
    let bound = 0;
    for (let i = slotIdx; i < 9; i++) {
      // Find best unused candidate that fits salary
      for (const c of candidates[i]) {
        if (!usedIds.has(c.id) && c.salary <= salary) {
          bound += getValue(c);
          salary -= c.salary;
          break;
        }
      }
    }
    return bound;
  }

  function search(
    slotIdx: number,
    chosen: Player[],
    currentValue: number,
    remainingSalary: number,
    usedIds: Set<string>,
    teamCounts: Map<string, number>,
  ) {
    // Base case: all 9 slots filled
    if (slotIdx === 9) {
      // Check stack framework
      if (stackFramework.length > 0) {
        // Get batter team counts (exclude pitcher)
        const batterTeamCounts = new Map<string, number>();
        for (let i = 1; i < chosen.length; i++) { // skip slot 0 (pitcher)
          const t = chosen[i].team;
          batterTeamCounts.set(t, (batterTeamCounts.get(t) || 0) + 1);
        }
        const counts = Array.from(batterTeamCounts.values()).sort((a, b) => b - a);

        // Check if counts satisfy framework
        for (let i = 0; i < stackFramework.length; i++) {
          if (!counts[i] || counts[i] < stackFramework[i]) return;
        }
      }

      if (currentValue > best.value) {
        best.value = currentValue;
        best.players = [...chosen];
      }
      return;
    }

    // Pruning: check if upper bound can beat best
    const ub = currentValue + upperBound(slotIdx, usedIds, remainingSalary);
    if (ub <= best.value) return;

    // Min salary needed for remaining slots
    const slotsLeft = 9 - slotIdx;
    const minSalaryNeeded = (slotsLeft - 1) * 2500;

    // Try each candidate for this slot
    for (const player of candidates[slotIdx]) {
      if (usedIds.has(player.id)) continue;
      if (player.salary > remainingSalary) continue;
      if (remainingSalary - player.salary < minSalaryNeeded) continue;

      // Team limit check
      const tc = teamCounts.get(player.team) || 0;
      if (tc >= MAX_PER_TEAM) continue;

      // Place player
      usedIds.add(player.id);
      teamCounts.set(player.team, tc + 1);
      chosen.push(player);

      search(
        slotIdx + 1,
        chosen,
        currentValue + getValue(player),
        remainingSalary - player.salary,
        usedIds,
        teamCounts,
      );

      // Unplace
      chosen.pop();
      usedIds.delete(player.id);
      teamCounts.set(player.team, tc);
    }
  }

  search(0, [], 0, SALARY_CAP, new Set(), new Map());

  // Build lineup slots from best result
  const slots: LineupSlot[] = SLOT_POSITIONS.map((pos) => ({ position: pos, player: null }));
  best.players.forEach((player, i) => {
    slots[i].player = player;
  });

  return slots;
}
