#!/usr/bin/env node
/**
 * VPS Job Runner for FD MLB DFS Optimizer
 * Polls Supabase import_jobs table for pending jobs and runs the pipeline.
 * No HTTP server needed — communicates entirely through Supabase.
 */
const { execFile } = require('child_process');
const path = require('path');

const SUPABASE_URL = 'https://udwafzawzeaoteghfwjq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkd2FmemF3emVhb3RlZ2hmd2pxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM4Mjc1MCwiZXhwIjoyMDg5OTU4NzUwfQ.dbO_BZfeb6X2cBbPyr6cyrJC_SRwSC_Qr9ikn1W1_nc';
const SCRIPTS_DIR = __dirname;
const POLL_INTERVAL = 5000; // 5 seconds

const headers = {
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'apikey': SUPABASE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function updateJob(jobId, status, result = null) {
  const body = { status, updated_at: new Date().toISOString() };
  if (result) body.result = result;
  await fetch(`${SUPABASE_URL}/rest/v1/import_jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

async function runImport(jobId) {
  console.log(`[${new Date().toISOString()}] Running import for job ${jobId}...`);
  await updateJob(jobId, 'running');

  const slatesScript = path.join(SCRIPTS_DIR, 'scrape-slates.cjs');
  const importScript = path.join(SCRIPTS_DIR, 'import-with-salaries.cjs');

  return new Promise((resolve) => {
    // Step 1: Slates
    execFile('node', [slatesScript], { timeout: 60000, cwd: path.join(SCRIPTS_DIR, '..') }, (err1, stdout1, stderr1) => {
      console.log(stdout1);
      if (err1) console.error('Slates error:', stderr1);

      // Step 2: Import
      execFile('node', [importScript], { timeout: 180000, cwd: path.join(SCRIPTS_DIR, '..') }, async (err2, stdout2, stderr2) => {
        console.log(stdout2);
        if (err2) console.error('Import error:', stderr2);

        const output = (stdout1 + '\n' + stdout2).trim();
        const playerMatch = output.match(/✅\s*(\d+)\s*players/);
        const propMatch = output.match(/(\d+)\s*w\/props/);
        const slateMatch = output.match(/(\d+)\s*slates saved/);
        const creditMatch = output.match(/credits remaining:\s*(\S+)/i);

        const result = {
          success: !err2,
          completedAt: new Date().toISOString(),
          players: playerMatch ? parseInt(playerMatch[1]) : 0,
          withProps: propMatch ? parseInt(propMatch[1]) : 0,
          slates: slateMatch ? parseInt(slateMatch[1]) : 0,
          creditsRemaining: creditMatch ? creditMatch[1] : null,
          error: err2 ? (stderr2 || '').substring(0, 300) : null,
        };

        await updateJob(jobId, err2 ? 'error' : 'done', result);
        console.log(`[${result.completedAt}] Import complete:`, result);
        resolve(result);
      });
    });
  });
}

let running = false;

async function poll() {
  if (running) return;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/import_jobs?status=eq.pending&order=created_at.asc&limit=1`,
      { headers }
    );
    const jobs = await res.json();

    if (jobs.length > 0) {
      running = true;
      await runImport(jobs[0].id);
      running = false;
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

console.log(`FD MLB Optimizer Job Runner started (polling every ${POLL_INTERVAL / 1000}s)`);
setInterval(poll, POLL_INTERVAL);
poll(); // immediate first check
