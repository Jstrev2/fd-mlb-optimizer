"use client";
import { useState, useEffect } from "react";
import { supabase, Player } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { Trash2, TrendingUp, DollarSign } from "lucide-react";

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchPlayers = async () => {
    const { data } = await supabase.from("players").select("*").order("upside_pts", { ascending: false });
    if (data) setPlayers(data);
    setLoading(false);
  };

  useEffect(() => { fetchPlayers(); }, []);

  const deletePlayer = async (id: string) => {
    await supabase.from("players").delete().eq("id", id);
    setPlayers((p) => p.filter((x) => x.id !== id));
  };

  const clearAll = async () => {
    if (!confirm("Clear all players?")) return;
    await supabase.from("players").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setPlayers([]);
  };

  const positions = ["all", "P", "C", "1B", "2B", "3B", "SS", "OF"];
  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);
  const pitchers = filtered.filter((p) => p.position === "P");
  const batters = filtered.filter((p) => p.position !== "P");

  return (
    <main className="min-h-screen pb-20 px-4 pt-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black">⚾ FD MLB Optimizer</h1>
          <p className="text-zinc-500 text-xs">{players.length} players loaded</p>
        </div>
        <div className="flex gap-2">
          {players.length > 0 && (
            <button onClick={clearAll} className="px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10">Clear</button>
          )}
          <Link href="/players/add" className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-sm font-bold text-emerald-400 hover:bg-emerald-500/30">+ Add</Link>
        </div>
      </div>

      {/* Position filters */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {positions.map((pos) => (
          <button key={pos} onClick={() => setFilter(pos)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${filter === pos ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "text-zinc-500 border border-white/10"}`}>
            {pos === "all" ? "All" : pos}
          </button>
        ))}
      </div>

      {loading ? <p className="text-zinc-600 text-center py-8">Loading...</p> : (
        <>
          {/* Pitchers */}
          {pitchers.length > 0 && (
            <div className="mb-4">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Pitchers</h2>
              <div className="space-y-2">
                {pitchers.map((p) => <PlayerRow key={p.id} player={p} onDelete={deletePlayer} />)}
              </div>
            </div>
          )}
          {/* Batters */}
          {batters.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Batters</h2>
              <div className="space-y-2">
                {batters.map((p) => <PlayerRow key={p.id} player={p} onDelete={deletePlayer} />)}
              </div>
            </div>
          )}
          {filtered.length === 0 && <p className="text-zinc-600 text-center py-12">No players yet — add some to get started</p>}
        </>
      )}
      <BottomNav />
    </main>
  );
}

function PlayerRow({ player: p, onDelete }: { player: Player; onDelete: (id: string) => void }) {
  return (
    <div className="bg-[#12121a] border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-[10px] font-bold text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded">{p.position}</span>
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{p.name}</p>
          <p className="text-[10px] text-zinc-500">{p.team}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div className="text-right">
          <div className="flex items-center gap-1 text-emerald-400"><TrendingUp size={10} />{p.upside_pts}</div>
          <p className="text-zinc-500">{p.projected_pts} proj</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-amber-400"><DollarSign size={10} />{(p.salary / 1000).toFixed(1)}k</div>
          <p className="text-zinc-500">{p.pts_per_k.toFixed(1)} pt/$k</p>
        </div>
        <button onClick={() => onDelete(p.id)} className="text-zinc-700 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
