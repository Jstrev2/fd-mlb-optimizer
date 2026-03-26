/**
 * FanDuel MLB DFS Scoring Engine v2 (CommonJS)
 * Vegas odds → devigged probs → E[X] + variance → projected & upside
 */

function impliedProb(odds) {
  if (!odds) return 0;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function devigOneSided(odds) {
  if (!odds) return 0;
  const raw = impliedProb(odds);
  let vigDivisor;
  if (odds < -300) vigDivisor = 1.06;
  else if (odds < -150) vigDivisor = 1.10;
  else if (odds < 0) vigDivisor = 1.12;
  else if (odds <= 200) vigDivisor = 1.15;
  else if (odds <= 500) vigDivisor = 1.18;
  else vigDivisor = 1.22;
  return Math.min(raw / vigDivisor, 0.99);
}

function devigTwoSided(overOdds, underOdds) {
  const rawOver = impliedProb(overOdds);
  const rawUnder = impliedProb(underOdds);
  const total = rawOver + rawUnder;
  if (total === 0) return { overProb: 0.5, underProb: 0.5 };
  return { overProb: rawOver / total, underProb: rawUnder / total };
}

function statMoments(tiers) {
  const probs = [];
  for (const t of tiers) {
    if (t.odds !== null && t.odds !== undefined && t.odds !== 0) {
      probs.push({ k: t.k, p: devigOneSided(t.odds) });
    }
  }
  if (probs.length === 0) return { mean: 0, variance: 0, skewness: 0 };

  probs.sort((a, b) => a.k - b.k);

  for (let i = probs.length - 2; i >= 0; i--) {
    if (probs[i].p < probs[i + 1].p) {
      const avg = (probs[i].p + probs[i + 1].p) / 2;
      probs[i].p = avg;
      probs[i + 1].p = avg;
    }
  }

  const mean = probs.reduce((s, t) => s + t.p, 0);

  const maxK = probs[probs.length - 1].k;
  const lowestK = probs[0].k;
  const pmf = [];

  const pBelow = 1 - probs[0].p;
  if (lowestK <= 1) {
    pmf.push({ k: 0, p: pBelow });
  } else {
    pmf.push({ k: 0, p: pBelow * 0.5 });
    for (let j = 1; j < lowestK; j++) {
      pmf.push({ k: j, p: pBelow * 0.5 / (lowestK - 1) });
    }
  }

  for (let i = 0; i < probs.length; i++) {
    const pk = probs[i].p;
    const pkNext = i + 1 < probs.length ? probs[i + 1].p : 0;
    pmf.push({ k: probs[i].k, p: pk - pkNext });
  }

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

function calcB(p) {
  if (!p.hit_odds && !p.tb_2plus && !p.rbi_odds && !p.run_odds) return { projected: 0, upside: 0 };

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
  const projected = 3 * tb.mean + 3.5 * rbi.mean + 3.2 * run.mean + 3 * expBB + 6 * sb.mean;

  // Variance with covariance
  const varIndep = 9 * tb.variance + 12.25 * rbi.variance + 10.24 * run.variance
                 + 9 * 0.23 + 36 * sb.variance;

  const sdTB = Math.sqrt(tb.variance);
  const sdRBI = Math.sqrt(rbi.variance);
  const sdR = Math.sqrt(run.variance);

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

function fitPoissonLambda(tiers) {
  if (tiers.length === 0) return 5;
  function logFact(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
  function poisCumGe(k, lam) {
    let cdf = 0;
    for (let j = 0; j < k; j++) cdf += Math.exp(-lam + j * Math.log(lam) - logFact(j));
    return 1 - cdf;
  }
  let best = 5, bestErr = Infinity;
  for (let lam = 2.0; lam <= 14.0; lam += 0.1) {
    let err = 0;
    for (const t of tiers) err += (poisCumGe(t.k, lam) - t.prob) ** 2;
    if (err < bestErr) { bestErr = err; best = lam; }
  }
  return Math.round(best * 10) / 10;
}

function poissonP90(lambda) {
  let cdf = 0;
  for (let k = 0; k <= 30; k++) {
    let logP = -lambda;
    for (let j = 1; j <= k; j++) logP += Math.log(lambda / j);
    cdf += Math.exp(logP);
    if (cdf >= 0.90) return k;
  }
  return Math.ceil(lambda + 1.28 * Math.sqrt(lambda));
}

function erf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, pp = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + pp * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function calcP(p) {
  const kTiers = [];
  const altKs = [[3,p.ks_alt_3plus],[4,p.ks_alt_4plus],[5,p.ks_alt_5plus],
    [6,p.ks_alt_6plus],[7,p.ks_alt_7plus],[8,p.ks_alt_8plus],
    [9,p.ks_alt_9plus],[10,p.ks_alt_10plus]];
  for (const [k, odds] of altKs) {
    if (odds) kTiers.push({ k, prob: devigOneSided(odds) });
  }

  let expectedKs, kP90;
  if (kTiers.length >= 3) {
    const lambda = fitPoissonLambda(kTiers);
    expectedKs = lambda;
    kP90 = poissonP90(lambda);
  } else if (p.ks_line && p.ks_over_odds) {
    const overProb = devigOneSided(p.ks_over_odds);
    expectedKs = p.ks_line + (overProb - 0.5) * 1.5;
    kP90 = Math.ceil(expectedKs + 1.28 * Math.sqrt(expectedKs));
  } else {
    expectedKs = 5;
    kP90 = 8;
  }

  let expectedOuts = 16;
  if (p.outs_line) {
    const overProb = p.outs_over_odds ? devigOneSided(p.outs_over_odds) : 0.5;
    expectedOuts = p.outs_line + (overProb - 0.5) * 2;
  }
  const outsSD = 4.5;
  const outsP90 = Math.min(expectedOuts + 1.28 * outsSD, 27);

  const winProb = p.win_odds ? devigOneSided(p.win_odds) : 0.45;
  const pitcherWinProb = winProb * 0.80;
  const gameTotal = p.game_total || 8.5;
  const expectedER = gameTotal * (1 - winProb) * (expectedOuts / 27);
  const erP10 = Math.max(0, expectedER - 1.28 * 1.5);

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

  const projected = expectedKs * 3 + expectedOuts * 1 + expectedER * -3 + pitcherWinProb * 6 + qsProb * 4;

  const upsideWin = winProb >= 0.40 ? 1 : 0;
  const upsideQS = (outsP90 >= 18 && erP10 <= 3) ? 1 : 0;
  const upside = kP90 * 3 + outsP90 * 1 + erP10 * -3 + upsideWin * 6 + upsideQS * 4;

  return {
    projected: Math.round(projected * 10) / 10,
    upside: Math.round(upside * 10) / 10,
  };
}

module.exports = { calcB, calcP, devigOneSided, impliedProb };
