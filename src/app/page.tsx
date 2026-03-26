"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase, Player } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { Download, Loader2, Search, ChevronDown, X } from "lucide-react";

type SortKey = "upside_pts" | "projected_pts" | "salary" | "name" | "value";
type SortDir = "asc" | "desc";

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [posFilter, setPosFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set());
  const [teamDropOpen, setTeamDropOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("upside_pts");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchPlayers = async () => {
    setLoading(true);
    const { data } = await supabase.from("players").select("*").order("upside_pts", { ascending: false });
    if (data) setPlayers(data);
    setLoading(false);
  };

  useEffect(() => { fetchPlayers(); }, []);

  const loadSlate = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/import-slate", { method: "POST" });
      const data = await res.json();
      if (data.error) alert("Import error: " + data.error);
      else { alert(`✅ ${data.imported} players imported`); fetchPlayers(); }
    } catch { alert("Failed to import"); }
    setImporting(false);
  };

  // Derived data
  const teams = useMemo(() => [...new Set(players.map(p => p.team).filter(Boolean))].sort(), [players]);
  const positions = ["all", "P", "C", "1B", "2B", "3B", "SS", "OF"];

  const toggleTeam = (t: string) => {
    setTeamFilter(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === "desc" ? " ▾" : " ▴") : "";

  const filtered = useMemo(() => {
    let list = players;
    if (posFilter !== "all") list = list.filter(p => p.position.split("/").includes(posFilter) || p.position === posFilter);
    if (search) { const q = search.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q)); }
    if (teamFilter.size > 0) list = list.filter(p => teamFilter.has(p.team));

    list = [...list].sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === "value") { va = a.salary > 0 ? a.upside_pts / (a.salary / 1000) : 0; vb = b.salary > 0 ? b.upside_pts / (b.salary / 1000) : 0; }
      else if (sortKey === "name") { va = a.name; vb = b.name; }
      else { va = a[sortKey]; vb = b[sortKey]; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [players, posFilter, search, teamFilter, sortKey, sortDir]);

  const pitchers = filtered.filter(p => p.position === "P");
  const batters = filtered.filter(p => p.position !== "P");
  const gamesCount = new Set(players.flatMap(p => [p.team, p.opponent].filter(Boolean))).size / 2;

  const fmtSal = (s: number) => `$${(s / 1000).toFixed(1)}k`;
  const fmtVal = (p: Player) => p.salary > 0 ? (p.upside_pts / (p.salary / 1000)).toFixed(1) : "—";

  return (
    <main className="min-h-screen pb-20 px-3 pt-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-black tracking-tight">⚾ FD MLB Optimizer</h1>
          <p className="text-zinc-500 text-xs mt-0.5">{players.length} players · {Math.round(gamesCount)} games</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { fetchPlayers(); }}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition-all">
            🔄 Refresh
          </button>
          <button onClick={loadSlate} disabled={importing}
            className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs font-bold text-emerald-400 hover:bg-emerald-500/25 transition-all disabled:opacity-50">
            {importing ? <Loader2 size={12} className="animate-spin inline" /> : <Download size={12} className="inline" />}
            {importing ? " Importing..." : " Import"}
          </button>
          <Link href="/players/add" className="px-3 py-1.5 bg-blue-500/15 border border-blue-500/30 rounded-lg text-xs font-bold text-blue-400 hover:bg-blue-500/25 transition-all">+</Link>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex gap-2 mb-3 items-center flex-wrap">
        {/* Position Tabs */}
        <div className="flex gap-0.5 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
          {positions.map(pos => (
            <button key={pos} onClick={() => setPosFilter(pos)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${posFilter === pos ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>
              {pos.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[120px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X size={12} /></button>}
        </div>

        {/* Team Filter */}
        <div className="relative">
          <button onClick={() => setTeamDropOpen(!teamDropOpen)}
            className={`px-3 py-1.5 bg-zinc-900 border rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${teamFilter.size > 0 ? "border-emerald-500/40 text-emerald-400" : "border-zinc-800 text-zinc-400 hover:text-zinc-300"}`}>
            Teams{teamFilter.size > 0 ? ` (${teamFilter.size})` : ""} <ChevronDown size={12} />
          </button>
          {teamDropOpen && (
            <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg p-2 z-50 min-w-[140px] max-h-[280px] overflow-y-auto shadow-2xl">
              <button onClick={() => { setTeamFilter(new Set()); setTeamDropOpen(false); }}
                className="w-full text-left px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 mb-1">Clear all</button>
              {teams.map(t => (
                <label key={t} className="flex items-center gap-2 px-2 py-1 hover:bg-zinc-800 rounded cursor-pointer">
                  <input type="checkbox" checked={teamFilter.has(t)} onChange={() => toggleTeam(t)}
                    className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-0 focus:ring-offset-0" />
                  <span className="text-xs font-mono text-zinc-300">{t}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Player Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                  <th className="text-left py-2.5 px-2 font-semibold w-10">Pos</th>
                  <th className="text-left py-2.5 px-2 font-semibold cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort("name")}>
                    Name{sortArrow("name")}
                  </th>
                  <th className="text-right py-2.5 px-2 font-semibold cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort("salary")}>
                    Sal{sortArrow("salary")}
                  </th>
                  <th className="text-center py-2.5 px-2 font-semibold hidden sm:table-cell">Team</th>
                  <th className="text-center py-2.5 px-2 font-semibold hidden sm:table-cell">Opp</th>
                  <th className="text-right py-2.5 px-2 font-semibold cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort("projected_pts")}>
                    Proj{sortArrow("projected_pts")}
                  </th>
                  <th className="text-right py-2.5 px-2 font-semibold cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort("upside_pts")}>
                    <span className="text-emerald-400">Up</span>{sortArrow("upside_pts")}
                  </th>
                  <th className="text-right py-2.5 px-2 font-semibold cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => handleSort("value")}>
                    Val{sortArrow("value")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Pitchers section */}
                {pitchers.length > 0 && posFilter === "all" && (
                  <tr><td colSpan={8} className="px-2 pt-2 pb-1 text-[10px] font-bold text-zinc-600 uppercase tracking-widest bg-zinc-950/50">Pitchers</td></tr>
                )}
                {(posFilter === "all" ? pitchers : []).map(p => <PlayerRow key={p.id} p={p} fmtSal={fmtSal} fmtVal={fmtVal} />)}

                {/* Batters section */}
                {batters.length > 0 && posFilter === "all" && pitchers.length > 0 && (
                  <tr><td colSpan={8} className="px-2 pt-3 pb-1 text-[10px] font-bold text-zinc-600 uppercase tracking-widest bg-zinc-950/50">Batters</td></tr>
                )}
                {(posFilter === "all" ? batters : filtered).map(p => <PlayerRow key={p.id} p={p} fmtSal={fmtSal} fmtVal={fmtVal} />)}

                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-zinc-600">No players found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

function PlayerRow({ p, fmtSal, fmtVal }: { p: Player; fmtSal: (s: number) => string; fmtVal: (p: Player) => string }) {
  const isPitcher = p.position === "P";
  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group">
      <td className="py-2 px-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPitcher ? "bg-blue-500/15 text-blue-400" : "bg-zinc-800 text-zinc-400"}`}>
          {p.position.length > 3 ? p.position.split("/")[0] : p.position}
        </span>
      </td>
      <td className="py-2 px-2">
        <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors truncate max-w-[140px] sm:max-w-[200px]">{p.name}</div>
        <div className="text-[10px] text-zinc-600 sm:hidden">{p.team} vs {p.opponent}</div>
      </td>
      <td className="py-2 px-2 text-right font-mono text-zinc-400 text-[11px]">{fmtSal(p.salary)}</td>
      <td className="py-2 px-2 text-center font-mono text-zinc-500 hidden sm:table-cell">{p.team}</td>
      <td className="py-2 px-2 text-center font-mono text-zinc-600 hidden sm:table-cell">{p.opponent}</td>
      <td className="py-2 px-2 text-right font-mono text-zinc-300">{p.projected_pts > 0 ? p.projected_pts.toFixed(1) : "—"}</td>
      <td className={`py-2 px-2 text-right font-mono font-bold ${p.upside_pts >= 20 ? "text-emerald-400" : p.upside_pts >= 12 ? "text-emerald-500/80" : "text-zinc-400"}`}>
        {p.upside_pts > 0 ? p.upside_pts.toFixed(1) : "—"}
      </td>
      <td className={`py-2 px-2 text-right font-mono text-[11px] ${parseFloat(fmtVal(p)) >= 4 ? "text-amber-400" : "text-zinc-500"}`}>
        {fmtVal(p)}
      </td>
    </tr>
  );
}
