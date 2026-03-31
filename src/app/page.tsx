"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase, Player } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { getSelectedSlate, setSelectedSlate as persistSlate, subscribeSlate } from "@/lib/slateContext";
import PlayerDetail from "@/components/PlayerDetail";
import { Download, Loader2, Search, ChevronDown, X, Calendar } from "lucide-react";

type SortKey = "upside_pts" | "projected_pts" | "salary" | "name" | "value";
type SortDir = "asc" | "desc";
interface Slate { id: string; label: string; games: number; lockTime: string; teams: string[]; type?: string; }

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
  // Slate state
  const [slates, setSlates] = useState<Slate[]>([]);
  const [selectedSlate, setSelectedSlateState] = useState<string>("all");
  const [slateDropOpen, setSlateDropOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const fetchPlayers = async () => {
    setLoading(true);
    const { data } = await supabase.from("players").select("*").order("upside_pts", { ascending: false });
    if (data) setPlayers(data);
    setLoading(false);
  };

  const fetchSlates = async () => {
    try {
      const res = await fetch("/api/slates");
      const data = await res.json();
      if (data.slates && data.slates.length > 0) {
        setSlates(data.slates);
        // Auto-select the biggest classic slate (All Day) if none selected
        setSelectedSlateState(() => {
          const current = getSelectedSlate();
          // Check if stored slate still exists in today's data
          const stillValid = current !== "all" && data.slates.some((s: Slate) => s.id === current);
          if (stillValid) return current;
          // Default: Main > All Day > first classic
          const main = data.slates.find((s: Slate) => s.label?.toLowerCase().includes("main") && s.type === "classic");
          const allDay = data.slates.find((s: Slate) => s.label?.toLowerCase().includes("all day") && s.type === "classic");
          const firstClassic = data.slates.find((s: Slate) => s.type === "classic");
          const next = main?.id || allDay?.id || firstClassic?.id || "all";
          persistSlate(next);
          return next;
        });
      }
    } catch { /* silent */ }
  };

  // Sync slate state with localStorage
  const setSelectedSlate = (id: string) => {
    setSelectedSlateState(id);
    persistSlate(id);
  };

  useEffect(() => {
    setSelectedSlateState(getSelectedSlate());
    fetchPlayers();
    fetchSlates();
    // Keep in sync if another page changes it
    const unsub = subscribeSlate((id) => setSelectedSlateState(id));
    return unsub;
  }, []);

  const [importStatus, setImportStatus] = useState<string>("");
  const [showDKModal, setShowDKModal] = useState(false);
  
  const loadSlate = async () => {
    setImporting(true);
    setImportStatus("Queuing import...");
    try {
      const res = await fetch("/api/import-slate", { method: "POST" });
      const data = await res.json();
      if (data.error) { setImportStatus("Error: " + data.error); setImporting(false); return; }
      if (data.status === "already_running") { setImportStatus("Import already running..."); }
      else { setImportStatus("Running pipeline (slates → odds → scores)..."); }
      const jobId = data.jobId;
      
      // Poll job status via Supabase
      const poll = async () => {
        const { data: job } = await supabase.from("import_jobs").select("*").eq("id", jobId).single();
        if (!job) { setTimeout(poll, 3000); return; }
        if (job.status === "pending" || job.status === "running") {
          setImportStatus(job.status === "running" ? "Running pipeline (slates → odds → scores)..." : "Queued, waiting for runner...");
          setTimeout(poll, 3000);
        } else if (job.status === "done" && job.result) {
          const r = job.result;
          setImportStatus(`✅ ${r.players} players · ${r.withProps} w/props${r.creditsRemaining ? ` · ${r.creditsRemaining} credits left` : ""}`);
          fetchPlayers();
          fetchSlates();
          setImporting(false);
        } else {
          setImportStatus(job.result?.error ? `Error: ${job.result.error}` : "Import failed");
          setImporting(false);
        }
      };
      setTimeout(poll, 3000);
    } catch (e) {
      setImportStatus("Failed to queue import: " + String(e));
      setImporting(false);
    }
  };

  const scrapeDK = () => setShowDKModal(true);

  const dkScript = `(async()=>{const sub=new URLSearchParams(location.search).get('subcategory')||'earned-runs';const text=document.body.innerText;const lines=text.split('\\n').map(l=>l.trim()).filter(l=>l);const props={};let currentGame='';for(let i=0;i<lines.length;i++){const l=lines[i];if(l.includes(' AT ')&&l.match(/[A-Z]{3}/)){currentGame=l;continue;}const ouMatch=l.match(/^(Over|Under)$/i);if(ouMatch){const direction=ouMatch[1];let name='',line='',odds='';for(let j=i-1;j>=Math.max(0,i-8);j--){const prev=lines[j];if(prev.match(/^[A-Z][a-z]+ [A-Z][a-z]+/)){name=prev;break;}}for(let j=i+1;j<Math.min(i+4,lines.length);j++){if(lines[j].match(/^[\\d.]+$/)&&!line)line=lines[j];if(lines[j].match(/^[+-]\\d+$/)&&!odds)odds=lines[j];}if(name&&(line||odds)){if(!props[name])props[name]={};if(direction==='Over'||direction==='over'){if(line)props[name][sub+'_line']=parseFloat(line);if(odds)props[name][sub+'_over']=odds;}else{if(odds)props[name][sub+'_under']=odds;}}}const altMatch=l.match(/^(\\d+) or (Fewer|More)$/);if(altMatch){const threshold=parseInt(altMatch[1]);const dir=altMatch[2];let name='',odds='';for(let j=i-1;j>=Math.max(0,i-8);j--){if(lines[j].match(/^[A-Z][a-z]+ [A-Z][a-z]+/)){name=lines[j];break;}}for(let j=i+1;j<Math.min(i+3,lines.length);j++){if(lines[j].match(/^[+-]\\d+$/)){odds=lines[j];break;}}if(name&&odds){if(!props[name])props[name]={};props[name][sub+'_'+threshold+(dir==='More'?'plus':'minus')]=odds;if(!props[name][sub+'_line'])props[name][sub+'_line']=threshold-0.5;}}}const count=Object.keys(props).length;const payload={id:'dk-'+sub+'-'+new Date().toISOString().split('T')[0],date:new Date().toISOString().split('T')[0],category:sub,data:props,player_count:count,scraped_at:new Date().toISOString()};const r=await fetch('https://udwafzawzeaoteghfwjq.supabase.co/rest/v1/dk_props',{method:'POST',headers:{'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODI3NTAsImV4cCI6MjA4OTk1ODc1MH0.9Y-4XLE_qrfONurb6x1VxOl9lHbZY3eCgVtJEjvx2is','apikey':'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODI3NTAsImV4cCI6MjA4OTk1ODc1MH0.9Y-4XLE_qrfONurb6x1VxOl9lHbZY3eCgVtJEjvx2is','Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},body:JSON.stringify(payload)});if(r.ok)alert('✅ Scraped '+count+' '+sub+' props and pushed to Supabase!');else alert('Error: '+(await r.text()));console.log('Props:',props);})();`;

  // Current slate info
  const currentSlate = slates.find(s => s.id === selectedSlate);
  const slateTeams = currentSlate ? new Set(currentSlate.teams) : null;

  const teams = useMemo(() => {
    const t = [...new Set(players.map(p => p.team).filter(Boolean))].sort();
    if (slateTeams) return t.filter(tm => slateTeams.has(tm));
    return t;
  }, [players, slateTeams]);

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
    // Slate filter
    if (slateTeams) list = list.filter(p => slateTeams.has(p.team));
    // Position filter
    if (posFilter !== "all") list = list.filter(p => p.position.split("/").includes(posFilter) || p.position === posFilter);
    // Search
    if (search) { const q = search.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(q)); }
    // Team filter
    if (teamFilter.size > 0) list = list.filter(p => teamFilter.has(p.team));
    // Sort
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
  }, [players, posFilter, search, teamFilter, sortKey, sortDir, slateTeams]);

  const pitchers = filtered.filter(p => p.position === "P");
  const batters = filtered.filter(p => p.position !== "P");
  const displayGames = currentSlate ? currentSlate.games : new Set(players.flatMap(p => [p.team, p.opponent].filter(Boolean))).size / 2;

  const fmtSal = (s: number) => `$${(s / 1000).toFixed(1)}k`;
  const fmtVal = (p: Player) => p.salary > 0 && p.upside_pts > 0 ? (p.upside_pts / (p.salary / 1000)).toFixed(1) : "—";

  return (
    <main className="min-h-screen pb-20 px-3 pt-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-black tracking-tight">⚾ FD MLB Optimizer</h1>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => fetchPlayers()}
            className="px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition-all">
            🔄
          </button>
          <button onClick={loadSlate} disabled={importing}
            className="px-2.5 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs font-bold text-emerald-400 hover:bg-emerald-500/25 transition-all disabled:opacity-50">
            {importing ? <Loader2 size={12} className="animate-spin inline" /> : <Download size={12} className="inline" />}
            {importing ? " ..." : " Import"}
          </button>
          <button onClick={scrapeDK} disabled={importing}
            className="px-2.5 py-1.5 bg-purple-500/15 border border-purple-500/30 rounded-lg text-xs font-bold text-purple-400 hover:bg-purple-500/25 transition-all disabled:opacity-50">
            DK
          </button>
          <Link href="/players/add" className="px-2.5 py-1.5 bg-blue-500/15 border border-blue-500/30 rounded-lg text-xs font-bold text-blue-400 hover:bg-blue-500/25 transition-all">+</Link>
        </div>
      </div>
      {importStatus && (
        <div className={`text-[11px] px-3 py-1.5 rounded-lg mb-2 ${importStatus.startsWith("✅") ? "bg-emerald-500/10 text-emerald-400" : importStatus.startsWith("Error") || importStatus.startsWith("Failed") ? "bg-red-500/10 text-red-400" : "bg-zinc-800 text-zinc-400"}`}>
          {importStatus}
        </div>
      )}

      {/* Slate Selector */}
      <div className="relative mb-3">
        <button onClick={() => setSlateDropOpen(!slateDropOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-all">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-emerald-400" />
            <span className="text-sm font-bold text-zinc-200">
              {currentSlate ? currentSlate.label : `${Math.round(displayGames)} Games · All Day`}
            </span>
            {currentSlate && (
              <span className="text-[10px] text-zinc-500 font-mono">{currentSlate.lockTime}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600">{filtered.length} players</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </div>
        </button>

        {slateDropOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl p-2 z-50 shadow-2xl">
            {/* All Games option */}
            <button onClick={() => { setSelectedSlate("all"); setSlateDropOpen(false); setTeamFilter(new Set()); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${selectedSlate === "all" ? "bg-emerald-500/15 text-emerald-400 font-bold" : "text-zinc-300 hover:bg-zinc-800"}`}>
              <div className="flex justify-between items-center">
                <span>All Games</span>
                <span className="text-[10px] text-zinc-500">{players.length} players</span>
              </div>
            </button>

            {slates.length > 0 && <div className="border-t border-zinc-800 my-1.5" />}

            {slates.map(slate => (
              <button key={slate.id} onClick={() => { setSelectedSlate(slate.id); setSlateDropOpen(false); setTeamFilter(new Set()); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${selectedSlate === slate.id ? "bg-emerald-500/15 text-emerald-400 font-bold" : "text-zinc-300 hover:bg-zinc-800"}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{slate.label}</span>
                    <span className="text-[10px] text-zinc-500 ml-2">{slate.lockTime}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">{slate.teams.length} teams</span>
                </div>
              </button>
            ))}

            {slates.length === 0 && (
              <p className="text-xs text-zinc-600 px-3 py-2">No slates detected yet — import players first</p>
            )}
          </div>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex gap-2 mb-3 items-center flex-wrap">
        {/* Position Tabs */}
        <div className="flex gap-0.5 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
          {positions.map(pos => (
            <button key={pos} onClick={() => setPosFilter(pos)}
              className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${posFilter === pos ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-zinc-500 hover:text-zinc-300 border border-transparent"}`}>
              {pos.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[100px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-7 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X size={11} /></button>}
        </div>

        {/* Team Filter */}
        <div className="relative">
          <button onClick={() => setTeamDropOpen(!teamDropOpen)}
            className={`px-2.5 py-1.5 bg-zinc-900 border rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${teamFilter.size > 0 ? "border-emerald-500/40 text-emerald-400" : "border-zinc-800 text-zinc-400 hover:text-zinc-300"}`}>
            Teams{teamFilter.size > 0 ? ` (${teamFilter.size})` : ""} <ChevronDown size={11} />
          </button>
          {teamDropOpen && (
            <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg p-2 z-50 min-w-[130px] max-h-[260px] overflow-y-auto shadow-2xl">
              <button onClick={() => { setTeamFilter(new Set()); setTeamDropOpen(false); }}
                className="w-full text-left px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 mb-1">Clear all</button>
              {teams.map(t => (
                <label key={t} className="flex items-center gap-2 px-2 py-0.5 hover:bg-zinc-800 rounded cursor-pointer">
                  <input type="checkbox" checked={teamFilter.has(t)} onChange={() => toggleTeam(t)}
                    className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-0 w-3 h-3" />
                  <span className="text-[11px] font-mono text-zinc-300">{t}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Player Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500"><Loader2 size={24} className="animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider text-[10px]">
                  <th className="text-left py-2 px-2 font-semibold w-10">Pos</th>
                  <th className="text-left py-2 px-2 font-semibold cursor-pointer hover:text-zinc-300" onClick={() => handleSort("name")}>Name{sortArrow("name")}</th>
                  <th className="text-right py-2 px-2 font-semibold cursor-pointer hover:text-zinc-300" onClick={() => handleSort("salary")}>Sal{sortArrow("salary")}</th>
                  <th className="text-center py-2 px-2 font-semibold hidden sm:table-cell">Team</th>
                  <th className="text-center py-2 px-2 font-semibold hidden sm:table-cell">Opp</th>
                  <th className="text-right py-2 px-2 font-semibold cursor-pointer hover:text-zinc-300" onClick={() => handleSort("projected_pts")}>Proj{sortArrow("projected_pts")}</th>
                  <th className="text-right py-2 px-2 font-semibold cursor-pointer hover:text-zinc-300" onClick={() => handleSort("upside_pts")}>
                    <span className="text-emerald-500">Up</span>{sortArrow("upside_pts")}
                  </th>
                  <th className="text-right py-2 px-2 font-semibold cursor-pointer hover:text-zinc-300" onClick={() => handleSort("value")}>Val{sortArrow("value")}</th>
                </tr>
              </thead>
              <tbody>
                {posFilter === "all" && pitchers.length > 0 && (
                  <tr><td colSpan={8} className="px-2 pt-2 pb-0.5 text-[9px] font-bold text-zinc-600 uppercase tracking-widest bg-zinc-950/40">Pitchers ({pitchers.length})</td></tr>
                )}
                {(posFilter === "all" ? pitchers : []).map(p => <PlayerRow key={p.id} p={p} fmtSal={fmtSal} fmtVal={fmtVal} onClick={() => setSelectedPlayer(p)} />)}
                {posFilter === "all" && batters.length > 0 && pitchers.length > 0 && (
                  <tr><td colSpan={8} className="px-2 pt-3 pb-0.5 text-[9px] font-bold text-zinc-600 uppercase tracking-widest bg-zinc-950/40">Batters ({batters.length})</td></tr>
                )}
                {(posFilter === "all" ? batters : filtered).map(p => <PlayerRow key={p.id} p={p} fmtSal={fmtSal} fmtVal={fmtVal} onClick={() => setSelectedPlayer(p)} />)}
                {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-zinc-600">No players found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedPlayer && <PlayerDetail player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}

      {showDKModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowDKModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl p-5"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-purple-400 mb-3">📥 Scrape DraftKings Props</h2>
            <div className="space-y-3 text-sm text-zinc-300">
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="font-bold text-zinc-200 mb-1">Step 1:</p>
                <p>Open <a href="https://sportsbook.draftkings.com/leagues/baseball/mlb" target="_blank" className="text-blue-400 underline">DraftKings MLB</a> in a new tab and make sure you can see the page (log in if needed).</p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="font-bold text-zinc-200 mb-1">Step 2:</p>
                <p>Open browser console on that DK tab: <code className="bg-zinc-700 px-1 rounded text-xs">F12</code> → Console tab</p>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="font-bold text-zinc-200 mb-1">Step 3:</p>
                <p className="mb-2">Paste this script and hit Enter:</p>
                <div className="relative">
                  <pre className="bg-black rounded-lg p-3 text-[10px] text-green-400 overflow-x-auto max-h-24 overflow-y-auto">{dkScript.substring(0, 200)}...</pre>
                  <button
                    onClick={() => { navigator.clipboard.writeText(dkScript); setImportStatus("📋 DK script copied!"); }}
                    className="absolute top-2 right-2 bg-purple-500 text-black text-[10px] font-bold px-2 py-1 rounded hover:bg-purple-400">
                    Copy
                  </button>
                </div>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="font-bold text-zinc-200 mb-1">Step 4:</p>
                <p>You&apos;ll see &quot;✅ X pitchers scraped!&quot; — then come back here and hit <span className="text-emerald-400 font-bold">Import</span>.</p>
              </div>
            </div>
            <button onClick={() => setShowDKModal(false)} className="mt-4 w-full py-2 bg-zinc-800 rounded-xl text-sm text-zinc-400 hover:bg-zinc-700">Close</button>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}

function PlayerRow({ p, fmtSal, fmtVal, onClick }: { p: Player; fmtSal: (s: number) => string; fmtVal: (p: Player) => string; onClick: () => void }) {
  const isPitcher = p.position === "P";
  const val = fmtVal(p);
  return (
    <tr className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors group">
      <td className="py-1.5 px-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPitcher ? "bg-blue-500/15 text-blue-400" : "bg-zinc-800 text-zinc-400"}`}>
          {p.position.length > 4 ? p.position.split("/")[0] : p.position}
        </span>
      </td>
      <td className="py-1.5 px-2">
        <div className="font-semibold text-zinc-200 group-hover:text-white transition-colors truncate max-w-[130px] sm:max-w-[200px] text-[12px] cursor-pointer hover:text-emerald-400" onClick={onClick}>{p.name}</div>
        <div className="text-[9px] text-zinc-600 sm:hidden">{p.team} vs {p.opponent}</div>
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-zinc-400 text-[11px]">{fmtSal(p.salary)}</td>
      <td className="py-1.5 px-2 text-center font-mono text-zinc-500 text-[11px] hidden sm:table-cell">{p.team}</td>
      <td className="py-1.5 px-2 text-center font-mono text-zinc-600 text-[11px] hidden sm:table-cell">{p.opponent}</td>
      <td className="py-1.5 px-2 text-right font-mono text-zinc-300 text-[11px]">{p.projected_pts > 0 ? p.projected_pts.toFixed(1) : "—"}</td>
      <td className={`py-1.5 px-2 text-right font-mono font-bold text-[11px] ${p.upside_pts >= 20 ? "text-emerald-400" : p.upside_pts >= 12 ? "text-emerald-500/80" : "text-zinc-400"}`}>
        {p.upside_pts > 0 ? p.upside_pts.toFixed(1) : "—"}
      </td>
      <td className={`py-1.5 px-2 text-right font-mono text-[11px] ${val !== "—" && parseFloat(val) >= 4 ? "text-amber-400" : "text-zinc-500"}`}>{val}</td>
    </tr>
  );
}
