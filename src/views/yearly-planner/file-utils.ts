import { App, TFile, TFolder } from "obsidian";
import { getDaysInMonth } from "../../utils/date";
import { parseRangeBasename, isDateInRange } from "../../utils/range";
import type { RangeRunPosition } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Returns all folder paths in the vault (sorted). Root folder "" is included. */
export function getAllFolderPaths(app: App): string[] {
	const paths: string[] = [];
	function collect(folder: TFolder): void {
		paths.push(folder.path);
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				collect(child);
			}
		}
	}
	const root = app.vault.getRoot();
	if (root) collect(root);
	return paths.sort((a, b) => a.localeCompare(b));
}

export function getFilePath(
	folder: string,
	year: number,
	month: number,
	day: number,
): string {
	const trimmed = (folder || "Planner").trim();
	const filename = `${year}-${pad(month)}-${pad(day)}.md`;
	return trimmed ? `${trimmed}/${filename}` : filename;
}

export function getYearNoteFilePath(folder: string, year: number): string {
	const trimmed = (folder || "Planner").trim();
	const filename = `${year}.md`;
	return trimmed ? `${trimmed}/${filename}` : filename;
}

export function getMonthNoteFilePath(
	folder: string,
	year: number,
	month: number,
): string {
	const trimmed = (folder || "Planner").trim();
	const filename = `${year}-${pad(month)}.md`;
	return trimmed ? `${trimmed}/${filename}` : filename;
}

export interface RangeForYear {
	file: TFile;
	start: string;
	end: string;
}

/** Returns all range files that intersect with the given year. */
export function getRangesForYear(app: App, year: number): RangeForYear[] {
	const yearStart = `${year}-01-01`;
	const yearEnd = `${year}-12-31`;
	const ranges: RangeForYear[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const parsed = parseRangeBasename(file.basename);
		if (!parsed) continue;
		if (parsed.end < yearStart || parsed.start > yearEnd) continue;
		ranges.push({
			file,
			start: parsed.start,
			end: parsed.end,
		});
	}
	ranges.sort((a, b) => a.start.localeCompare(b.start));
	return ranges;
}

/** Returns a map from range basename to lane index (0-based). Overlapping ranges get different lanes. */
export function getRangeLaneMap(ranges: RangeForYear[]): Map<string, number> {
	const map = new Map<string, number>();
	const laneEnds: string[] = []; // laneEnds[i] = latest end date of any range in lane i

	for (const r of ranges) {
		let lane = 0;
		while (lane < laneEnds.length && (laneEnds[lane] ?? "") >= r.start) {
			lane++;
		}
		if (lane === laneEnds.length) {
			laneEnds.push(r.end);
		} else {
			laneEnds[lane] = r.end;
		}
		map.set(r.file.basename, lane);
	}
	return map;
}

export function getRangeFilePath(
	folder: string,
	startYear: number,
	startMonth: number,
	startDay: number,
	endYear: number,
	endMonth: number,
	endDay: number,
): string {
	const trimmed = (folder || "Planner").trim();
	const startStr = `${startYear}-${pad(startMonth)}-${pad(startDay)}`;
	const endStr = `${endYear}-${pad(endMonth)}-${pad(endDay)}`;
	const filename = `${startStr}--${endStr}.md`;
	return trimmed ? `${trimmed}/${filename}` : filename;
}

export function getFilesForDate(
	app: App,
	year: number,
	month: number,
	day: number,
): {
	singleFiles: TFile[];
	rangeFiles: Array<{
		file: TFile;
		runPos: RangeRunPosition;
		isFirst: boolean;
	}>;
} {
	const dateStr = `${year}-${pad(month)}-${pad(day)}`;

	const singleFiles = app.vault.getMarkdownFiles().filter((file) => {
		return (
			file.basename === dateStr ||
			(file.basename.startsWith(`${dateStr}-`) &&
				!parseRangeBasename(file.basename))
		);
	});
	singleFiles.sort((a, b) =>
		a.basename.localeCompare(b.basename, undefined, { numeric: true }),
	);

	const rangeFiles: Array<{
		file: TFile;
		runPos: RangeRunPosition;
		isFirst: boolean;
	}> = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const parsed = parseRangeBasename(file.basename);
		if (!parsed || !isDateInRange(dateStr, parsed.start, parsed.end))
			continue;
		const runPos = getRangeRunPosition(
			year,
			month,
			day,
			parsed.start,
			parsed.end,
		);
		rangeFiles.push({
			file,
			runPos,
			isFirst: dateStr === parsed.start,
		});
	}

	/* Sort by start date ascending so later ranges render last (on top via z-index). */
	rangeFiles.sort((a, b) => {
		const aStart = parseRangeBasename(a.file.basename)?.start ?? "";
		const bStart = parseRangeBasename(b.file.basename)?.start ?? "";
		return aStart.localeCompare(bStart);
	});

	return { singleFiles, rangeFiles };
}

function getRangeRunPosition(
	year: number,
	month: number,
	day: number,
	start: string,
	end: string,
): RangeRunPosition {
	const daysInMonth = getDaysInMonth(year, month);
	const prevDay = day - 1;
	const nextDay = day + 1;
	const prevInRange =
		prevDay >= 1 &&
		isDateInRange(`${year}-${pad(month)}-${pad(prevDay)}`, start, end);
	const nextInRange =
		nextDay <= daysInMonth &&
		isDateInRange(`${year}-${pad(month)}-${pad(nextDay)}`, start, end);
	return {
		runStart: !prevInRange,
		runEnd: !nextInRange,
	};
}

function toStringSafe(val: unknown): string | null {
	if (typeof val === "string") return val;
	if (typeof val === "number" || typeof val === "boolean") return String(val);
	if (Array.isArray(val)) {
		const first: unknown = val[0];
		return typeof first === "string"
			? first
			: typeof first === "number" || typeof first === "boolean"
				? String(first)
				: null;
	}
	return null;
}

/** Extract suffix from basename for chip display. Single: YYYY-MM-DD-suffix, Range: YYYY-MM-DD--YYYY-MM-DD-suffix. */
export function getSuffixFromBasename(basename: string): string | null {
	const clean = basename.replace(/\.md$/i, "");
	const rangeParsed = parseRangeBasename(clean);
	if (rangeParsed?.suffix) return rangeParsed.suffix;
	const singleMatch = clean.match(/^(\d{4}-\d{2}-\d{2})(?:-(.+))?$/);
	return singleMatch?.[2] ?? null;
}

export function getFileTitle(app: App, file: TFile): string {
	const suffix = getSuffixFromBasename(file.basename);
	if (suffix) return suffix;
	const cache = app.metadataCache.getFileCache(file);
	const rawTitle: unknown = cache?.frontmatter?.title;
	const titleStr = rawTitle != null ? toStringSafe(rawTitle) : null;
	if (titleStr) return titleStr;
	const rawHeading: unknown = cache?.headings?.[0]?.heading;
	const headingStr = rawHeading != null ? toStringSafe(rawHeading) : null;
	if (headingStr) return headingStr;
	return file.basename;
}

/** Returns true if the file is marked as a todo file in frontmatter. */
export function isTodoFile(app: App, file: TFile): boolean {
	const cache = app.metadataCache.getFileCache(file);
	const raw: unknown = cache?.frontmatter?.todo;
	if (raw === true || raw === "true") return true;
	if (typeof raw === "string" && raw.trim().toLowerCase() === "true")
		return true;
	return false;
}

/** Returns true only when todo is true and completed is true in frontmatter. */
export function isTodoCompleted(app: App, file: TFile): boolean {
	if (!isTodoFile(app, file)) return false;
	const cache = app.metadataCache.getFileCache(file);
	const raw: unknown = cache?.frontmatter?.completed;
	if (raw === true || raw === "true") return true;
	if (typeof raw === "string" && raw.trim().toLowerCase() === "true")
		return true;
	return false;
}

/**
 * Reminder clock on the event day: minutes from local midnight (0–1439), from frontmatter `notify_minutes`.
 * Range notes use the start date as the event day.
 */
export function getNotifyMinutes(app: App, file: TFile): number | null {
	const cache = app.metadataCache.getFileCache(file);
	const raw: unknown = cache?.frontmatter?.notify_minutes;
	if (raw == null || raw === "") return null;
	const n =
		typeof raw === "number"
			? raw
			: typeof raw === "string"
				? parseInt(raw.trim(), 10)
				: NaN;
	if (!Number.isFinite(n) || n < 0 || n > 1439) return null;
	return Math.round(n);
}

/** Returns chip color from frontmatter if valid; otherwise null (use default). */
export function getChipColor(app: App, file: TFile): string | null {
	const cache = app.metadataCache.getFileCache(file);
	const rawColor: unknown = cache?.frontmatter?.color;
	const colorStr = rawColor != null ? toStringSafe(rawColor) : null;
	if (!colorStr || colorStr.trim() === "") return null;
	const trimmed = colorStr.trim();
	if (!isValidCssColor(trimmed)) return null;
	return trimmed;
}

function isValidCssColor(value: string): boolean {
	const div = document.createElement("div");
	div.style.color = value;
	return div.style.color !== "";
}
