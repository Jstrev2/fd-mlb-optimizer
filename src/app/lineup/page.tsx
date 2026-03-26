"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase, Player } from "@/lib/supabase";
import { SALARY_CAP, MAX_PER_TEAM, STACK_FRAMEWORKS, LineupSlot, OptimizerConfig } from "@/lib/scoring";
import { solve } from "@/lib/optimizer";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { Zap, DollarSign, TrendingUp, Target, CloudOff, Layers, Loader2, Cpu } from "lucide-react";

export default function LineupPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineup, setLineup] = useState<LineupSlot[]>([]);
  const [mode, setMode] = useState<"upside" | "projected">("upside");
  const [loading, setLoading] = useState(true);
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excludedGames, setExcludedGames] = useState<Set<string>>(new Set()); // store as "TEAM1-TEAM2"
  const [stackIdx, setStackIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(true);
  const [optimized, setOptimized] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("players").select("*").order("upside_pts", { ascending: false });
      if (data) setPlayers(data);
      setLoading(false);
    }
    load();
  }, []);

  // Build games list from team/opponent pairs
  const games = useMemo(() => {
    const gameMap = new Map<string, { teams: [string, string]; key: string }>();
    players.forEach((p) => {
      if (!p.opponent) return;
      const sorted = [p.team, p.opponent].sort();
      const key = sorted.join("-");
      if (!gameMap.has(key)) {
        gameMap.set(key, { teams: sorted as [string, string], key });
      }
    });
    return Array.from(gameMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [players]);

  // Get excluded teams from excluded games
  const excludedTeams = useMemo(() => {
    const teams = new Set<string>();
    for (const gameKey of excludedGames) {
      const game = games.find((g) => g.key === gameKey);
      if (game) {
        teams.add(game.teams[0]);
        teams.add(game.teams[1]);
      }
    }
    return teams;
  }, [excludedGames, games]);

  const toggleGame = (gameKey: string) => {
    setExcludedGames((prev) => {
      const next = new Set(prev);
      if (next.has(gameKey)) next.delete(gameKey);
      else next.add(gameKey);
      return next;
    });
  };

  const activePlayerCount = players.filter((p) => !excludedTeams.has(p.team)).length;
  const framework = STACK_FRAMEWORKS[stackIdx];

  const runOptimizer = () => {
    setSolving(true);
    setError(null);
    // Use setTimeout to let the UI update before blocking
    setTimeout(() => {
      try {
        const config: OptimizerConfig = {
          mode,
          excludedTeams,
          stackFramework: framework.stacks,
        };
        const result = solve(players, config);
        setLineup(result);
        setOptimized(true);
        const filled = result.filter((s) => s.player).length;
        if (filled < 9) setError(`Only filled ${filled}/9 slots. Try relaxing constraints.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Optimizer failed");
      }
      setSolving(false);
    }, 50);
  };

  const totalSalary = lineup.reduce((s, sl) => s + (sl.player?.salary || 0), 0);
  const totalProjected = lineup.reduce((s, sl) => s + (sl.player?.projected_pts || 0), 0);
  const totalUpside = lineup.reduce((s, sl) => s + (sl.player?.upside_pts || 0), 0);
  const remaining = SALARY_CAP - totalSalary;
  const filledSlots = lineup.filter((s) => s.player).length;

  const lineupTeamCounts = useMemo(() => {
    const counts = new Map<string, number>();
    lineup.forEach((s) => {
      if (s.player) counts.set(s.player.team, (counts.get(s.player.team) || 0) + 1);
    });
    return counts;
  }, [lineup]);

  return (
    <main className="min-h-screen pb-20 px-4 pt-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black">⚡ Optimizer</h1>
          <p className="text-zinc-500 text-xs">{activePlayerCount} players · Branch & Bound</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg">
          <Cpu size={10} /> Optimal
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-3">
        <button onClick={() => setMode("upside")}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${mode === "upside" ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400" : "bg-white/5 border border-white/10 text-zinc-500"}`}>
          <TrendingUp size={16} /> Max Upside
        </button>
        <button onClick={() => setMode("projected")}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${mode === "projected" ? "bg-blue-500/20 border-2 border-blue-500 text-blue-400" : "bg-white/5 border border-white/10 text-zinc-500"}`}>
          <Target size={16} /> Max Projected
        </button>
      </div>

      {/* Settings */}
      <button onClick={() => setShowSettings(!showSettings)}
        className="w-full text-left text-xs font-bold text-zinc-400 mb-2 flex items-center gap-2">
        {showSettings ? "▼" : "▶"} Settings
        {excludedGames.size > 0 && <span className="text-red-400">({excludedGames.size} games excluded)</span>}
        <span className="text-purple-400">{framework.label}</span>
      </button>

      {showSettings && (
        <div className="space-y-3 mb-4">
          {/* Stack Framework */}
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Layers size={14} className="text-purple-400" />
              <span className="text-xs font-bold">Stack Framework</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STACK_FRAMEWORKS.map((fw, i) => (
                <button key={i} onClick={() => setStackIdx(i)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${stackIdx === i
                    ? "bg-purple-500/20 border-2 border-purple-500 text-purple-400"
                    : "bg-white/5 border border-white/10 text-zinc-400 hover:border-zinc-500"}`}>
                  {fw.label}
                </button>
              ))}
            </div>
          </div>

          {/* Game Exclusion - grouped by matchup */}
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <CloudOff size={14} className="text-red-400" />
              <span className="text-xs font-bold">Exclude Games</span>
              <span className="text-[10px] text-zinc-500">(weather, PPD)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {games.map((game) => (
                <button key={game.key} onClick={() => toggleGame(game.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${excludedGames.has(game.key)
                    ? "bg-red-500/30 border border-red-500/50 text-red-400 line-through"
                    : "bg-white/5 border border-white/10 text-zinc-400 hover:border-zinc-500"}`}>
                  {game.teams[0]} @ {game.teams[1]}
                </button>
              ))}
            </div>
            {excludedGames.size > 0 && (
              <button onClick={() => setExcludedGames(new Set())} className="text-[10px] text-zinc-500 mt-2 hover:text-zinc-300">
                Clear all
              </button>
            )}
          </div>

          <div className="text-[10px] text-zinc-600 px-1">
            FanDuel: 9 players · $35K cap · Max {MAX_PER_TEAM}/team · P, C/1B, 2B, 3B, SS, OF×3, UTIL
          </div>
        </div>
      )}

      {/* Optimize button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={runOptimizer}
        disabled={activePlayerCount < 9 || solving}
        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-black text-lg rounded-2xl mb-4 shadow-lg shadow-emerald-500/20 disabled:opacity-30 flex items-center justify-center gap-2"
      >
        {solving ? <><Loader2 size={20} className="animate-spin" /> Solving...</> :
          activePlayerCount < 9 ? `Need ${9 - activePlayerCount} more players` : "⚡ OPTIMIZE LINEUP"}
      </motion.button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-sm text-red-400">{error}</div>
      )}

      {/* Results */}
      {optimized && lineup.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="bg-[#12121a] border border-white/10 rounded-xl p-3 text-center">
              <p className="text-[10px] text-zinc-500 uppercase">Salary</p>
              <p className="text-sm font-black">${(totalSalary / 1000).toFixed(1)}k</p>
              <p className="text-[10px] text-zinc-600">${(remaining / 1000).toFixed(1)}k left</p>
            </div>
            <div className="bg-[#12121a] border border-white/10 rounded-xl p-3 text-center">
              <p className="text-[10px] text-zinc-500 uppercase">Projected</p>
              <p className="text-sm font-black text-blue-400">{totalProjected.toFixed(1)}</p>
            </div>
            <div className="bg-[#12121a] border border-emerald-500/30 rounded-xl p-3 text-center">
              <p className="text-[10px] text-emerald-400 uppercase font-bold">Upside</p>
              <p className="text-sm font-black text-emerald-400">{totalUpside.toFixed(1)}</p>
            </div>
            <div className="bg-[#12121a] border border-white/10 rounded-xl p-3 text-center">
              <p className="text-[10px] text-zinc-500 uppercase">Filled</p>
              <p className="text-sm font-black">{filledSlots}/9</p>
            </div>
          </div>

          <div className="flex gap-1.5 mb-3 flex-wrap">
            {Array.from(lineupTeamCounts.entries()).sort((a, b) => b[1] - a[1]).map(([team, count]) => (
              <span key={team} className={`text-[10px] font-bold px-2 py-0.5 rounded ${count >= 3 ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-white/5 text-zinc-400"}`}>
                {team} ×{count}
              </span>
            ))}
          </div>

          <div className="mb-4">
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
                style={{ width: `${(totalSalary / SALARY_CAP) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>${totalSalary.toLocaleString()}</span>
              <span>Cap: ${SALARY_CAP.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2">
            {lineup.map((slot, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className={`bg-[#12121a] border rounded-xl px-4 py-3 flex items-center justify-between ${slot.player ? "border-white/10" : "border-red-500/30"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-zinc-500 bg-white/5 px-2 py-0.5 rounded w-10 text-center">{slot.position}</span>
                  {slot.player ? (
                    <div>
                      <p className="font-bold text-sm">{slot.player.name}</p>
                      <p className="text-[10px] text-zinc-500">{slot.player.team} · {slot.player.position}</p>
                    </div>
                  ) : <p className="text-sm text-red-400">Empty</p>}
                </div>
                {slot.player && (
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-right">
                      <span className="text-emerald-400 font-bold">{slot.player.upside_pts}</span>
                      <p className="text-zinc-600">{slot.player.projected_pts} proj</p>
                    </div>
                    <span className="text-amber-400 font-bold"><DollarSign size={10} className="inline" />{(slot.player.salary / 1000).toFixed(1)}k</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </>
      )}

      {!optimized && !loading && !solving && (
        <div className="text-center py-12">
          <Zap size={48} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-zinc-500">Branch & bound solver finds the optimal lineup</p>
          <p className="text-zinc-600 text-xs mt-1">Choose stack framework, exclude games, then optimize</p>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
