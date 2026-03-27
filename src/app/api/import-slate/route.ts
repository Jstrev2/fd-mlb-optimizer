import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST: Create an import job
export async function POST() {
  // Check if there's already a running job
  const { data: running } = await supabase
    .from("import_jobs")
    .select("id, status, created_at")
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1);

  if (running && running.length > 0) {
    return NextResponse.json({ status: "already_running", jobId: running[0].id });
  }

  // Create new job
  const { data, error } = await supabase
    .from("import_jobs")
    .insert({ status: "pending" })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "queued", jobId: data.id });
}

// GET: Check latest job status
export async function GET() {
  const { data } = await supabase
    .from("import_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    return NextResponse.json({ status: "no_jobs" });
  }

  return NextResponse.json({
    jobId: data.id,
    status: data.status,
    result: data.result,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
}
