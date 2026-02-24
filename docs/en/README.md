# Diary

A **diary plugin** for Obsidian. Provides yearly and monthly planners.

## Features

- **Yearly planner**: 12-month × 31-day grid calendar
- **Monthly planner**: Single-month view with pinch zoom (mobile)
- **Date notes**: Click a cell to open or create that date note
- **Range notes**: Drag to select a date range and create a range note
- **Plan notes**: Yearly/monthly plan note panels (create or open summary notes for the period)
- **Holidays**: Display public holidays for selected countries
- **i18n**: English and Korean UI
- **Mobile support**: Touch drag, pinch zoom (monthly), bottom padding and cell width settings

## Usage

### Opening planners

- **Sidebar**: **calendar-range** icon → yearly planner, **calendar-days** icon → monthly planner
- **Command palette**: "Open yearly planner" / "Open monthly planner"

### Date and range notes

- **Date note**: Click a date cell to open that date's note (creates it if missing)
- **Range note**: Drag across date cells to select a range, then release to open the create range note modal
- **Add file** button: Create a single date or range note directly

### Navigation

- **Yearly**: ◀/▶ previous/next year, "Today" for current year, click year to change
- **Monthly**: ◀/▶ previous/next month, "Today" for current month, click month/year to change

## Settings

| Setting | Description |
|---------|-------------|
| **Language** | UI language (English / 한국어) |
| **Planner folder** | Folder for date and range notes (default: `Planner`) |
| **Date format** | Filename date format (default: `YYYY-MM-DD`) |
| **Show holidays** | Show public holidays in the planner |
| **Holiday country** | Country for holidays (South Korea, US, Japan, China, etc.) |
| **Mobile bottom padding** | Bottom padding (rem) on mobile so the table is not covered by the tools tab |
| **Mobile cell width** | Width (rem) of month cells on mobile |

## File formats

- **Single date**: `{Planner folder}/2026-02-12.md`
- **Range note**: `{Planner folder}/2026-02-01_to_2026-02-07.md` (frontmatter includes `date_start`, `date_end`)
- **Plan notes**: Yearly `{Planner folder}/{year}.md`, monthly `{Planner folder}/{year}-{month}.md` (summary notes for the period)

## Beta testing

- **Option A (manual)**: Download a Pre-release or Draft from [Releases](https://github.com/POBSIZ/obsidian-diary/releases) and install manually
- **Option B (BRAT)**: Install [BRAT plugin](https://obsidian.md/plugins?id=obsidian42-brat) → **Add beta plugin** → add `POBSIZ/obsidian-diary` repo URL

## Manual installation

1. Download the latest release from [Releases](https://github.com/POBSIZ/obsidian-diary/releases)
2. Copy `main.js`, `styles.css`, and `manifest.json` to `Vault/.obsidian/plugins/diary/`
3. Enable "Diary" in **Settings → Community plugins**

## Development

- Node.js 18+ (LTS recommended)
- `npm install` → `npm run dev` (watch build)
- `npm run build` (production build)
- `npm run lint` (ESLint)

## License

See LICENSE file.
