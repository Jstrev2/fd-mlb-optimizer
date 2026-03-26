"use client";
import { useState, useEffect } from "react";
import { supabase, Player } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { Trash2, TrendingUp, DollarSign, Download, Loader2 } from "lucide-react";

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
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

  const loadSlate = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/import-slate", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        alert("Import error: " + data.error);
      } else {
        alert(`✅ Imported ${data.imported} players!`);
        fetchPlayers();
      }
    } catch (e) {
      alert("Failed to import slate");
    }
    setImporting(false);
  };

  const positions = ["all", "P", "C", "1B", "2B", "3B", "SS", "OF"];
  const filtered = filter === "all" ? players : players.filter((p) => p.position === filter);
  const pitchers = filtered.filter((p) => p.position === "P");
  const batters = filtered.filter((p) => p.position !== "P");

  const totalSalary = players.reduce((s, p) => s + p.salary, 0);
  const avgProjected = players.length ? (players.reduce((s, p) => s + p.projected_pts, 0) / players.length).toFixed(1) : "0";

  return (
    <main className="min-h-screen pb-20 px-4 pt-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-black">⚾ FD MLB Optimizer</h1>
          <p className="text-zinc-500 text-xs">{players.length} players · avg {avgProjected} FPTS</p>
        </div>
        <div className="flex gap-2">
          <Link href="/players/add" className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-sm font-bold text-emerald-400 hover:bg-emerald-500/30">+ Add</Link>
        </div>
      </div>

      {/* Import / Clear controls */}
      <div className="flex gap-2 mb-4">
        <button onClick={loadSlate} disabled={importing}
          className="flex-1 py-2.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-xl text-sm font-bold text-blue-400 hover:border-blue-500/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
          {importing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {importing ? "Loading Slate..." : "📥 Load Today's FanDuel Slate"}
        </button>
        {players.length > 0 && (
          <button onClick={clearAll} className="px-3 py-2.5 text-xs text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/10">Clear</button>
        )}
      </div>

      {/* Position filters */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {positions.map((pos) => {
          const count = pos === "all" ? players.length : players.filter((p) => p.position === pos).length;
          return (
            <button key={pos} onClick={() => setFilter(pos)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${filter === pos ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "text-zinc-500 border border-white/10"}`}>
              {pos === "all" ? "All" : pos} <span className="text-zinc-600">({count})</span>
            </button>
          );
        })}
      </div>

      {loading ? <p className="text-zinc-600 text-center py-8">Loading...</p> : (
        <>
          {pitchers.length > 0 && (
            <div className="mb-4">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Pitchers ({pitchers.length})</h2>
              <div className="space-y-2">
                {pitchers.map((p) => <PlayerRow key={p.id} player={p} onDelete={deletePlayer} />)}
              </div>
            </div>
          )}
          {batters.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Batters ({batters.length})</h2>
              <div className="space-y-2">
                {batters.map((p) => <PlayerRow key={p.id} player={p} onDelete={deletePlayer} />)}
              </div>
            </div>
          )}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <p className="text-zinc-500 text-lg mb-2">No players loaded yet</p>
              <p className="text-zinc-600 text-sm">Hit &ldquo;Load Today&apos;s Slate&rdquo; to import FanDuel salaries + projections</p>
            </div>
          )}
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
          <p className="text-zinc-500">{p.pts_per_k?.toFixed(1) || '—'} pt/$k</p>
        </div>
        <button onClick={() => onDelete(p.id)} className="text-zinc-700 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
