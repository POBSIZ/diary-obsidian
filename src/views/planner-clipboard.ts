import { Notice, TFile, type App } from "obsidian";
import { Platform } from "obsidian";
import { t } from "../i18n";
import { DeleteConfirmModal } from "./yearly-planner/modals";
import { parseRangeBasename } from "../utils/range";
import { getFilesForDate } from "./yearly-planner/file-utils";
import {
	getPlannerEventDateString,
	parseSingleDateBasename,
} from "./yearly-planner/file-operations";

const CLIP_START = "---BEGIN_DIARY_OBSIDIAN_PLANNER---";
const CLIP_END = "---END_DIARY_OBSIDIAN_PLANNER---";

/** Obsidian Notice duration for copy/paste success feedback */
export const PLANNER_CLIPBOARD_SUCCESS_NOTICE_MS = 5600;
/** Obsidian Notice duration for error feedback */
export const PLANNER_CLIPBOARD_ERROR_NOTICE_MS = 4800;
/** Added to planner container `contentEl` while copy/paste runs */
export const PLANNER_CLIPBOARD_BUSY_CLASS = "planner-clipboard-busy";

const pad = (n: number) => String(n).padStart(2, "0");

export function isPrimaryMod(e: MouseEvent | KeyboardEvent): boolean {
	return Platform.isMacOS ? e.metaKey : e.ctrlKey;
}

/**
 * When focus is in a text field, modal, or palette, let native / Obsidian handle Cmd+C/V.
 * Avoids stealing shortcuts while typing; planner table clicks often do not focus the view root,
 * so keydown is registered on `window` with capture — this guard limits side effects elsewhere.
 */
export function shouldDeferPlannerClipboardToNative(e: KeyboardEvent): boolean {
	const t = e.target;
	if (!(t instanceof HTMLElement)) return false;
	if (t.closest("input, textarea, select")) return true;
	if (t.closest("[contenteditable='true']")) return true;
	if (t.closest(".modal-container, .modal")) return true;
	if (t.closest(".suggestion-container, .prompt")) return true;
	return false;
}

export function dateKeyFromParts(
	year: number,
	month: number,
	day: number,
): string {
	return `${year}-${pad(month)}-${pad(day)}`;
}

export function makeDateSelectionKey(dateKey: string): string {
	return `date:${dateKey}`;
}

export function makeFileSelectionKey(path: string): string {
	return `file:${path}`;
}

export function parseSelectionKey(
	key: string,
): { kind: "date"; date: string } | { kind: "file"; path: string } | null {
	if (key.startsWith("date:")) {
		const date = key.slice("date:".length);
		if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return { kind: "date", date };
		return null;
	}
	if (key.startsWith("file:")) {
		return { kind: "file", path: key.slice("file:".length) };
	}
	return null;
}

/** All TFiles to copy for the current clipboard selection keys (deduped by path). */
export function resolveClipboardSelectionToFiles(
	app: App,
	selection: Set<string>,
): TFile[] {
	const byPath = new Map<string, TFile>();

	for (const raw of selection) {
		const parsed = parseSelectionKey(raw);
		if (!parsed) continue;
		if (parsed.kind === "file") {
			const f = app.vault.getAbstractFileByPath(parsed.path);
			if (f instanceof TFile) byPath.set(f.path, f);
			continue;
		}
		const parts = parsed.date.split("-");
		if (parts.length !== 3) continue;
		const y = parseInt(parts[0] ?? "", 10);
		const m = parseInt(parts[1] ?? "", 10);
		const d = parseInt(parts[2] ?? "", 10);
		if (isNaN(y) || isNaN(m) || isNaN(d)) continue;
		const { singleFiles, rangeFiles } = getFilesForDate(app, y, m, d);
		const startRangeFiles = rangeFiles.filter((r) => r.isFirst).map((r) => r.file);
		for (const f of [...singleFiles, ...startRangeFiles]) {
			byPath.set(f.path, f);
		}
	}

	return Array.from(byPath.values());
}

/** Unique planner event dates (YYYY-MM-DD) from selection keys, sorted. */
export function getTargetDatesFromClipboardSelection(
	app: App,
	selection: Set<string>,
): string[] {
	const dates = new Set<string>();
	for (const raw of selection) {
		const parsed = parseSelectionKey(raw);
		if (!parsed) continue;
		if (parsed.kind === "date") {
			dates.add(parsed.date);
			continue;
		}
		const f = app.vault.getAbstractFileByPath(parsed.path);
		if (f instanceof TFile) {
			const ds = getPlannerEventDateString(f);
			if (ds) dates.add(ds);
		}
	}
	return Array.from(dates).sort();
}

export interface PlannerClipboardItem {
	path: string;
	content: string;
}

export function serializePlannerClipboardItems(
	items: PlannerClipboardItem[],
): string {
	const payload = JSON.stringify({ v: 1, items });
	return `${CLIP_START}\n${payload}\n${CLIP_END}`;
}

export function parsePlannerClipboard(
	text: string,
): { v: number; items: PlannerClipboardItem[] } | null {
	const start = text.indexOf(CLIP_START);
	const end = text.indexOf(CLIP_END);
	if (start === -1 || end === -1 || end <= start) return null;
	const jsonSlice = text
		.slice(start + CLIP_START.length, end)
		.trim()
		.replace(/^\uFEFF/, "");
	try {
		const data = JSON.parse(jsonSlice) as {
			v?: number;
			items?: PlannerClipboardItem[];
		};
		if (!data || !Array.isArray(data.items) || data.items.length === 0)
			return null;
		const items = data.items.filter(
			(i) =>
				i &&
				typeof i.path === "string" &&
				typeof i.content === "string",
		);
		if (items.length === 0) return null;
		return { v: typeof data.v === "number" ? data.v : 1, items };
	} catch {
		return null;
	}
}

function daysInclusive(start: string, end: string): number {
	const parse = (s: string) => {
		const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!m) return null;
		const y = parseInt(m[1] ?? "", 10);
		const mo = parseInt(m[2] ?? "", 10);
		const d = parseInt(m[3] ?? "", 10);
		if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
		return new Date(y, mo - 1, d).getTime();
	};
	const a = parse(start);
	const b = parse(end);
	if (a == null || b == null) return 1;
	return Math.round((b - a) / 86400000) + 1;
}

function addCalendarDays(dateStr: string, deltaDays: number): string {
	const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return dateStr;
	const y = parseInt(m[1] ?? "", 10);
	const mo = parseInt(m[2] ?? "", 10);
	const d = parseInt(m[3] ?? "", 10);
	const dt = new Date(y, mo - 1, d);
	dt.setDate(dt.getDate() + deltaDays);
	return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Returns new basename including .md, with leading date/range aligned to targetDateStr.
 */
export function rebasePlannerFileBasename(
	sourcePath: string,
	targetDateStr: string,
): string {
	const base = sourcePath.split("/").pop() ?? sourcePath;
	const clean = base.replace(/\.md$/i, "");
	const rangeParsed = parseRangeBasename(clean);
	if (rangeParsed) {
		const span = daysInclusive(rangeParsed.start, rangeParsed.end);
		const newEnd = addCalendarDays(targetDateStr, span - 1);
		const suf = rangeParsed.suffix ? `-${rangeParsed.suffix}` : "";
		return `${targetDateStr}--${newEnd}${suf}.md`;
	}
	const singleParsed = parseSingleDateBasename(clean);
	if (singleParsed) {
		const suf = singleParsed.suffix ? `-${singleParsed.suffix}` : "";
		return `${targetDateStr}${suf}.md`;
	}
	return `${targetDateStr}.md`;
}

function uniqueVaultPath(app: App, path: string): string {
	if (!app.vault.getAbstractFileByPath(path)) return path;
	const lastSlash = path.lastIndexOf("/");
	const dir = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : "";
	const file = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
	const dot = file.lastIndexOf(".");
	const stem = dot >= 0 ? file.slice(0, dot) : file;
	const ext = dot >= 0 ? file.slice(dot) : "";
	for (let i = 1; ; i++) {
		const suffix = i === 1 ? "-copy" : `-copy${i}`;
		const candidate = `${dir}${stem}${suffix}${ext}`;
		if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
	}
}

export type PastePlannerResult =
	| { ok: true; fileCount: number; createdPaths: string[] }
	| { ok: false; errorKey: string };

export async function pastePlannerClipboard(
	app: App,
	folder: string,
	clipboardText: string,
	selection: Set<string>,
): Promise<PastePlannerResult> {
	const parsed = parsePlannerClipboard(clipboardText);
	if (!parsed) return { ok: false, errorKey: "plannerClipboard.pasteInvalid" };

	const targetDates = getTargetDatesFromClipboardSelection(app, selection);
	if (targetDates.length === 0) {
		return { ok: false, errorKey: "plannerClipboard.pasteNoTarget" };
	}

	const trimmed = (folder || "Planner").trim();
	const items = parsed.items;

	if (items.length === 1) {
		const srcPath = items[0]!.path;
		const content = items[0]!.content;
		const createdPaths: string[] = [];
		for (const dateStr of targetDates) {
			const newBasename = rebasePlannerFileBasename(srcPath, dateStr);
			let path = trimmed ? `${trimmed}/${newBasename}` : newBasename;
			path = uniqueVaultPath(app, path);
			await app.vault.create(path, content);
			createdPaths.push(path);
		}
		return {
			ok: true,
			fileCount: createdPaths.length,
			createdPaths,
		};
	}

	if (items.length > 1 && targetDates.length === 1) {
		const dateStr = targetDates[0]!;
		const createdPaths: string[] = [];
		for (const it of items) {
			const newBasename = rebasePlannerFileBasename(it.path, dateStr);
			let path = trimmed ? `${trimmed}/${newBasename}` : newBasename;
			path = uniqueVaultPath(app, path);
			await app.vault.create(path, it.content);
			createdPaths.push(path);
		}
		return {
			ok: true,
			fileCount: createdPaths.length,
			createdPaths,
		};
	}

	return { ok: false, errorKey: "plannerClipboard.pasteMultiConflict" };
}

/**
 * Move files from a single paste operation to trash (for Cmd/Ctrl+Z undo).
 * Skips paths that no longer exist.
 */
export async function undoPlannerPasteBatch(
	app: App,
	paths: string[],
): Promise<
	| { ok: true; trashedCount: number }
	| { ok: false; errorKey: string; path: string }
> {
	let trashedCount = 0;
	for (const p of paths) {
		const f = app.vault.getAbstractFileByPath(p);
		if (!(f instanceof TFile)) continue;
		try {
			await app.fileManager.trashFile(f);
			trashedCount++;
		} catch {
			return { ok: false, errorKey: "plannerClipboard.undoFailed", path: p };
		}
	}
	return { ok: true, trashedCount };
}

export interface ClipboardModifierClickContext {
	contentEl: HTMLElement;
	clientX: number;
	clientY: number;
	e: MouseEvent;
	/** e.g. getTopmostPlannerElementAt(contentEl, x, y) */
	topmostAt: (cx: number, cy: number) => Element | null;
	chipBarSelector: string;
	cellSelector: string;
	selection: Set<string>;
	rerender: () => void;
}

/**
 * Cmd/Ctrl (+ optional Shift) click for planner clipboard selection.
 * @returns true if the event was consumed (caller should stop default handling).
 */
export function applyClipboardModifierClick(
	ctx: ClipboardModifierClickContext,
): boolean {
	if (Platform.isMobile || !isPrimaryMod(ctx.e)) return false;
	const el = ctx.topmostAt(ctx.clientX, ctx.clientY);
	if (!el || !ctx.contentEl.contains(el as Node)) return false;

	const chipOrBar = el.closest(ctx.chipBarSelector);
	if (chipOrBar instanceof HTMLElement && chipOrBar.dataset.path) {
		const key = makeFileSelectionKey(chipOrBar.dataset.path);
		if (ctx.e.shiftKey) {
			if (ctx.selection.has(key)) ctx.selection.delete(key);
			else ctx.selection.add(key);
		} else {
			ctx.selection.clear();
			ctx.selection.add(key);
		}
		ctx.e.preventDefault();
		ctx.e.stopPropagation();
		ctx.e.stopImmediatePropagation?.();
		ctx.rerender();
		return true;
	}

	const cell = el.closest(ctx.cellSelector);
	if (!(cell instanceof HTMLElement)) return false;
	const year = parseInt(cell.dataset.year ?? "", 10);
	const month = parseInt(cell.dataset.month ?? "", 10);
	const day = parseInt(cell.dataset.day ?? "", 10);
	if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
	const key = makeDateSelectionKey(dateKeyFromParts(year, month, day));
	if (ctx.e.shiftKey) {
		if (ctx.selection.has(key)) ctx.selection.delete(key);
		else ctx.selection.add(key);
	} else {
		ctx.selection.clear();
		ctx.selection.add(key);
	}
	ctx.e.preventDefault();
	ctx.e.stopPropagation();
	ctx.e.stopImmediatePropagation?.();
	ctx.rerender();
	return true;
}

export type CopyPlannerResult =
	| { ok: true; noteCount: number }
	| { ok: false; errorKey: string };

export async function copyPlannerSelectionToClipboard(
	app: App,
	files: TFile[],
): Promise<CopyPlannerResult> {
	if (files.length === 0) {
		return { ok: false, errorKey: "plannerClipboard.emptyCopy" };
	}
	try {
		const items: PlannerClipboardItem[] = [];
		for (const f of files) {
			items.push({ path: f.path, content: await app.vault.read(f) });
		}
		const text = serializePlannerClipboardItems(items);
		await navigator.clipboard.writeText(text);
		return { ok: true, noteCount: items.length };
	} catch {
		return { ok: false, errorKey: "plannerClipboard.copyFailed" };
	}
}

const DELETE_PATH_LIST_MAX = 8;

/**
 * Confirm and move resolved planner files to trash; clears `selection` on success.
 */
export function openPlannerClipboardSelectionTrashModal(
	app: App,
	files: TFile[],
	selection: Set<string>,
	onTrashed: () => void,
): void {
	if (files.length === 0) {
		new Notice(t("plannerClipboard.deleteNothing"));
		return;
	}
	const listed = files
		.slice(0, DELETE_PATH_LIST_MAX)
		.map((f) => f.path);
	const rest = files.length - listed.length;
	const pathsBlock =
		listed.join("\n") + (rest > 0 ? `\n… (+${rest})` : "");
	new DeleteConfirmModal(
		app,
		t("plannerClipboard.deleteConfirmTitle"),
		t("plannerClipboard.deleteConfirmDesc", {
			count: files.length,
			paths: pathsBlock,
		}),
		() => {
			void (async () => {
				for (const f of files) {
					try {
						await app.fileManager.trashFile(f);
					} catch (err) {
						const msg =
							err instanceof Error ? err.message : String(err);
						new Notice(
							t("plannerClipboard.deleteFailed", {
								path: f.path,
								msg,
							}),
							PLANNER_CLIPBOARD_ERROR_NOTICE_MS,
						);
						return;
					}
				}
				selection.clear();
				onTrashed();
				new Notice(
					t("plannerClipboard.deleteSuccess", {
						count: files.length,
					}),
					PLANNER_CLIPBOARD_SUCCESS_NOTICE_MS,
				);
			})();
		},
	).open();
}
