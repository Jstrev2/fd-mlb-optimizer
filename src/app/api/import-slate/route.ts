import { NextResponse } from "next/server";

const VPS_API = "http://178.156.255.228:3847";

export async function POST() {
  try {
    const res = await fetch(`${VPS_API}/api/import`, { method: "POST" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Cannot reach import server: " + String(e) }, { status: 502 });
  }
}

export async function GET() {
  try {
    const res = await fetch(`${VPS_API}/api/status`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: "Cannot reach import server: " + String(e) }, { status: 502 });
  }
}
