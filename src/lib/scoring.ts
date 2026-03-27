import { Player } from "./supabase";

// === FANDUEL CONSTRAINTS ===
export const SALARY_CAP = 35000;
export const MAX_PER_TEAM = 4;

export interface LineupSlot {
  position: string;
  player: Player | null;
}

// FanDuel MLB rules: max 4 batters from same team (5th allowed only if a pitcher).
// Stacks here are BATTER-only — pitcher is always from a separate team.
// Max batter slots = 8 (P slot excluded). All stacks must sum ≤ 8, max tier = 4.
export const STACK_FRAMEWORKS: { label: string; stacks: number[] }[] = [
  { label: "No Stack",   stacks: [] },
  { label: "4×4",       stacks: [4, 4] },       // 8 batters, 2 teams
  { label: "4×3×1",     stacks: [4, 3, 1] },    // 8 batters, 3 teams
  { label: "4×3",       stacks: [4, 3] },        // 7 batters
  { label: "4×2×2",     stacks: [4, 2, 2] },    // 8 batters, 3 teams
  { label: "3×3×2",     stacks: [3, 3, 2] },    // 8 batters, 3 teams
  { label: "3×3×1×1",   stacks: [3, 3, 1, 1] },// 8 batters, 4 teams
  { label: "3×2×2×1",   stacks: [3, 2, 2, 1] },// 8 batters, 4 teams
];

export interface OptimizerConfig {
  mode: "upside" | "projected";
  excludedTeams: Set<string>;
  stackFramework: number[];
}

// Legacy odds conversion (kept for backward compat)
export function oddsToProb(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

/**
 * FanDuel MLB DFS Scoring Engine v2
 * 
 * Math-first approach: Vegas prop odds → devigged probabilities → 
 * expected values + variance → projected & upside FD points.
 * 
 * Key formulas:
 * - E[X] = Σ P(X≥k) for k=1,2,3... (survival function identity)
 * - FD hitting pts = 3 × E[TB] (since each base = 3 FD pts)
 * - Projected = 3×E[TB] + 3.5×E[RBI] + 3.2×E[R] + 3×E[BB] + 6×E[SB]
 * - Upside = Projected + z_adj × σ (Cornish-Fisher skewness correction)
 * - Var[FD] includes covariance terms for TB↔RBI, TB↔R, R↔RBI
 */

// ============ DEVIGGING ============

function impliedProb(odds: number): number {
  if (!odds) return 0;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

/**
 * Devig one-sided prop. FD player prop overround is 15-25%.
 */
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

function devigTwoSided(overOdds: number, underOdds: number): { overProb: number; underProb: number } {
  const rawOver = impliedProb(overOdds);
  const rawUnder = impliedProb(underOdds);
  const total = rawOver + rawUnder;
  if (total === 0) return { overProb: 0.5, underProb: 0.5 };
  return { overProb: rawOver / total, underProb: rawUnder / total };
}

// ============ STAT MOMENTS FROM TIERS ============

interface TierOdds { odds: number | null; k: number; }

function statMoments(tiers: TierOdds[]): { mean: number; variance: number; skewness: number } {
  const probs: { k: number; p: number }[] = [];
  for (const t of tiers) {
    if (t.odds !== null && t.odds !== 0) {
      probs.push({ k: t.k, p: devigOneSided(t.odds) });
    }
  }
  if (probs.length === 0) return { mean: 0, variance: 0, skewness: 0 };

  probs.sort((a, b) => a.k - b.k);

  // Enforce monotonicity
  for (let i = probs.length - 2; i >= 0; i--) {
    if (probs[i].p < probs[i + 1].p) {
      const avg = (probs[i].p + probs[i + 1].p) / 2;
      probs[i].p = avg;
      probs[i + 1].p = avg;
    }
  }

  // E[X] = Σ P(X≥k)
  const mean = probs.reduce((s, t) => s + t.p, 0);

  // Build PMF for variance/skewness
  const maxK = probs[probs.length - 1].k;
  const lowestK = probs[0].k;
  const pmf: { k: number; p: number }[] = [];

  // Below lowest tier
  const pBelow = 1 - probs[0].p;
  if (lowestK <= 1) {
    pmf.push({ k: 0, p: pBelow });
  } else {
    pmf.push({ k: 0, p: pBelow * 0.5 });
    for (let j = 1; j < lowestK; j++) {
      pmf.push({ k: j, p: pBelow * 0.5 / (lowestK - 1) });
    }
  }

  // Each tier
  for (let i = 0; i < probs.length; i++) {
    const pk = probs[i].p;
    const pkNext = i + 1 < probs.length ? probs[i + 1].p : 0;
    pmf.push({ k: probs[i].k, p: pk - pkNext });
  }

  // Small tail beyond max tier
  const tailP = probs[probs.length - 1].p * 0.3;
  if (tailP > 0.005) {
    pmf[pmf.length - 1].p = Math.max(0, pmf[pmf.length - 1].p - tailP);
    pmf.push({ k: maxK + 1, p: tailP });
  }

  let ex2 = 0, ex3 = 0;
  for (const { k, p } of pmf) {
    ex2 += k * k * p;
    ex3 += k * k * k * p;
  }

  const variance = Math.max(0, ex2 - mean * mean);
  const sd = Math.sqrt(variance);
  const skewness = sd > 0.001 ? (ex3 - 3 * mean * variance - mean * mean * mean) / (sd * sd * sd) : 0;

  return { mean, variance, skewness };
}

// ============ BATTER SCORING ============

export interface BatterProps {
  hit_odds: number | null;
  hits_2plus: number | null;
  hits_3plus: number | null;
  hits_4plus: number | null;
  hr_odds: number | null;
  hr_2plus: number | null;
  tb_2plus: number | null;
  tb_3plus: number | null;
  tb_4plus: number | null;
  tb_5plus: number | null;
  rbi_odds: number | null;
  rbis_2plus: number | null;
  rbis_3plus: number | null;
  rbis_4plus: number | null;
  run_odds: number | null;
  runs_2plus: number | null;
  runs_3plus: number | null;
  sb_odds: number | null;
  sbs_2plus: number | null;
}

export function calcBatterPoints(p: BatterProps): { projected: number; upside: number } {
  if (!p.hit_odds && !p.tb_2plus && !p.rbi_odds && !p.run_odds) return { projected: 0, upside: 0 };

  // TB: P(TB≥1) ≈ P(Hit)
  const tb = statMoments([
    { k: 1, odds: p.hit_odds },
    { k: 2, odds: p.tb_2plus },
    { k: 3, odds: p.tb_3plus },
    { k: 4, odds: p.tb_4plus },
    { k: 5, odds: p.tb_5plus },
  ]);

  const rbi = statMoments([
    { k: 1, odds: p.rbi_odds },
    { k: 2, odds: p.rbis_2plus },
    { k: 3, odds: p.rbis_3plus },
    { k: 4, odds: p.rbis_4plus },
  ]);

  const run = statMoments([
    { k: 1, odds: p.run_odds },
    { k: 2, odds: p.runs_2plus },
    { k: 3, odds: p.runs_3plus },
  ]);

  const sb = statMoments([
    { k: 1, odds: p.sb_odds },
    { k: 2, odds: p.sbs_2plus },
  ]);

  const expBB = 0.35;

  // PROJECTED
  const projected = 3 * tb.mean + 3.5 * rbi.mean + 3.2 * run.mean + 3 * expBB + 6 * sb.mean;

  // UPSIDE via variance + covariance + Cornish-Fisher
  const varIndep = 9 * tb.variance + 12.25 * rbi.variance + 10.24 * run.variance
                 + 9 * 0.23 + 36 * sb.variance;

  const sdTB = Math.sqrt(tb.variance);
  const sdRBI = Math.sqrt(rbi.variance);
  const sdR = Math.sqrt(run.variance);

  // Correlations — stronger for power hitters
  let rhoTB_RBI = 0.50, rhoTB_R = 0.45, rhoR_RBI = 0.40;
  if (p.hr_odds) {
    const hrProb = devigOneSided(p.hr_odds);
    if (hrProb > 0.15) {
      const boost = Math.min((hrProb - 0.15) * 2, 0.15);
      rhoTB_RBI += boost;
      rhoTB_R += boost;
      rhoR_RBI += boost * 0.7;
    }
  }

  const varCov = 21 * rhoTB_RBI * sdTB * sdRBI
               + 19.2 * rhoTB_R * sdTB * sdR
               + 22.4 * rhoR_RBI * sdR * sdRBI;

  const totalVar = Math.max(0.01, varIndep + varCov);
  const sigma = Math.sqrt(totalVar);

  // Cornish-Fisher P90
  const weightedSkew = tb.variance > 0.01
    ? (27 * tb.skewness * Math.pow(tb.variance, 1.5)
       + 42.875 * rbi.skewness * Math.pow(rbi.variance, 1.5)
       + 32.768 * run.skewness * Math.pow(run.variance, 1.5))
      / Math.pow(totalVar, 1.5)
    : 0.8;

  const gamma = Math.max(0.3, Math.min(2.0, weightedSkew || 0.8));
  const z = 1.28;
  const zAdj = z + ((z * z - 1) / 6) * gamma;

  const upside = projected + zAdj * sigma;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}

// ============ PITCHER SCORING ============

export interface PitcherProps {
  ks_line: number | null;
  ks_over_odds: number | null;
  ks_under_odds?: number | null;
  ks_alt_3plus: number | null;
  ks_alt_4plus: number | null;
  ks_alt_5plus: number | null;
  ks_alt_6plus: number | null;
  ks_alt_7plus: number | null;
  ks_alt_8plus: number | null;
  ks_alt_9plus: number | null;
  ks_alt_10plus: number | null;
  outs_line: number | null;
  outs_over_odds: number | null;
  outs_under_odds?: number | null;
  win_odds: number | null;
  game_total?: number | null;
}

function fitPoissonLambda(tiers: { k: number; prob: number }[]): number {
  if (tiers.length === 0) return 5;

  function logFactorial(n: number): number {
    let s = 0;
    for (let i = 2; i <= n; i++) s += Math.log(i);
    return s;
  }

  function poissonCumGe(k: number, lambda: number): number {
    let cdf = 0;
    for (let j = 0; j < k; j++) {
      cdf += Math.exp(-lambda + j * Math.log(lambda) - logFactorial(j));
    }
    return 1 - cdf;
  }

  let bestLambda = 5, bestError = Infinity;
  for (let lambda = 2.0; lambda <= 14.0; lambda += 0.1) {
    let error = 0;
    for (const t of tiers) {
      const predicted = poissonCumGe(t.k, lambda);
      error += (predicted - t.prob) ** 2;
    }
    if (error < bestError) { bestError = error; bestLambda = lambda; }
  }
  return Math.round(bestLambda * 10) / 10;
}

function poissonP90(lambda: number): number {
  let cdf = 0;
  for (let k = 0; k <= 30; k++) {
    let logP = -lambda;
    for (let j = 1; j <= k; j++) logP += Math.log(lambda / j);
    cdf += Math.exp(logP);
    if (cdf >= 0.90) return k;
  }
  return Math.ceil(lambda + 1.28 * Math.sqrt(lambda));
}

function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, pp = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + pp * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function calcPitcherPoints(p: PitcherProps): { projected: number; upside: number } {
  // STRIKEOUTS — Poisson fit to alt tiers
  const kTiers: { k: number; prob: number }[] = [];
  const altKs: [number, number | null][] = [
    [3, p.ks_alt_3plus], [4, p.ks_alt_4plus], [5, p.ks_alt_5plus],
    [6, p.ks_alt_6plus], [7, p.ks_alt_7plus], [8, p.ks_alt_8plus],
    [9, p.ks_alt_9plus], [10, p.ks_alt_10plus],
  ];
  for (const [k, odds] of altKs) {
    if (odds) kTiers.push({ k, prob: devigOneSided(odds) });
  }

  let expectedKs: number, kP90: number;
  if (kTiers.length >= 3) {
    const lambda = fitPoissonLambda(kTiers);
    expectedKs = lambda;
    kP90 = poissonP90(lambda);
  } else if (p.ks_line && p.ks_over_odds) {
    const overProb = p.ks_under_odds
      ? devigTwoSided(p.ks_over_odds, p.ks_under_odds).overProb
      : devigOneSided(p.ks_over_odds);
    expectedKs = p.ks_line + (overProb - 0.5) * 1.5;
    kP90 = Math.ceil(expectedKs + 1.28 * Math.sqrt(expectedKs));
  } else {
    expectedKs = 5;
    kP90 = 8;
  }

  // OUTS RECORDED
  let expectedOuts = 16;
  if (p.outs_line) {
    if (p.outs_over_odds && p.outs_under_odds) {
      const { overProb } = devigTwoSided(p.outs_over_odds, p.outs_under_odds);
      expectedOuts = p.outs_line + (overProb - 0.5) * 2;
    } else if (p.outs_over_odds) {
      const overProb = devigOneSided(p.outs_over_odds);
      expectedOuts = p.outs_line + (overProb - 0.5) * 2;
    } else {
      expectedOuts = p.outs_line;
    }
  }
  const outsSD = 4.5;
  const outsP90 = Math.min(expectedOuts + 1.28 * outsSD, 27);

  // EARNED RUNS
  const winProb = p.win_odds ? devigOneSided(p.win_odds) : 0.45;
  const pitcherWinProb = winProb * 0.80;
  const gameTotal = p.game_total || 8.5;
  const expectedER = gameTotal * (1 - winProb) * (expectedOuts / 27);
  const erP10 = Math.max(0, expectedER - 1.28 * 1.5);

  // QUALITY START
  const pOuts18 = expectedOuts >= 18
    ? 0.5 + 0.5 * erf((expectedOuts - 18) / (outsSD * Math.SQRT2))
    : 0.5 - 0.5 * erf((18 - expectedOuts) / (outsSD * Math.SQRT2));
  let pER3 = 0;
  for (let k = 0; k <= 3; k++) {
    let logP = -expectedER;
    for (let j = 1; j <= k; j++) logP += Math.log(expectedER / j);
    pER3 += Math.exp(logP);
  }
  const qsProb = Math.min(0.85, pOuts18 * pER3 * 0.90);

  // PROJECTED
  const projected = expectedKs * 3 + expectedOuts * 1 + expectedER * -3 + pitcherWinProb * 6 + qsProb * 4;

  // UPSIDE (P90 scenario)
  const upsideWin = winProb >= 0.40 ? 1 : 0;
  const upsideQS = (outsP90 >= 18 && erP10 <= 3) ? 1 : 0;
  const upside = kP90 * 3 + outsP90 * 1 + erP10 * -3 + upsideWin * 6 + upsideQS * 4;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}
