"use client";
import { useState, useEffect } from "react";
import { supabase, Player } from "@/lib/supabase";
import { optimizeLineup, LineupSlot, SALARY_CAP } from "@/lib/scoring";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { Zap, DollarSign, TrendingUp, Target } from "lucide-react";

export default function LineupPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineup, setLineup] = useState<LineupSlot[]>([]);
  const [mode, setMode] = useState<"upside" | "projected">("upside");
  const [loading, setLoading] = useState(true);
  const [optimized, setOptimized] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("players").select("*").order("upside_pts", { ascending: false });
      if (data) setPlayers(data);
      setLoading(false);
    }
    load();
  }, []);

  const runOptimizer = () => {
    const result = optimizeLineup(players, mode);
    setLineup(result);
    setOptimized(true);
  };

  const totalSalary = lineup.reduce((s, sl) => s + (sl.player?.salary || 0), 0);
  const totalProjected = lineup.reduce((s, sl) => s + (sl.player?.projected_pts || 0), 0);
  const totalUpside = lineup.reduce((s, sl) => s + (sl.player?.upside_pts || 0), 0);
  const remaining = SALARY_CAP - totalSalary;
  const filledSlots = lineup.filter((s) => s.player).length;

  return (
    <main className="min-h-screen pb-20 px-4 pt-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-black">⚡ Optimizer</h1>
        <p className="text-zinc-500 text-xs">{players.length} players in pool</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode("upside")}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${mode === "upside" ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400" : "bg-white/5 border border-white/10 text-zinc-500"}`}>
          <TrendingUp size={16} /> Max Upside
        </button>
        <button onClick={() => setMode("projected")}
          className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${mode === "projected" ? "bg-blue-500/20 border-2 border-blue-500 text-blue-400" : "bg-white/5 border border-white/10 text-zinc-500"}`}>
          <Target size={16} /> Max Projected
        </button>
      </div>

      {/* Optimize button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={runOptimizer}
        disabled={players.length < 9}
        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-black text-lg rounded-2xl mb-6 shadow-lg shadow-emerald-500/20 disabled:opacity-30"
      >
        {players.length < 9 ? `Need ${9 - players.length} more players` : "⚡ OPTIMIZE LINEUP"}
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

          {/* Salary bar */}
          <div className="mb-4">
            <div className="h-3 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
                style={{ width: `${(totalSalary / SALARY_CAP) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>${(totalSalary).toLocaleString()}</span>
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
          <p className="text-zinc-500">Add players with their props, then hit optimize</p>
          <p className="text-zinc-600 text-xs mt-1">The optimizer maximizes {mode === "upside" ? "upside" : "projected"} points within the $35K salary cap</p>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
