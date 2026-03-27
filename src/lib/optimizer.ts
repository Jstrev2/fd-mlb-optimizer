import { Player } from "./supabase";
import { SALARY_CAP, MAX_PER_TEAM, MAX_BATTERS_PER_TEAM, LineupSlot, OptimizerConfig } from "./scoring";

// Position slot requirements
const SLOT_POSITIONS = ["P", "C/1B", "2B", "3B", "SS", "OF", "OF", "OF", "UTIL"] as const;

function positionFits(playerPos: string, slotPos: string): boolean {
  if (slotPos === "UTIL") return playerPos !== "P";
  const playerPositions = playerPos.split("/");
  if (slotPos === "C/1B") return playerPositions.includes("C") || playerPositions.includes("1B");
  return playerPositions.includes(slotPos);
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
  function upperBound(slotIdx: number, usedIds: Set<string>, salary: number, pitcherOppTeam: string): number {
    let bound = 0;
    for (let i = slotIdx; i < 9; i++) {
      for (const c of candidates[i]) {
        if (!usedIds.has(c.id) && c.salary <= salary) {
          // Skip batters facing our pitcher
          if (i > 0 && pitcherOppTeam && c.team === pitcherOppTeam) continue;
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

      // FD rule: must have players from at least 3 different teams
      const uniqueTeams = new Set(chosen.map(c => c.team));
      if (uniqueTeams.size < 3) return;

      if (currentValue > best.value) {
        best.value = currentValue;
        best.players = [...chosen];
      }
      return;
    }

    // Pruning: check if upper bound can beat best
    const pitcherOpp = chosen.length > 0 ? (chosen[0].opponent || '') : '';
    const ub = currentValue + upperBound(slotIdx, usedIds, remainingSalary, pitcherOpp);
    if (ub <= best.value) return;

    // Min salary needed for remaining slots
    const slotsLeft = 9 - slotIdx;
    const minSalaryNeeded = (slotsLeft - 1) * 2500;

    // Try each candidate for this slot
    for (const player of candidates[slotIdx]) {
      if (usedIds.has(player.id)) continue;
      if (player.salary > remainingSalary) continue;
      if (remainingSalary - player.salary < minSalaryNeeded) continue;

      // Team limit check — FD rules:
      // Max 5 total from same team, but max 4 batters (pitcher doesn't count toward batter limit)
      const tc = teamCounts.get(player.team) || 0;
      if (tc >= MAX_PER_TEAM) continue; // hard cap: 5 total
      if (slotIdx > 0) {
        // This is a batter slot — count existing batters from this team
        const batterCount = chosen.filter((c, idx) => idx > 0 && c.team === player.team).length;
        if (batterCount >= MAX_BATTERS_PER_TEAM) continue; // max 4 batters
      }

      // Don't pick batters who face our pitcher (opponent team = pitcher's opponent)
      if (slotIdx > 0 && chosen[0]?.opponent && player.team === chosen[0].opponent) continue;

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
