import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("slates")
      .select("*")
      .eq("date", today)
      .order("games", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const slates = (data || []).map((s: Record<string, unknown>) => ({
      id: s.id,
      label: s.label,
      lockTime: s.lock_time,
      games: s.games,
      teams: s.teams || [],
      type: s.type,
    }));

    return NextResponse.json({ slates, source: "supabase" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
