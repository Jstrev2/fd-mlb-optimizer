import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ParsedPlayer {
  name: string;
  team: string;
  position: string;
  salary: number;
  projected_pts: number;
  opponent: string;
}

function parseDFFText(text: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];

  // Pitcher regex (no batting order)
  const pitcherRegex = /(?:^|\n)\s*P\s*\n\s*([\w][\w\s.'-]+?)\s*(?:DTD\s*)?•\s*\([LRS]\)\s*\n\s*\$([\d.]+)k\s*\n\s*(?:YES|EXP\.)\s*\n\s*(\w{2,3})\s*\n\s*(\w{2,3})\s*\n\s*([\d.]+)/gm;

  let match;
  while ((match = pitcherRegex.exec(text)) !== null) {
    players.push({
      name: match[1].trim(),
      position: "P",
      salary: Math.round(parseFloat(match[2]) * 1000),
      team: match[3],
      opponent: match[4],
      projected_pts: parseFloat(match[5]) || 0,
    });
  }

  // Batter regex (has batting order number)
  const batterRegex = /(?:^|\n)\s*(C(?:\/OF)?|1B(?:\/1B)?|2B(?:\/(?:SS|OF|2B))?|3B(?:\/(?:2B|3B))?|SS(?:\/SS)?|OF(?:\/OF)?)\s*\n\s*([\w][\w\s.'-]+?)\s*(?:DTD\s*)?•\s*\([LRS]\)\s*\n\s*\$([\d.]+)k\s*\n\s*(?:YES|EXP\.)\s*\n\s*(\w{2,3})\s*\n\s*(\w{2,3})\s*\n\s*\d+\s*(?:✓)?\s*\n\s*([\d.]+)/gm;

  while ((match = batterRegex.exec(text)) !== null) {
    const rawPos = match[1];
    const position = rawPos.split("/")[0];
    // Map C/OF → C, but keep C as C
    players.push({
      name: match[2].trim(),
      position,
      salary: Math.round(parseFloat(match[3]) * 1000),
      team: match[4],
      opponent: match[5],
      projected_pts: parseFloat(match[6]) || 0,
    });
  }

  return players;
}

export async function POST() {
  try {
    const res = await fetch("https://www.dailyfantasyfuel.com/mlb/projections/fanduel", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();

    // Strip HTML to text
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n");

    const players = parseDFFText(textContent);

    if (players.length === 0) {
      return NextResponse.json({
        error: "No players parsed. The site structure may have changed.",
        textSample: textContent.substring(0, 3000),
      }, { status: 400 });
    }

    // Clear existing
    await supabase.from("players").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // Insert with projected + rough upside
    const inserts = players.map((p) => ({
      name: p.name,
      team: p.team,
      position: p.position,
      salary: p.salary,
      projected_pts: p.projected_pts,
      upside_pts: Math.round(p.projected_pts * 1.3 * 10) / 10,
      pts_per_k: Math.round((p.projected_pts / (p.salary / 1000)) * 10) / 10,
      slate_id: "main",
    }));

    const { data, error } = await supabase.from("players").insert(inserts).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      imported: data?.length || 0,
      pitchers: players.filter((p) => p.position === "P").length,
      batters: players.filter((p) => p.position !== "P").length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
