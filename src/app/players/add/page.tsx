"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Position } from "@/lib/supabase";
import { calcBatterPoints, calcPitcherPoints } from "@/lib/scoring";
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
    // Batter
    hits_ou: "", hrs_ou: "", rbis_ou: "", runs_ou: "", walks_ou: "", sbs_ou: "",
    // Pitcher
    ks_ou: "", outs_ou: "", earned_runs_ou: "", win_prob: "", qs_prob: "",
  });

  const u = (f: string, v: string) => {
    setForm((p) => ({ ...p, [f]: v }));
    if (f === "position" && v === "P") setPlayerType("pitcher");
    else if (f === "position" && v !== "P") setPlayerType("batter");
  };

  // Live preview
  const getPreview = () => {
    if (playerType === "pitcher") {
      const ks = parseFloat(form.ks_ou) || 0;
      const outs = parseFloat(form.outs_ou) || 0;
      const er = parseFloat(form.earned_runs_ou) || 0;
      const win = parseFloat(form.win_prob) || 0;
      const qs = parseFloat(form.qs_prob) || 0;
      if (ks === 0 && outs === 0) return null;
      return calcPitcherPoints({ ks_ou: ks, outs_ou: outs, earned_runs_ou: er, win_prob: win, qs_prob: qs });
    } else {
      const hits = parseFloat(form.hits_ou) || 0;
      const hrs = parseFloat(form.hrs_ou) || 0;
      const rbis = parseFloat(form.rbis_ou) || 0;
      const runs = parseFloat(form.runs_ou) || 0;
      const walks = parseFloat(form.walks_ou) || 0;
      const sbs = parseFloat(form.sbs_ou) || 0;
      if (hits === 0 && hrs === 0) return null;
      return calcBatterPoints({ hits_ou: hits, hrs_ou: hrs, rbis_ou: rbis, runs_ou: runs, walks_ou: walks, sbs_ou: sbs });
    }
  };

  const preview = getPreview();
  const salary = parseFloat(form.salary) || 0;
  const ptsPerK = salary > 0 && preview ? (preview.upside / (salary / 1000)) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return;
    setSaving(true);

    const data = {
      name: form.name, team: form.team.toUpperCase(), position: form.position, salary,
      hits_ou: playerType === "batter" ? parseFloat(form.hits_ou) || 0 : null,
      hrs_ou: playerType === "batter" ? parseFloat(form.hrs_ou) || 0 : null,
      rbis_ou: playerType === "batter" ? parseFloat(form.rbis_ou) || 0 : null,
      runs_ou: playerType === "batter" ? parseFloat(form.runs_ou) || 0 : null,
      walks_ou: playerType === "batter" ? parseFloat(form.walks_ou) || 0 : null,
      sbs_ou: playerType === "batter" ? parseFloat(form.sbs_ou) || 0 : null,
      ks_ou: playerType === "pitcher" ? parseFloat(form.ks_ou) || 0 : null,
      outs_ou: playerType === "pitcher" ? parseFloat(form.outs_ou) || 0 : null,
      earned_runs_ou: playerType === "pitcher" ? parseFloat(form.earned_runs_ou) || 0 : null,
      win_prob: playerType === "pitcher" ? parseFloat(form.win_prob) || 0 : null,
      qs_prob: playerType === "pitcher" ? parseFloat(form.qs_prob) || 0 : null,
      projected_pts: preview.projected, upside_pts: preview.upside,
      pts_per_k: Math.round(ptsPerK * 10) / 10,
      slate_id: "default",
    };

    const { error } = await supabase.from("players").insert(data);
    if (!error) router.push("/");
    else { alert("Error: " + error.message); setSaving(false); }
  };

  const ic = "w-full py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 text-sm";
  const lc = "text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 block";

  return (
    <main className="min-h-screen pb-20 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-zinc-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-black">Add Player</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className={lc}>Name *</label><input className={ic} placeholder="Mike Trout" value={form.name} onChange={(e) => u("name", e.target.value)} required /></div>
          <div><label className={lc}>Team</label><input className={ic} placeholder="LAA" value={form.team} onChange={(e) => u("team", e.target.value)} /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lc}>Position *</label>
            <select className={ic} value={form.position} onChange={(e) => u("position", e.target.value)}>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div><label className={lc}>Salary ($) *</label><input className={ic} type="number" placeholder="7500" value={form.salary} onChange={(e) => u("salary", e.target.value)} required /></div>
        </div>

        {/* Props */}
        <div className="border-t border-white/10 pt-4">
          <h2 className="text-sm font-bold mb-3">{playerType === "pitcher" ? "⚾ Pitcher Props" : "🏏 Batter Props"}</h2>

          {playerType === "batter" ? (
            <div className="grid grid-cols-3 gap-3">
              <div><label className={lc}>Hits O/U</label><input className={ic} type="number" step="0.5" placeholder="1.5" value={form.hits_ou} onChange={(e) => u("hits_ou", e.target.value)} /></div>
              <div><label className={lc}>HRs O/U</label><input className={ic} type="number" step="0.5" placeholder="0.5" value={form.hrs_ou} onChange={(e) => u("hrs_ou", e.target.value)} /></div>
              <div><label className={lc}>RBIs O/U</label><input className={ic} type="number" step="0.5" placeholder="0.5" value={form.rbis_ou} onChange={(e) => u("rbis_ou", e.target.value)} /></div>
              <div><label className={lc}>Runs O/U</label><input className={ic} type="number" step="0.5" placeholder="0.5" value={form.runs_ou} onChange={(e) => u("runs_ou", e.target.value)} /></div>
              <div><label className={lc}>Walks O/U</label><input className={ic} type="number" step="0.5" placeholder="0.5" value={form.walks_ou} onChange={(e) => u("walks_ou", e.target.value)} /></div>
              <div><label className={lc}>SBs O/U</label><input className={ic} type="number" step="0.5" placeholder="0.5" value={form.sbs_ou} onChange={(e) => u("sbs_ou", e.target.value)} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div><label className={lc}>Ks O/U</label><input className={ic} type="number" step="0.5" placeholder="6.5" value={form.ks_ou} onChange={(e) => u("ks_ou", e.target.value)} /></div>
              <div><label className={lc}>Outs O/U</label><input className={ic} type="number" step="0.5" placeholder="17.5" value={form.outs_ou} onChange={(e) => u("outs_ou", e.target.value)} /></div>
              <div><label className={lc}>ERs O/U</label><input className={ic} type="number" step="0.5" placeholder="2.5" value={form.earned_runs_ou} onChange={(e) => u("earned_runs_ou", e.target.value)} /></div>
              <div><label className={lc}>Win Prob %</label><input className={ic} type="number" step="1" placeholder="55" value={form.win_prob} onChange={(e) => u("win_prob", e.target.value)} /></div>
              <div><label className={lc}>QS Prob %</label><input className={ic} type="number" step="1" placeholder="45" value={form.qs_prob} onChange={(e) => u("qs_prob", e.target.value)} /></div>
            </div>
          )}
        </div>

        {/* Live preview */}
        {preview && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Points Preview</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-zinc-500 text-[10px]">Projected</p><p className="text-lg font-black">{preview.projected}</p></div>
              <div><p className="text-zinc-500 text-[10px]">Upside</p><p className="text-lg font-black text-emerald-400">{preview.upside}</p></div>
              <div><p className="text-zinc-500 text-[10px]">Pts/$1k</p><p className="text-lg font-black text-amber-400">{ptsPerK.toFixed(1)}</p></div>
            </div>
          </div>
        )}

        <button type="submit" disabled={saving || !preview}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50">
          {saving ? "Saving..." : "Add Player ⚾"}
        </button>
      </form>
      <BottomNav />
    </main>
  );
}
