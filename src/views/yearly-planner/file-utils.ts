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

/** Returns a stable map from range basename to stack index (0-based) for the given year. */
export function getRangeStackIndexMap(app: App, year: number): Map<string, number> {
	const yearStart = `${year}-01-01`;
	const yearEnd = `${year}-12-31`;
	const ranges: Array<{ basename: string; start: string }> = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const parsed = parseRangeBasename(file.basename);
		if (!parsed) continue;
		if (parsed.end < yearStart || parsed.start > yearEnd) continue;
		ranges.push({ basename: file.basename, start: parsed.start });
	}
	ranges.sort((a, b) => a.start.localeCompare(b.start));
	const map = new Map<string, number>();
	ranges.forEach((r, i) => map.set(r.basename, i));
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
	rangeFiles: Array<{ file: TFile; runPos: RangeRunPosition; isFirst: boolean }>;
} {
	const dateStr = `${year}-${pad(month)}-${pad(day)}`;

	const singleFiles = app.vault.getMarkdownFiles().filter((file) => {
		return (
			file.basename === dateStr ||
			(file.basename.startsWith(`${dateStr}-`) &&
				!parseRangeBasename(file.basename))
		);
	});

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
		isDateInRange(
			`${year}-${pad(month)}-${pad(prevDay)}`,
			start,
			end,
		);
	const nextInRange =
		nextDay <= daysInMonth &&
		isDateInRange(
			`${year}-${pad(month)}-${pad(nextDay)}`,
			start,
			end,
		);
	return {
		runStart: !prevInRange,
		runEnd: !nextInRange,
	};
}

function toStringSafe(val: unknown): string | null {
	if (typeof val === "string") return val;
	if (typeof val === "number" || typeof val === "boolean")
		return String(val);
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

export function getFileTitle(app: App, file: TFile): string {
	const cache = app.metadataCache.getFileCache(file);
	const rawTitle: unknown = cache?.frontmatter?.title;
	const titleStr = rawTitle != null ? toStringSafe(rawTitle) : null;
	if (titleStr) return titleStr;
	const rawHeading: unknown = cache?.headings?.[0]?.heading;
	const headingStr = rawHeading != null ? toStringSafe(rawHeading) : null;
	if (headingStr) return headingStr;
	return file.basename;
}
