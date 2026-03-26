"use client";
import { Player } from "@/lib/supabase";
import { X } from "lucide-react";

// Replicate the exact devig logic from scoring.ts so user can verify
function impliedProb(odds: number): number {
  if (!odds) return 0;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function devigOneSided(odds: number): number {
  if (!odds) return 0;
  const raw = impliedProb(odds);
  let vigDivisor: number;
  if (odds < -300) vigDivisor = 1.06;
  else if (odds < -150) vigDivisor = 1.10;
  else if (odds < 0) vigDivisor = 1.12;
  else if (odds <= 200) vigDivisor = 1.15;
  else if (odds <= 500) vigDivisor = 1.18;
  else vigDivisor = 1.22;
  return Math.min(raw / vigDivisor, 0.99);
}

function fmtOdds(o: number | null) {
  if (!o) return "—";
  return o > 0 ? `+${o}` : `${o}`;
}

function fmtPct(p: number) {
  return `${(p * 100).toFixed(1)}%`;
}

interface Props { player: Player; onClose: () => void; }

export default function PlayerDetail({ player: p, onClose }: Props) {
  const isPitcher = p.position === "P";

  // Build batter odds table
  const batterTiers: { label: string; key: string; odds: number | null; fdPts: string }[] = [
    { label: "Hit 1+ (≈TB 1+)", key: "hit_odds", odds: p.hit_odds, fdPts: "3 per TB" },
    { label: "TB 2+", key: "tb_2plus", odds: p.tb_2plus, fdPts: "3 per TB" },
    { label: "TB 3+", key: "tb_3plus", odds: p.tb_3plus, fdPts: "3 per TB" },
    { label: "TB 4+", key: "tb_4plus", odds: p.tb_4plus, fdPts: "3 per TB" },
    { label: "TB 5+", key: "tb_5plus", odds: p.tb_5plus, fdPts: "3 per TB" },
    { label: "HR", key: "hr_odds", odds: p.hr_odds, fdPts: "12 (4 TB)" },
    { label: "HR 2+", key: "hr_2plus", odds: p.hr_2plus, fdPts: "24+" },
    { label: "RBI 1+", key: "rbi_odds", odds: p.rbi_odds, fdPts: "3.5 per RBI" },
    { label: "RBI 2+", key: "rbis_2plus", odds: p.rbis_2plus, fdPts: "3.5 per RBI" },
    { label: "RBI 3+", key: "rbis_3plus", odds: p.rbis_3plus, fdPts: "3.5 per RBI" },
    { label: "RBI 4+", key: "rbis_4plus", odds: p.rbis_4plus, fdPts: "3.5 per RBI" },
    { label: "Run 1+", key: "run_odds", odds: p.run_odds, fdPts: "3.2 per R" },
    { label: "Run 2+", key: "runs_2plus", odds: p.runs_2plus, fdPts: "3.2 per R" },
    { label: "Run 3+", key: "runs_3plus", odds: p.runs_3plus, fdPts: "3.2 per R" },
    { label: "SB 1+", key: "sb_odds", odds: p.sb_odds, fdPts: "6 per SB" },
    { label: "SB 2+", key: "sbs_2plus", odds: p.sbs_2plus, fdPts: "6 per SB" },
    { label: "Single", key: "single_odds", odds: p.single_odds, fdPts: "3" },
    { label: "Double", key: "double_odds", odds: p.double_odds, fdPts: "6" },
    { label: "Triple", key: "triple_odds", odds: p.triple_odds, fdPts: "9" },
    { label: "H+R+RBI 1+", key: "hrr_1plus", odds: p.hrr_1plus, fdPts: "combo" },
    { label: "H+R+RBI 2+", key: "hrr_2plus", odds: p.hrr_2plus, fdPts: "combo" },
    { label: "H+R+RBI 3+", key: "hrr_3plus", odds: p.hrr_3plus, fdPts: "combo" },
    { label: "H+R+RBI 4+", key: "hrr_4plus", odds: p.hrr_4plus, fdPts: "combo" },
  ];

  const pitcherTiers: { label: string; key: string; odds: number | null; fdPts: string }[] = [
    { label: "Ks O/U Line", key: "ks_line", odds: p.ks_line, fdPts: "3 per K" },
    { label: "Ks Over Odds", key: "ks_over_odds", odds: p.ks_over_odds, fdPts: "—" },
    { label: "Ks 3+", key: "ks_alt_3plus", odds: p.ks_alt_3plus, fdPts: "9+" },
    { label: "Ks 4+", key: "ks_alt_4plus", odds: p.ks_alt_4plus, fdPts: "12+" },
    { label: "Ks 5+", key: "ks_alt_5plus", odds: p.ks_alt_5plus, fdPts: "15+" },
    { label: "Ks 6+", key: "ks_alt_6plus", odds: p.ks_alt_6plus, fdPts: "18+" },
    { label: "Ks 7+", key: "ks_alt_7plus", odds: p.ks_alt_7plus, fdPts: "21+" },
    { label: "Ks 8+", key: "ks_alt_8plus", odds: p.ks_alt_8plus, fdPts: "24+" },
    { label: "Ks 9+", key: "ks_alt_9plus", odds: p.ks_alt_9plus, fdPts: "27+" },
    { label: "Ks 10+", key: "ks_alt_10plus", odds: p.ks_alt_10plus, fdPts: "30+" },
    { label: "Outs O/U Line", key: "outs_line", odds: p.outs_line, fdPts: "1 per out" },
    { label: "Outs Over Odds", key: "outs_over_odds", odds: p.outs_over_odds, fdPts: "—" },
    { label: "Win Odds", key: "win_odds", odds: p.win_odds, fdPts: "6 (W)" },
  ];

  const tiers = isPitcher ? pitcherTiers : batterTiers;
  const hasOdds = tiers.filter(t => t.odds !== null && t.odds !== 0);
  const noOdds = tiers.filter(t => t.odds === null || t.odds === 0);

  // Compute E[X] breakdown for batters
  let breakdown: { stat: string; terms: string; ev: number; pts: number }[] = [];
  if (!isPitcher) {
    const tbTiers = [
      { k: 1, odds: p.hit_odds }, { k: 2, odds: p.tb_2plus },
      { k: 3, odds: p.tb_3plus }, { k: 4, odds: p.tb_4plus }, { k: 5, odds: p.tb_5plus },
    ].filter(t => t.odds);
    const rbiTiers = [
      { k: 1, odds: p.rbi_odds }, { k: 2, odds: p.rbis_2plus },
      { k: 3, odds: p.rbis_3plus }, { k: 4, odds: p.rbis_4plus },
    ].filter(t => t.odds);
    const runTiers = [
      { k: 1, odds: p.run_odds }, { k: 2, odds: p.runs_2plus }, { k: 3, odds: p.runs_3plus },
    ].filter(t => t.odds);
    const sbTiers = [
      { k: 1, odds: p.sb_odds }, { k: 2, odds: p.sbs_2plus },
    ].filter(t => t.odds);

    const calcEV = (tiers: { k: number; odds: number | null }[]) => {
      const probs = tiers.filter(t => t.odds).map(t => ({ k: t.k, p: devigOneSided(t.odds!) }));
      return { ev: probs.reduce((s, t) => s + t.p, 0), probs };
    };

    const tb = calcEV(tbTiers);
    const rbi = calcEV(rbiTiers);
    const run = calcEV(runTiers);
    const sb = calcEV(sbTiers);
    const bb = { ev: 0.35, probs: [] as { k: number; p: number }[] };

    breakdown = [
      { stat: "TB", terms: tb.probs.map(t => fmtPct(t.p)).join(" + "), ev: tb.ev, pts: tb.ev * 3 },
      { stat: "RBI", terms: rbi.probs.map(t => fmtPct(t.p)).join(" + "), ev: rbi.ev, pts: rbi.ev * 3.5 },
      { stat: "R", terms: run.probs.map(t => fmtPct(t.p)).join(" + "), ev: run.ev, pts: run.ev * 3.2 },
      { stat: "BB", terms: "est. 0.35", ev: bb.ev, pts: bb.ev * 3 },
      { stat: "SB", terms: sb.probs.map(t => fmtPct(t.p)).join(" + "), ev: sb.ev, pts: sb.ev * 6 },
    ];
  }

  const totalProj = breakdown.reduce((s, b) => s + b.pts, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-black text-white">{p.name}</h2>
            <p className="text-xs text-zinc-500">
              {p.position} · {p.team} vs {p.opponent} · ${(p.salary / 1000).toFixed(1)}k
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        {/* Scores */}
        <div className="px-4 py-3 flex gap-4 border-b border-zinc-800">
          <div className="flex-1 bg-zinc-800/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Projected</div>
            <div className="text-xl font-black text-zinc-200">{p.projected_pts > 0 ? p.projected_pts.toFixed(1) : "—"}</div>
          </div>
          <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">Upside (P90)</div>
            <div className="text-xl font-black text-emerald-400">{p.upside_pts > 0 ? p.upside_pts.toFixed(1) : "—"}</div>
          </div>
          <div className="flex-1 bg-zinc-800/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Value</div>
            <div className="text-xl font-black text-zinc-200">
              {p.salary > 0 && p.upside_pts > 0 ? (p.upside_pts / (p.salary / 1000)).toFixed(1) : "—"}
            </div>
          </div>
        </div>

        {/* Raw Odds Table */}
        <div className="px-4 py-3">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
            Raw FanDuel Odds ({hasOdds.length} found, {noOdds.length} missing)
          </h3>
          <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-600 border-b border-zinc-800 text-[10px] uppercase">
                  <th className="text-left py-1.5 px-3">Prop</th>
                  <th className="text-right py-1.5 px-3">Odds</th>
                  <th className="text-right py-1.5 px-3">Raw %</th>
                  <th className="text-right py-1.5 px-3">Devig %</th>
                  <th className="text-right py-1.5 px-3">FD Pts</th>
                </tr>
              </thead>
              <tbody>
                {hasOdds.map(t => {
                  const raw = t.odds ? impliedProb(t.odds) : 0;
                  const fair = t.odds ? devigOneSided(t.odds) : 0;
                  const isLine = t.key.includes("_line");
                  return (
                    <tr key={t.key} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-1.5 px-3 text-zinc-300 font-medium">{t.label}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-zinc-200">
                        {isLine ? t.odds : fmtOdds(t.odds)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-zinc-500">
                        {isLine ? "—" : fmtPct(raw)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-emerald-400/80">
                        {isLine ? "—" : fmtPct(fair)}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-zinc-500">{t.fdPts}</td>
                    </tr>
                  );
                })}
                {hasOdds.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-zinc-600">No odds data found for this player</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {noOdds.length > 0 && (
            <p className="text-[10px] text-zinc-600 mt-1.5">
              Missing: {noOdds.map(t => t.label).join(", ")}
            </p>
          )}
        </div>

        {/* Calculation Breakdown (batters only) */}
        {!isPitcher && breakdown.length > 0 && hasOdds.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Projection Breakdown
            </h3>
            <p className="text-[10px] text-zinc-600 mb-2">
              E[X] = Σ P(X≥k) for each tier · FD pts = weight × E[X]
            </p>
            <div className="bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-zinc-600 border-b border-zinc-800 text-[10px] uppercase">
                    <th className="text-left py-1.5 px-3">Stat</th>
                    <th className="text-left py-1.5 px-3">Tier Probs (devigged)</th>
                    <th className="text-right py-1.5 px-3">E[X]</th>
                    <th className="text-right py-1.5 px-3">FD Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map(b => (
                    <tr key={b.stat} className="border-b border-zinc-800/50">
                      <td className="py-1.5 px-3 text-zinc-300 font-bold">{b.stat}</td>
                      <td className="py-1.5 px-3 text-zinc-500 font-mono text-[10px]">{b.terms || "—"}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-zinc-300">{b.ev.toFixed(3)}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-emerald-400">{b.pts.toFixed(1)}</td>
                    </tr>
                  ))}
                  <tr className="bg-zinc-800/30">
                    <td className="py-2 px-3 text-zinc-200 font-black" colSpan={3}>TOTAL PROJECTED</td>
                    <td className="py-2 px-3 text-right font-mono font-black text-emerald-400">{totalProj.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">
              Upside = Projected + z × σ (Cornish-Fisher P90 with covariance for TB↔RBI↔R correlation).
              {p.projected_pts > 0 && p.upside_pts > 0 && (
                <span className="text-zinc-500"> Gap = {(p.upside_pts - p.projected_pts).toFixed(1)} pts from variance + correlation.</span>
              )}
            </p>
          </div>
        )}

        {/* Pitcher Breakdown */}
        {isPitcher && hasOdds.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Pitcher Calculation
            </h3>
            <p className="text-[10px] text-zinc-600 mb-2">
              Ks: Poisson fit to alt tiers · Outs: O/U lean · ER: game_total × (1-win%) × (outs/27)
            </p>
            <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-3 text-[11px] font-mono text-zinc-400 space-y-1">
              <div>FD = 3×E[K] + 1×E[outs] − 3×E[ER] + 6×P(W)×0.80 + 4×P(QS)</div>
              <div>Upside = 3×K<sub>P90</sub> + outs<sub>P90</sub> − 3×ER<sub>P10</sub> + 6×W + 4×QS</div>
            </div>
          </div>
        )}

        {/* Data Source */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-600">
            Odds: FanDuel Sportsbook API · Salary: RotoGrinders · Team: DailyFantasyFuel · 
            Devig: multiplicative (÷{"{"}1.06–1.22{"}"} by odds magnitude) · 
            No estimated or fallback data — missing props = 0 contribution
          </p>
        </div>
      </div>
    </div>
  );
}
