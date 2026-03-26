import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export type Position = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "OF" | "UTIL";

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  salary: number;
  // Hits tiered
  hit_odds: number | null;       // to record a hit
  hits_2plus: number | null;
  hits_3plus: number | null;
  hits_4plus: number | null;
  // Hit types
  single_odds: number | null;
  double_odds: number | null;
  triple_odds: number | null;
  // HRs
  hr_odds: number | null;
  hr_2plus: number | null;
  // Total bases tiered
  tb_2plus: number | null;
  tb_3plus: number | null;
  tb_4plus: number | null;
  tb_5plus: number | null;
  // RBIs tiered
  rbi_odds: number | null;
  rbis_2plus: number | null;
  rbis_3plus: number | null;
  rbis_4plus: number | null;
  // Runs tiered
  run_odds: number | null;
  runs_2plus: number | null;
  runs_3plus: number | null;
  // SBs
  sb_odds: number | null;
  sbs_2plus: number | null;
  // Hits+Runs+RBIs combo
  hrr_1plus: number | null;
  hrr_2plus: number | null;
  hrr_3plus: number | null;
  hrr_4plus: number | null;
  // Pitcher: Ks
  ks_line: number | null;
  ks_over_odds: number | null;
  ks_alt_3plus: number | null;
  ks_alt_4plus: number | null;
  ks_alt_5plus: number | null;
  ks_alt_6plus: number | null;
  ks_alt_7plus: number | null;
  ks_alt_8plus: number | null;
  ks_alt_9plus: number | null;
  ks_alt_10plus: number | null;
  // Pitcher: Outs
  outs_line: number | null;
  outs_over_odds: number | null;
  // Moneyline (for win prob)
  win_odds: number | null;
  // Computed
  projected_pts: number;
  upside_pts: number;
  pts_per_k: number;
  slate_id: string;
  created_at: string;
}
