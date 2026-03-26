#!/bin/bash
# Full FD MLB DFS Import Pipeline
# Usage: ./scripts/full-import.sh
# 
# Steps:
# 1. Scrape FanDuel DFS slates from DFF → Supabase
# 2. Import players (DFF salaries + RG lineups + FD sportsbook odds) → score → Supabase
#
# Run this once before each slate locks to get fresh data.
# Can be re-run safely (clears and reloads).

set -e
cd "$(dirname "$0")/.."

echo "========================================="
echo "  FD MLB DFS Full Import Pipeline"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "========================================="
echo ""

echo "Step 1/2: Scraping FanDuel DFS slates from DFF..."
node scripts/scrape-slates.cjs
echo ""

echo "Step 2/2: Importing players + odds + scoring..."
node scripts/import-with-salaries.cjs
echo ""

echo "========================================="
echo "  ✅ Pipeline complete!"
echo "========================================="
