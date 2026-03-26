import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export type Position = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "OF" | "UTIL";

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  salary: number;
  // Batter props
  total_bases_line: number | null;
  total_bases_over_odds: number | null;
  total_bases_upside: number | null;
  total_bases_upside_odds: number | null;
  hits_line: number | null;
  hits_over_odds: number | null;
  hrs_line: number | null;
  hrs_over_odds: number | null;
  rbis_line: number | null;
  rbis_over_odds: number | null;
  runs_line: number | null;
  runs_over_odds: number | null;
  walks_line: number | null;
  walks_over_odds: number | null;
  sbs_line: number | null;
  sbs_over_odds: number | null;
  // Pitcher props
  ks_line: number | null;
  ks_over_odds: number | null;
  outs_line: number | null;
  outs_over_odds: number | null;
  earned_runs_line: number | null;
  earned_runs_under_odds: number | null;
  win_prob: number | null;
  qs_prob: number | null;
  // Computed
  projected_pts: number;
  upside_pts: number;
  pts_per_k: number;
  slate_id: string;
  created_at: string;
}
