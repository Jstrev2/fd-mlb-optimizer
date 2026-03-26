import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import highs from "highs";
import { SALARY_CAP, MAX_PER_TEAM } from "@/lib/scoring";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Player {
  id: string; name: string; team: string; position: string;
  salary: number; projected_pts: number; upside_pts: number;
}

function positionFits(playerPos: string, slotPos: string): boolean {
  if (slotPos === "UTIL") return playerPos !== "P";
  if (slotPos === "C/1B") return playerPos === "C" || playerPos === "1B";
  return playerPos === slotPos;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode = "upside", excludedTeams = [], stackFramework = [] } = body as {
      mode: string; excludedTeams: string[]; stackFramework: number[];
    };

    // Fetch players
    const { data: allPlayers } = await supabase.from("players").select("*");
    if (!allPlayers || allPlayers.length === 0) {
      return NextResponse.json({ error: "No players loaded" }, { status: 400 });
    }

    const excluded = new Set(excludedTeams);
    const players: Player[] = allPlayers
      .filter((p: Player) => !excluded.has(p.team))
      .map((p: Player) => ({
        id: p.id, name: p.name, team: p.team, position: p.position,
        salary: p.salary, projected_pts: p.projected_pts, upside_pts: p.upside_pts,
      }));

    const n = players.length;
    if (n < 9) return NextResponse.json({ error: "Need at least 9 eligible players" }, { status: 400 });

    // Get unique teams
    const teams = Array.from(new Set(players.map((p) => p.team)));

    // Build ILP in LP format for HiGHS
    // Variables: x_0, x_1, ..., x_{n-1} (binary: 1 if player selected)
    const varNames = players.map((_, i) => `x${i}`);
    const objCoeffs = players.map((p) => mode === "upside" ? p.upside_pts : p.projected_pts);

    // Objective: Maximize sum of points
    const objLine = varNames.map((v, i) => `${objCoeffs[i]} ${v}`).join(" + ");

    const constraints: string[] = [];
    let cIdx = 0;

    // 1. Salary cap
    const salaryLine = varNames.map((v, i) => `${players[i].salary} ${v}`).join(" + ");
    constraints.push(`salary: ${salaryLine} <= ${SALARY_CAP}`);

    // 2. Exactly 9 players total
    constraints.push(`total: ${varNames.join(" + ")} = 9`);

    // 3. Exactly 1 pitcher
    const pitcherVars = players.map((p, i) => p.position === "P" ? `x${i}` : null).filter(Boolean);
    if (pitcherVars.length > 0) {
      constraints.push(`pitcher: ${pitcherVars.join(" + ")} = 1`);
    }

    // 4. Exactly 1 C or 1B (for C/1B slot)
    const c1bVars = players.map((p, i) => (p.position === "C" || p.position === "1B") ? `x${i}` : null).filter(Boolean);
    if (c1bVars.length > 0) {
      constraints.push(`c1b: ${c1bVars.join(" + ")} >= 1`);
    }

    // 5. Position minimums (at least 1 of each required position)
    // Need: 1 2B, 1 3B, 1 SS, 3 OF (minimum)
    // But players can fill UTIL too, so we need to be clever
    // The constraint is: among the 8 non-pitcher slots, we need at least:
    // 1 C/1B, 1 2B, 1 3B, 1 SS, 3 OF — the 8th slot is UTIL (any non-P position)

    const posCounts: Record<string, string[]> = { "2B": [], "3B": [], "SS": [], "OF": [] };
    players.forEach((p, i) => {
      if (posCounts[p.position]) posCounts[p.position].push(`x${i}`);
    });

    for (const [pos, vars] of Object.entries(posCounts)) {
      if (vars.length > 0) {
        const min = pos === "OF" ? 3 : 1;
        constraints.push(`pos_${pos}: ${vars.join(" + ")} >= ${min}`);
      }
    }

    // 6. Max 4 per team
    for (const team of teams) {
      const teamVars = players.map((p, i) => p.team === team ? `x${i}` : null).filter(Boolean);
      if (teamVars.length > 0) {
        constraints.push(`team_${team}: ${teamVars.join(" + ")} <= ${MAX_PER_TEAM}`);
      }
    }

    // 7. Stack framework constraints
    // Framework like [4, 3, 1] means: among batters, at least one team has ≥4,
    // at least one OTHER team has ≥3, etc.
    // This is hard to express in pure LP without auxiliary variables.
    // Approach: for each framework group, we add binary vars for "team t contributes to group g"
    // Then: sum over all batters from team t * z_t_g >= groupSize * z_t_g
    // and sum of z_t_g for each g = 1 (exactly one team per group)
    // This requires auxiliary binary variables.
    
    if (stackFramework.length > 0) {
      // For each stack group, we need auxiliary binary variables z_t_g
      // z_t_g = 1 if team t is the team for group g
      const auxVars: string[] = [];
      const auxBounds: string[] = [];

      for (let g = 0; g < stackFramework.length; g++) {
        const groupSize = stackFramework[g];
        const groupTeamVars: string[] = [];

        for (let t = 0; t < teams.length; t++) {
          const zVar = `z${g}_${t}`;
          auxVars.push(zVar);
          auxBounds.push(`0 <= ${zVar} <= 1`);
          groupTeamVars.push(zVar);

          // If z_g_t = 1, then sum of batters from team t >= groupSize
          // Linearized: sum(x_i for i in team t batters) >= groupSize * z_g_t
          const teamBatters = players
            .map((p, i) => (p.team === teams[t] && p.position !== "P") ? `x${i}` : null)
            .filter(Boolean);

          if (teamBatters.length > 0) {
            // sum(batters) - groupSize * z >= 0
            constraints.push(`stack_g${g}_t${t}: ${teamBatters.join(" + ")} - ${groupSize} ${zVar} >= 0`);
          }
        }

        // Exactly one team per stack group
        constraints.push(`stack_assign_g${g}: ${groupTeamVars.join(" + ")} = 1`);
      }

      // Different groups must use different teams (if groups have size > 1)
      // For groups g1 != g2: z_g1_t + z_g2_t <= 1 for all t
      for (let g1 = 0; g1 < stackFramework.length; g1++) {
        for (let g2 = g1 + 1; g2 < stackFramework.length; g2++) {
          if (stackFramework[g1] > 1 && stackFramework[g2] > 1) {
            for (let t = 0; t < teams.length; t++) {
              constraints.push(`nodup_g${g1}_g${g2}_t${t}: z${g1}_${t} + z${g2}_${t} <= 1`);
            }
          }
        }
      }

      // Add auxiliary vars to problem
      varNames.push(...auxVars);
      // Auxiliary vars have 0 objective coefficient
      objCoeffs.push(...auxVars.map(() => 0));
    }

    // Build LP string
    const lpParts = [
      `Maximize`,
      `  obj: ${players.map((_, i) => `${objCoeffs[i]} x${i}`).join(" + ")}`,
      `Subject To`,
      ...constraints.map((c) => `  ${c}`),
      `Bounds`,
      ...players.map((_, i) => `  0 <= x${i} <= 1`),
    ];

    // Add auxiliary var bounds
    if (stackFramework.length > 0) {
      for (let g = 0; g < stackFramework.length; g++) {
        for (let t = 0; t < teams.length; t++) {
          lpParts.push(`  0 <= z${g}_${t} <= 1`);
        }
      }
    }

    // Binary variables
    const binaryVars = [...players.map((_, i) => `x${i}`)];
    if (stackFramework.length > 0) {
      for (let g = 0; g < stackFramework.length; g++) {
        for (let t = 0; t < teams.length; t++) {
          binaryVars.push(`z${g}_${t}`);
        }
      }
    }
    lpParts.push(`Binary`);
    lpParts.push(`  ${binaryVars.join(" ")}`);
    lpParts.push(`End`);

    const lpString = lpParts.join("\n");

    // Solve with HiGHS
    const solver = await highs();
    const solution = solver.solve(lpString);

    if (solution.Status !== "Optimal") {
      return NextResponse.json({
        error: `Solver status: ${solution.Status}. Try relaxing constraints (fewer exclusions or different stack framework).`,
        status: solution.Status,
      }, { status: 400 });
    }

    // Extract selected players
    const selected: Player[] = [];
    const columns = solution.Columns as Record<string, { Primal: number }>;
    for (let i = 0; i < n; i++) {
      const val = columns[`x${i}`]?.Primal ?? 0;
      if (val > 0.5) {
        selected.push(players[i]);
      }
    }

    // Assign to lineup slots
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

    // Sort selected by value descending so best players get their natural position
    const sortedSelected = [...selected].sort((a, b) => {
      const aVal = mode === "upside" ? a.upside_pts : a.projected_pts;
      const bVal = mode === "upside" ? b.upside_pts : b.projected_pts;
      return bVal - aVal;
    });

    const placed = new Set<string>();

    // Place pitcher first
    for (const p of sortedSelected) {
      if (p.position === "P" && !placed.has(p.id)) {
        slots[0].player = p;
        placed.add(p.id);
        break;
      }
    }

    // Place batters in their natural positions
    for (const p of sortedSelected) {
      if (placed.has(p.id)) continue;
      const slot = slots.find((s) => !s.player && s.position !== "UTIL" && positionFits(p.position, s.position));
      if (slot) {
        slot.player = p;
        placed.add(p.id);
      }
    }

    // Place remaining in UTIL
    for (const p of sortedSelected) {
      if (placed.has(p.id)) continue;
      const utilSlot = slots.find((s) => s.position === "UTIL" && !s.player);
      if (utilSlot) {
        utilSlot.player = p;
        placed.add(p.id);
      }
    }

    const totalSalary = selected.reduce((s, p) => s + p.salary, 0);
    const totalProjected = selected.reduce((s, p) => s + p.projected_pts, 0);
    const totalUpside = selected.reduce((s, p) => s + p.upside_pts, 0);

    // Team counts
    const teamCounts: Record<string, number> = {};
    selected.forEach((p) => { teamCounts[p.team] = (teamCounts[p.team] || 0) + 1; });

    return NextResponse.json({
      slots,
      totalSalary,
      totalProjected: Math.round(totalProjected * 10) / 10,
      totalUpside: Math.round(totalUpside * 10) / 10,
      remaining: SALARY_CAP - totalSalary,
      teamCounts,
      objectiveValue: Math.round(solution.ObjectiveValue * 10) / 10,
      solverStatus: solution.Status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
