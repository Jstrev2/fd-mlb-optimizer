"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase, Player } from "@/lib/supabase";
import { optimizeLineup, LineupSlot, SALARY_CAP, MAX_PER_TEAM, OptimizerConfig } from "@/lib/scoring";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { Zap, DollarSign, TrendingUp, Target, CloudOff, Layers, X } from "lucide-react";

export default function LineupPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineup, setLineup] = useState<LineupSlot[]>([]);
  const [mode, setMode] = useState<"upside" | "projected">("upside");
  const [loading, setLoading] = useState(true);
  const [optimized, setOptimized] = useState(false);
  const [excludedTeams, setExcludedTeams] = useState<Set<string>>(new Set());
  const [stackTeam, setStackTeam] = useState<string | null>(null);
  const [stackSize, setStackSize] = useState(4);
  const [showSettings, setShowSettings] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("players").select("*").order("upside_pts", { ascending: false });
      if (data) setPlayers(data);
      setLoading(false);
    }
    load();
  }, []);

  // Get unique teams and games
  const teams = useMemo(() => {
    const t = new Set<string>();
    players.forEach((p) => t.add(p.team));
    return Array.from(t).sort();
  }, [players]);

  // Group teams by game (teams that appear together - approximate by matching opponents)
  const games = useMemo(() => {
    // We don't have opponent stored, so just show teams
    return teams;
  }, [teams]);

  const toggleExclude = (team: string) => {
    setExcludedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  const activePlayerCount = players.filter((p) => !excludedTeams.has(p.team)).length;

  const runOptimizer = () => {
    const config: OptimizerConfig = {
      mode,
      excludedTeams,
      stackTeam,
      stackSize,
    };
    const result = optimizeLineup(players, config);
    setLineup(result);
    setOptimized(true);
  };

  const totalSalary = lineup.reduce((s, sl) => s + (sl.player?.salary || 0), 0);
  const totalProjected = lineup.reduce((s, sl) => s + (sl.player?.projected_pts || 0), 0);
  const totalUpside = lineup.reduce((s, sl) => s + (sl.player?.upside_pts || 0), 0);
  const remaining = SALARY_CAP - totalSalary;
  const filledSlots = lineup.filter((s) => s.player).length;

  // Team counts in lineup
  const lineupTeamCounts = useMemo(() => {
    const counts = new Map<string, number>();
    lineup.forEach((s) => {
      if (s.player) counts.set(s.player.team, (counts.get(s.player.team) || 0) + 1);
    });
    return counts;
  }, [lineup]);

  return (
    <main className="min-h-screen pb-20 px-4 pt-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-black">⚡ Optimizer</h1>
        <p className="text-zinc-500 text-xs">{activePlayerCount} active players ({players.length - activePlayerCount} excluded)</p>
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

      {/* Settings toggle */}
      <button onClick={() => setShowSettings(!showSettings)}
        className="w-full text-left text-xs font-bold text-zinc-400 mb-2 flex items-center gap-2">
        {showSettings ? "▼" : "▶"} Settings
        {excludedTeams.size > 0 && <span className="text-red-400">({excludedTeams.size} teams excluded)</span>}
        {stackTeam && <span className="text-purple-400">(stacking {stackTeam})</span>}
      </button>

      {showSettings && (
        <div className="space-y-3 mb-4">
          {/* Game Exclusion */}
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <CloudOff size={14} className="text-red-400" />
              <span className="text-xs font-bold">Exclude Games (Weather/PPD)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {teams.map((team) => (
                <button key={team} onClick={() => toggleExclude(team)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${excludedTeams.has(team)
                    ? "bg-red-500/30 border border-red-500/50 text-red-400 line-through"
                    : "bg-white/5 border border-white/10 text-zinc-400 hover:border-zinc-500"}`}>
                  {team}
                </button>
              ))}
            </div>
            {excludedTeams.size > 0 && (
              <button onClick={() => setExcludedTeams(new Set())} className="text-[10px] text-zinc-500 mt-2 hover:text-zinc-300">
                Clear all exclusions
              </button>
            )}
          </div>

          {/* Stacking */}
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Layers size={14} className="text-purple-400" />
              <span className="text-xs font-bold">Stack Team</span>
              <span className="text-[10px] text-zinc-500">(force 3-4 batters from same team)</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setStackTeam(null)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${!stackTeam
                  ? "bg-purple-500/20 border border-purple-500/40 text-purple-400"
                  : "bg-white/5 border border-white/10 text-zinc-500"}`}>
                None
              </button>
              {teams.filter((t) => !excludedTeams.has(t)).map((team) => (
                <button key={team} onClick={() => setStackTeam(stackTeam === team ? null : team)}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${stackTeam === team
                    ? "bg-purple-500/20 border border-purple-500/40 text-purple-400"
                    : "bg-white/5 border border-white/10 text-zinc-400 hover:border-zinc-500"}`}>
                  {team}
                </button>
              ))}
            </div>
            {stackTeam && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-zinc-500">Stack size:</span>
                {[3, 4].map((n) => (
                  <button key={n} onClick={() => setStackSize(n)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${stackSize === n
                      ? "bg-purple-500/20 text-purple-400"
                      : "text-zinc-500 hover:text-zinc-300"}`}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Rules reminder */}
          <div className="text-[10px] text-zinc-600 px-1">
            FanDuel: 9 players · $35K cap · Max {MAX_PER_TEAM}/team · Roster: P, C/1B, 2B, 3B, SS, OF×3, UTIL
          </div>
        </div>
      )}

      {/* Optimize button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={runOptimizer}
        disabled={activePlayerCount < 9}
        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-black text-lg rounded-2xl mb-6 shadow-lg shadow-emerald-500/20 disabled:opacity-30"
      >
        {activePlayerCount < 9 ? `Need ${9 - activePlayerCount} more players` : "⚡ OPTIMIZE LINEUP"}
      </motion.button>

      {/* Results */}
      {optimized && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-2 mb-4">
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

          {/* Team breakdown */}
          {lineupTeamCounts.size > 0 && (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {Array.from(lineupTeamCounts.entries()).sort((a, b) => b[1] - a[1]).map(([team, count]) => (
                <span key={team} className={`text-[10px] font-bold px-2 py-0.5 rounded ${count >= 3 ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-white/5 text-zinc-400"}`}>
                  {team} ×{count}
                </span>
              ))}
            </div>
          )}

          {/* Salary bar */}
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

          {/* Lineup slots */}
          <div className="space-y-2">
            {lineup.map((slot, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`bg-[#12121a] border rounded-xl px-4 py-3 flex items-center justify-between ${slot.player ? "border-white/10" : "border-red-500/30"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-zinc-500 bg-white/5 px-2 py-0.5 rounded w-10 text-center">{slot.position}</span>
                  {slot.player ? (
                    <div>
                      <p className="font-bold text-sm">{slot.player.name}</p>
                      <p className="text-[10px] text-zinc-500">{slot.player.team} · {slot.player.position}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-red-400">No eligible player</p>
                  )}
                </div>
                {slot.player && (
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-right">
                      <span className="text-emerald-400 font-bold">{slot.player.upside_pts}</span>
                      <p className="text-zinc-600">{slot.player.projected_pts} proj</p>
                    </div>
                    <div className="text-right">
                      <span className="text-amber-400 font-bold flex items-center gap-0.5"><DollarSign size={10} />{(slot.player.salary / 1000).toFixed(1)}k</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </>
      )}

      {!optimized && !loading && (
        <div className="text-center py-12">
          <Zap size={48} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-zinc-500">Configure settings above, then hit optimize</p>
          <p className="text-zinc-600 text-xs mt-1">Max {MAX_PER_TEAM} players per team · ${(SALARY_CAP / 1000).toFixed(0)}K cap</p>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
