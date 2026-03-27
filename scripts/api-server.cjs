#!/usr/bin/env node
/**
 * VPS API server for FD MLB DFS Optimizer
 * Exposes /api/import endpoint that runs the full pipeline
 * Runs on port 3847 (obscure, not guessable)
 */
const http = require('http');
const { execFile } = require('child_process');
const path = require('path');

const PORT = 3847;
const SCRIPTS_DIR = __dirname;

let importing = false;
let lastImport = null;
let lastResult = null;

const server = http.createServer((req, res) => {
  // CORS headers for Vercel app
  res.setHeader('Access-Control-Allow-Origin', 'https://fd-mlb-optimizer.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Status endpoint
  if (req.url === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      importing, 
      lastImport, 
      lastResult,
      uptime: process.uptime(),
    }));
    return;
  }

  // Import endpoint
  if (req.url === '/api/import' && req.method === 'POST') {
    if (importing) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Import already running', startedAt: lastImport }));
      return;
    }

    importing = true;
    lastImport = new Date().toISOString();
    lastResult = null;

    // Send immediate response
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'started', startedAt: lastImport }));

    // Run full pipeline in background
    const slatesScript = path.join(SCRIPTS_DIR, 'scrape-slates.cjs');
    const importScript = path.join(SCRIPTS_DIR, 'import-with-salaries.cjs');

    console.log(`[${lastImport}] Import started...`);

    // Step 1: Slates
    execFile('node', [slatesScript], { timeout: 60000 }, (err1, stdout1, stderr1) => {
      console.log(stdout1);
      if (err1) console.error('Slates error:', stderr1);

      // Step 2: Import players + props
      execFile('node', [importScript], { timeout: 120000 }, (err2, stdout2, stderr2) => {
        console.log(stdout2);
        if (err2) console.error('Import error:', stderr2);

        importing = false;
        const output = (stdout1 + '\n' + stdout2).trim();
        
        // Parse results from output
        const playerMatch = output.match(/✅\s*(\d+)\s*players/);
        const propMatch = output.match(/(\d+)\s*w\/props/);
        const slateMatch = output.match(/(\d+)\s*slates saved/);

        lastResult = {
          success: !err2,
          completedAt: new Date().toISOString(),
          players: playerMatch ? parseInt(playerMatch[1]) : 0,
          withProps: propMatch ? parseInt(propMatch[1]) : 0,
          slates: slateMatch ? parseInt(slateMatch[1]) : 0,
          error: err2 ? stderr2.substring(0, 200) : null,
        };

        console.log(`[${lastResult.completedAt}] Import complete:`, lastResult);
      });
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FD MLB Optimizer API running on port ${PORT}`);
});
