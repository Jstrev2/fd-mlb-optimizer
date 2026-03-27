import { NextResponse } from "next/server";

const VPS_API = "http://178.156.255.228:3847";

export const runtime = "edge";
export const maxDuration = 120;

export async function POST() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${VPS_API}/api/import`, {
      method: "POST",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Cannot reach import server: " + String(e) },
      { status: 502 }
    );
  }
}

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${VPS_API}/api/status`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Cannot reach import server: " + String(e) },
      { status: 502 }
    );
  }
}
