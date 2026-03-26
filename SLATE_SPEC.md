# FD MLB Optimizer - Slate Selection & DFF-Style Redesign

## Current State
- Homepage at src/app/page.tsx shows all players in one list
- No slate selection - just loads "main" slate from Supabase
- Import via /api/import-slate scrapes DFF + RG + FanDuel props
- Dark theme, Tailwind CSS v4, Next.js 16, framer-motion

## What DFF Has (our model)
DFF's projections page (dailyfantasyfuel.com/mlb/projections/fanduel) has:
1. **Date tabs** - row of dates across top (e.g., Tue Oct 28, Wed Oct 29, etc.)
2. **Slate selector dropdown** with sections:
   - "Classic" slates: "11 Games · All Day / THU 1:15PM ET", "9 Games · Main / THU 1:15PM ET", "6 Games · Late / THU 3:05PM ET", "2 Games · After Hours / THU 8:30PM ET"
   - "Showdown" slates: individual games like "WSH @ CHC / THU 2:20PM ET"
3. **Platform toggle** - DraftKings vs FanDuel buttons
4. **Filters bar**: Teams dropdown, Positions dropdown, + More Filters, Search box
5. **Player table columns**: POS, NAME (with handedness), SALARY, START (YES/EXP.), TEAM, OPP, ORDER (batting order #), FD FP (projected), VALUE (pts/salary), O/U (game over/under), TM PTS (team implied total)
6. **CSV export** button
7. "Load All Players" button at bottom

## What We Need to Build

### Phase 1: Slate Infrastructure
We need to support FanDuel's actual slate structure. FanDuel has multiple slates per day:
- **Main** (all games, usually 1:15 PM ET lock)
- **Early** (afternoon games only)
- **Late/Night** (evening games only)
- **After Hours** (late night West Coast)
- **Turbo** (shortened slates)

For now, we should:
1. Add a `slate_id` concept properly - currently it's always "main"
2. Scrape the actual FanDuel slate list from their contest API
3. Let users select which slate they want to optimize for
4. Filter players to only those in the selected slate

### Phase 2: Homepage Redesign (DFF-style)

**Header Section:**
- App title "⚾ FD MLB Optimizer"  
- Slate selector: dropdown showing available slates with game count and lock time
- Date selector: just show "Today" with the date, no need for multi-day yet
- "Import / Refresh" button that triggers the server-side import

**Filter Bar:**
- Position tabs: ALL, P, C, 1B, 2B, 3B, SS, OF (already exists, keep it)
- Team filter dropdown (multi-select)
- Search box for player names
- Sort by: Projected, Upside, Salary, Value, Name

**Player Table (the main event):**
Columns to show:
| Column | Description | Source |
|--------|-------------|--------|
| POS | Position (P, C, 1B, etc.) | DFF/RG |
| NAME | Player name + handedness (R/L/S) | DFF |
| SALARY | FanDuel salary ($X.Xk format) | RG |
| TEAM | 3-letter abbreviation | DFF/RG |
| OPP | Opponent team | DFF/RG |
| ORDER | Batting order position (1-9) or SP | DFF (parse from lineup data) |
| PROJ | Our projected FD points | scoring.ts v2 |
| UPSIDE | Our upside/ceiling FD points | scoring.ts v2 |
| VALUE | upside / (salary/1000) | computed |
| O/U | Game over/under | FanDuel API |
| IMP | Implied team total (O/U × win_prob) | computed |

**Row styling:**
- Pitchers in slightly different shade/section at top
- Batters below, sorted by upside (default) or projected
- Highlighted rows for confirmed starters (batting order known)
- Subtle team color indicator (optional, stretch goal)

**Mobile responsive:**
- On mobile, hide ORDER, O/U, IMP columns
- Sticky header
- Horizontal scroll for the table if needed

### Phase 3: Data Additions
We need these new fields in the players table and import pipeline:
- `batting_order` (integer 1-9, null for pitchers or unknowns)
- `handedness` (L/R/S)  
- `confirmed_starter` (boolean - is lineup confirmed?)
- `game_ou` (game over/under line)
- `implied_total` (team implied run total)

DFF already shows batting order and handedness - we just need to parse them.
For game O/U and implied totals, we can get these from the FanDuel API game-level markets.

### Stack
- Next.js 16.2.1, TypeScript, Tailwind CSS v4
- Dark theme (zinc-900/950 backgrounds, emerald/teal accents)
- Framer Motion for animations
- Supabase for data
- Keep the existing BottomNav component

### Files to modify:
1. `src/app/page.tsx` - Complete rewrite of the homepage
2. `src/lib/supabase.ts` - Add new Player fields
3. `src/app/api/import-slate/route.ts` - Parse batting order, handedness, game O/U from data sources
4. `scripts/import-with-salaries.cjs` - Same additions for server-side script

### Important constraints:
- FanDuel only, no DraftKings toggle needed
- Dark theme throughout
- Mobile-first responsive
- No auth needed
- Keep existing /lineup and /players/add pages working
- The import should still work via server-side script (scripts/import-with-salaries.cjs) for the actual data load
- The /api/import-slate route is the API fallback
