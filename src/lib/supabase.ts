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
  hits_ou: number | null;       // hits o/u line
  hrs_ou: number | null;        // HR o/u line
  rbis_ou: number | null;       // RBI o/u line
  runs_ou: number | null;       // runs o/u line
  walks_ou: number | null;      // walks o/u line
  sbs_ou: number | null;        // stolen bases o/u line
  // Pitcher props
  ks_ou: number | null;         // strikeouts o/u line
  outs_ou: number | null;       // outs recorded o/u line
  earned_runs_ou: number | null; // earned runs o/u line
  win_prob: number | null;      // win probability %
  qs_prob: number | null;       // quality start probability %
  // Computed
  projected_pts: number;
  upside_pts: number;
  pts_per_k: number;            // points per $1k salary
  slate_id: string;
  created_at: string;
}

export interface Slate {
  id: string;
  name: string;
  date: string;
  created_at: string;
}
