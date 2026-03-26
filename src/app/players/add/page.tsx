"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Position } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const POSITIONS: Position[] = ["P", "C", "1B", "2B", "3B", "SS", "OF"];

export default function AddPlayerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", team: "", position: "OF" as Position, salary: "", projected: "", upside: "" });

  const u = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const salary = parseInt(form.salary) || 0;
    const projected = parseFloat(form.projected) || 0;
    const upside = parseFloat(form.upside) || projected * 1.3;
    const { error } = await supabase.from("players").insert({
      name: form.name, team: form.team.toUpperCase(), position: form.position, salary,
      projected_pts: projected, upside_pts: Math.round(upside * 10) / 10,
      pts_per_k: salary > 0 ? Math.round((upside / (salary / 1000)) * 10) / 10 : 0,
      slate_id: "main",
    });
    if (!error) router.push("/");
    else { alert("Error: " + error.message); setSaving(false); }
  };

  const ic = "w-full py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 text-sm";

  return (
    <main className="min-h-screen pb-20 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-zinc-400 hover:text-white"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-black">Add Player (Manual)</h1>
      </div>
      <p className="text-zinc-500 text-xs mb-4">Props are auto-scraped when you Load Slate. This is for manual overrides only.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><input className={ic} placeholder="Player Name" value={form.name} onChange={(e) => u("name", e.target.value)} required /></div>
          <div><input className={ic} placeholder="Team" value={form.team} onChange={(e) => u("team", e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <select className={ic} value={form.position} onChange={(e) => u("position", e.target.value)}>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className={ic} type="number" placeholder="Salary" value={form.salary} onChange={(e) => u("salary", e.target.value)} required />
          <input className={ic} type="number" step="0.1" placeholder="Projected" value={form.projected} onChange={(e) => u("projected", e.target.value)} />
        </div>
        <input className={ic} type="number" step="0.1" placeholder="Upside (optional, default 1.3x proj)" value={form.upside} onChange={(e) => u("upside", e.target.value)} />
        <button type="submit" disabled={saving} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-xl">
          {saving ? "Saving..." : "Add Player"}
        </button>
      </form>
      <BottomNav />
    </main>
  );
}
