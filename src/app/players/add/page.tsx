"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Position } from "@/lib/supabase";
import { calcBatterPoints, calcPitcherPoints, oddsToProb } from "@/lib/scoring";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const POSITIONS: Position[] = ["P", "C", "1B", "2B", "3B", "SS", "OF"];

export default function AddPlayerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [playerType, setPlayerType] = useState<"batter" | "pitcher">("batter");
  const [form, setForm] = useState({
    name: "", team: "", position: "OF" as Position, salary: "",
    // Batter - lines and odds
    total_bases_line: "1.5", total_bases_over_odds: "",
    total_bases_upside: "", total_bases_upside_odds: "",
    hits_line: "0.5", hits_over_odds: "",
    hrs_line: "0.5", hrs_over_odds: "",
    rbis_line: "0.5", rbis_over_odds: "",
    runs_line: "0.5", runs_over_odds: "",
    walks_line: "0.5", walks_over_odds: "",
    sbs_line: "0.5", sbs_over_odds: "",
    // Pitcher
    ks_line: "5.5", ks_over_odds: "",
    outs_line: "17.5", outs_over_odds: "",
    earned_runs_line: "2.5", earned_runs_under_odds: "",
    win_prob: "", qs_prob: "",
  });

  const u = (f: string, v: string) => {
    setForm((p) => ({ ...p, [f]: v }));
    if (f === "position" && v === "P") setPlayerType("pitcher");
    else if (f === "position" && v !== "P") setPlayerType("batter");
  };

  const getPreview = () => {
    if (playerType === "pitcher") {
      return calcPitcherPoints({
        ks_line: parseFloat(form.ks_line) || 0,
        ks_over_odds: parseFloat(form.ks_over_odds) || 0,
        outs_line: parseFloat(form.outs_line) || 0,
        outs_over_odds: parseFloat(form.outs_over_odds) || 0,
        earned_runs_line: parseFloat(form.earned_runs_line) || 0,
        earned_runs_under_odds: parseFloat(form.earned_runs_under_odds) || 0,
        win_prob: parseFloat(form.win_prob) || 0,
        qs_prob: parseFloat(form.qs_prob) || 0,
      });
    }
    return calcBatterPoints({
      total_bases_line: parseFloat(form.total_bases_line) || 0,
      total_bases_over_odds: parseFloat(form.total_bases_over_odds) || 0,
      total_bases_upside: parseFloat(form.total_bases_upside) || 0,
      total_bases_upside_odds: parseFloat(form.total_bases_upside_odds) || 0,
      hits_line: parseFloat(form.hits_line) || 0,
      hits_over_odds: parseFloat(form.hits_over_odds) || 0,
      hrs_line: parseFloat(form.hrs_line) || 0,
      hrs_over_odds: parseFloat(form.hrs_over_odds) || 0,
      rbis_line: parseFloat(form.rbis_line) || 0,
      rbis_over_odds: parseFloat(form.rbis_over_odds) || 0,
      runs_line: parseFloat(form.runs_line) || 0,
      runs_over_odds: parseFloat(form.runs_over_odds) || 0,
      walks_line: parseFloat(form.walks_line) || 0,
      walks_over_odds: parseFloat(form.walks_over_odds) || 0,
      sbs_line: parseFloat(form.sbs_line) || 0,
      sbs_over_odds: parseFloat(form.sbs_over_odds) || 0,
    });
  };

  const preview = getPreview();
  const salary = parseFloat(form.salary) || 0;
  const ptsPerK = salary > 0 ? (preview.upside / (salary / 1000)) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const pf = (key: string) => parseFloat((form as Record<string, string>)[key]) || null;
    const data = {
      name: form.name, team: form.team.toUpperCase(), position: form.position, salary,
      total_bases_line: pf("total_bases_line"), total_bases_over_odds: pf("total_bases_over_odds"),
      total_bases_upside: pf("total_bases_upside"), total_bases_upside_odds: pf("total_bases_upside_odds"),
      hits_line: pf("hits_line"), hits_over_odds: pf("hits_over_odds"),
      hrs_line: pf("hrs_line"), hrs_over_odds: pf("hrs_over_odds"),
      rbis_line: pf("rbis_line"), rbis_over_odds: pf("rbis_over_odds"),
      runs_line: pf("runs_line"), runs_over_odds: pf("runs_over_odds"),
      walks_line: pf("walks_line"), walks_over_odds: pf("walks_over_odds"),
      sbs_line: pf("sbs_line"), sbs_over_odds: pf("sbs_over_odds"),
      ks_line: pf("ks_line"), ks_over_odds: pf("ks_over_odds"),
      outs_line: pf("outs_line"), outs_over_odds: pf("outs_over_odds"),
      earned_runs_line: pf("earned_runs_line"), earned_runs_under_odds: pf("earned_runs_under_odds"),
      win_prob: pf("win_prob"), qs_prob: pf("qs_prob"),
      projected_pts: preview.projected, upside_pts: preview.upside,
      pts_per_k: Math.round(ptsPerK * 10) / 10, slate_id: "default",
    };

    const { error } = await supabase.from("players").insert(data);
    if (!error) router.push("/");
    else { alert("Error: " + error.message); setSaving(false); }
  };

  const ic = "w-full py-2 px-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 text-sm";
  const lc = "text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-0.5 block";

  // Helper to show implied probability
  const impliedProb = (oddsStr: string) => {
    const odds = parseFloat(oddsStr);
    if (!odds) return null;
    return `${(oddsToProb(odds) * 100).toFixed(0)}%`;
  };

  return (
    <main className="min-h-screen pb-20 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-zinc-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-black">Add Player</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <div className="col-span-2"><label className={lc}>Name *</label><input className={ic} placeholder="Oneil Cruz" value={form.name} onChange={(e) => u("name", e.target.value)} required /></div>
          <div><label className={lc}>Team</label><input className={ic} placeholder="PIT" value={form.team} onChange={(e) => u("team", e.target.value)} /></div>
          <div><label className={lc}>Salary *</label><input className={ic} type="number" placeholder="7500" value={form.salary} onChange={(e) => u("salary", e.target.value)} required /></div>
        </div>

        <div>
          <label className={lc}>Position *</label>
          <div className="flex gap-1.5">
            {POSITIONS.map((p) => (
              <button key={p} type="button" onClick={() => u("position", p)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${form.position === p ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400" : "bg-white/5 border border-white/10 text-zinc-500"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 pt-4">
          {playerType === "batter" ? (
            <>
              <h2 className="text-sm font-bold mb-3">🏏 Batter Props <span className="text-zinc-500 font-normal text-xs">(line + American odds)</span></h2>

              {/* Total Bases - primary */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 mb-3">
                <p className="text-xs font-bold text-emerald-400 mb-2">⭐ Total Bases (primary upside driver)</p>
                <div className="grid grid-cols-4 gap-2">
                  <div><label className={lc}>Line</label><input className={ic} type="number" step="0.5" placeholder="1.5" value={form.total_bases_line} onChange={(e) => u("total_bases_line", e.target.value)} /></div>
                  <div>
                    <label className={lc}>Over Odds</label>
                    <input className={ic} type="number" placeholder="-130" value={form.total_bases_over_odds} onChange={(e) => u("total_bases_over_odds", e.target.value)} />
                    {impliedProb(form.total_bases_over_odds) && <span className="text-[9px] text-emerald-400">{impliedProb(form.total_bases_over_odds)} impl.</span>}
                  </div>
                  <div><label className={lc}>Upside</label><input className={ic} type="number" step="1" placeholder="4" value={form.total_bases_upside} onChange={(e) => u("total_bases_upside", e.target.value)} /><span className="text-[9px] text-zinc-600">e.g. 4+</span></div>
                  <div>
                    <label className={lc}>Upside Odds</label>
                    <input className={ic} type="number" placeholder="+286" value={form.total_bases_upside_odds} onChange={(e) => u("total_bases_upside_odds", e.target.value)} />
                    {impliedProb(form.total_bases_upside_odds) && <span className="text-[9px] text-amber-400">{impliedProb(form.total_bases_upside_odds)} impl.</span>}
                  </div>
                </div>
              </div>

              {/* Other batter props */}
              <div className="space-y-2">
                {[
                  { label: "Hits", lineKey: "hits_line", oddsKey: "hits_over_odds", linePh: "0.5" },
                  { label: "Home Runs", lineKey: "hrs_line", oddsKey: "hrs_over_odds", linePh: "0.5" },
                  { label: "RBIs", lineKey: "rbis_line", oddsKey: "rbis_over_odds", linePh: "0.5" },
                  { label: "Runs", lineKey: "runs_line", oddsKey: "runs_over_odds", linePh: "0.5" },
                  { label: "Walks", lineKey: "walks_line", oddsKey: "walks_over_odds", linePh: "0.5" },
                  { label: "Stolen Bases", lineKey: "sbs_line", oddsKey: "sbs_over_odds", linePh: "0.5" },
                ].map(({ label, lineKey, oddsKey, linePh }) => (
                  <div key={lineKey} className="grid grid-cols-3 gap-2 items-end">
                    <div><label className={lc}>{label}</label><input className={ic} type="number" step="0.5" placeholder={linePh} value={(form as Record<string, string>)[lineKey]} onChange={(e) => u(lineKey, e.target.value)} /></div>
                    <div>
                      <label className={lc}>Over Odds</label>
                      <input className={ic} type="number" placeholder="-110" value={(form as Record<string, string>)[oddsKey]} onChange={(e) => u(oddsKey, e.target.value)} />
                    </div>
                    <div className="text-right pb-2">
                      {impliedProb((form as Record<string, string>)[oddsKey]) && <span className="text-[10px] text-zinc-400">{impliedProb((form as Record<string, string>)[oddsKey])}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-sm font-bold mb-3">⚾ Pitcher Props</h2>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={lc}>Ks Line</label><input className={ic} type="number" step="0.5" placeholder="5.5" value={form.ks_line} onChange={(e) => u("ks_line", e.target.value)} /></div>
                  <div><label className={lc}>Ks Over Odds</label><input className={ic} type="number" placeholder="-120" value={form.ks_over_odds} onChange={(e) => u("ks_over_odds", e.target.value)} /></div>
                  <div className="text-right pt-5">{impliedProb(form.ks_over_odds) && <span className="text-[10px] text-zinc-400">{impliedProb(form.ks_over_odds)}</span>}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={lc}>Outs Line</label><input className={ic} type="number" step="0.5" placeholder="17.5" value={form.outs_line} onChange={(e) => u("outs_line", e.target.value)} /></div>
                  <div><label className={lc}>Over Odds</label><input className={ic} type="number" placeholder="-110" value={form.outs_over_odds} onChange={(e) => u("outs_over_odds", e.target.value)} /></div>
                  <div></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={lc}>ERs Line</label><input className={ic} type="number" step="0.5" placeholder="2.5" value={form.earned_runs_line} onChange={(e) => u("earned_runs_line", e.target.value)} /></div>
                  <div><label className={lc}>Under Odds</label><input className={ic} type="number" placeholder="-130" value={form.earned_runs_under_odds} onChange={(e) => u("earned_runs_under_odds", e.target.value)} /></div>
                  <div></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lc}>Win Prob %</label><input className={ic} type="number" placeholder="55" value={form.win_prob} onChange={(e) => u("win_prob", e.target.value)} /></div>
                  <div><label className={lc}>QS Prob %</label><input className={ic} type="number" placeholder="45" value={form.qs_prob} onChange={(e) => u("qs_prob", e.target.value)} /></div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Live preview */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">⚡ Points Preview</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-zinc-500 text-[10px]">Projected</p><p className="text-xl font-black">{preview.projected}</p></div>
            <div><p className="text-zinc-500 text-[10px]">Upside</p><p className="text-xl font-black text-emerald-400">{preview.upside}</p></div>
            <div><p className="text-zinc-500 text-[10px]">Pts/$1k</p><p className="text-xl font-black text-amber-400">{ptsPerK.toFixed(1)}</p></div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50">
          {saving ? "Saving..." : "Add Player ⚾"}
        </button>
      </form>
      <BottomNav />
    </main>
  );
}
