# Diary

A **diary plugin** for Obsidian. Provides yearly and monthly planners with date notes, range notes, and holiday support.

📖 [English](docs/en/README.md) | [한국어](docs/ko/README.md)

## Features

### Planners

- **Yearly planner**: 12-month × 31-day grid calendar. See the whole year at a glance.
- **Monthly planner**: Single-month view with week rows. Pinch zoom on mobile for comfortable reading.

### Notes

- **Date notes**: Click a cell to open or create that date's note. Files are created on demand.
- **Range notes**: Drag across date cells to select a range, then release to open the create modal. Range notes span multiple days and appear as bars in the grid.
- **Plan notes**: Yearly (`{year}.md`) and monthly (`{year}-{month}.md`) summary panels. Create or open period notes from the planner sidebar.

### Visual & interaction

- **Color chips**: Assign colors to notes via frontmatter `color`. Presets and custom hex/rgb in create modal.
- **Chip drag-and-drop** (desktop): Drag a date or range chip to another cell to move it. Duration is preserved for range notes.
- **Range highlight**: Hover over a range bar to highlight all cells it spans.
- **Holidays**: Public holidays for selected countries. Click a holiday badge to see its name(s).

### Other

- **i18n**: English and Korean UI.
- **Mobile support**: Touch drag for range selection, pinch zoom (monthly), bottom padding and cell width settings.

## Usage

### Opening planners

- **Sidebar**: **calendar-range** icon → yearly planner, **calendar-days** icon → monthly planner
- **Command palette**: "Open yearly planner" / "Open monthly planner"

### Date and range notes

- **Date note**: Click a date cell to open that date's note (creates it if missing).
- **Range note**: Drag across date cells to select a range, then release to open the create range note modal.
- **Add file** button: Open the create modal directly (single date or range).

### File options (click a chip or bar)

- **Open**: Open the note in the editor.
- **Change date**: Edit start/end dates (range) or move a single-date note.
- **Color**: Change chip color via presets or color picker.
- **Delete**: Move the file to trash.

### Navigation

- **Yearly**: ◀/▶ previous/next year, "Today" for current year, click year to enter a specific year.
- **Monthly**: ◀/▶ previous/next month, "Today" for current month, click month/year to jump.

## Settings

| Setting | Description |
|---------|-------------|
| **Language** | UI language (English / 한국어) |
| **Planner folder** | Folder for date and range notes (default: `Planner`) |
| **Date format** | Filename date format (default: `YYYY-MM-DD`) |
| **Show holidays** | Show public holidays in the planner |
| **Holiday country** | Country for holidays (South Korea, US, Japan, China, UK, Germany, France, Australia, Canada, Taiwan) |
| **Mobile bottom padding** | Bottom padding (rem) on mobile so the table is not covered by the tools tab |
| **Mobile cell width** | Width (rem) of month cells on mobile |

## File formats

- **Single date**: `{Planner folder}/2026-02-12.md` or `2026-02-12-meeting.md` (suffix becomes title)
- **Range note**: `{Planner folder}/2026-02-01--2026-02-07.md` or `2026-02-01--2026-02-07-vacation.md` (frontmatter: `date_start`, `date_end`, optional `color`)
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

## PR guide

- PR 작성 시 `.github/pull_request_template.md` 체크리스트를 사용하세요.
- UI 변경은 `design.md` 원칙(테마 우선, 기능 우선)과 `styles.css` 공통 토큰을 우선 적용하세요.
- Planner 관련 UI 변경은 Yearly/Monthly/Monthly List, 드래그/선택/클립보드 상호작용까지 확인 후 PR을 여세요.

## License

See LICENSE file.
