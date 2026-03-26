# FD MLB Optimizer - Coding Agent Instructions

## Stack
- Next.js 16.2.1, TypeScript, Tailwind CSS v4 (NOT v3 - use @import "tailwindcss" not @tailwind)
- Dark theme: zinc-900/950 backgrounds, emerald/teal/blue accents
- Framer Motion for animations
- Supabase for data storage
- Deployed on Vercel

## Key Files
- `src/app/page.tsx` - Homepage (player table)
- `src/app/lineup/page.tsx` - Lineup optimizer page
- `src/app/api/import-slate/route.ts` - API route for importing
- `src/lib/scoring.ts` - Scoring engine + constants (SALARY_CAP, STACK_FRAMEWORKS, etc.)
- `src/lib/optimizer.ts` - Branch-and-bound lineup optimizer
- `src/lib/supabase.ts` - Supabase client + Player type
- `src/components/BottomNav.tsx` - Bottom navigation
- `scripts/import-with-salaries.cjs` - Server-side import script
- `scripts/scoring.cjs` - CommonJS scoring engine

## Design System
- Background: zinc-950 (page), zinc-900/80 (cards), zinc-800/50 (table rows)
- Borders: zinc-700/50 or colored/30 for accent
- Accent colors: emerald-400/500 (primary), blue-400/500, amber/orange for warnings
- Glassmorphism: backdrop-blur-xl, bg-white/5
- Font: system default, font-bold for headers
- Mobile-first: max-w-2xl mx-auto on most pages

## Constraints
- FanDuel MLB only (no DraftKings)
- No authentication
- Don't break existing /lineup page functionality
- Keep BottomNav component
- All player data comes from Supabase `players` table
