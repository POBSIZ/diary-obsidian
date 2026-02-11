import { App, TFile, WorkspaceLeaf } from "obsidian";
import { getFilePath, getRangeFilePath } from "./file-utils";

const pad = (n: number) => String(n).padStart(2, "0");

export async function openDateNote(
	app: App,
	leaf: WorkspaceLeaf,
	folder: string,
	year: number,
	month: number,
	day: number,
): Promise<void> {
	const path = getFilePath(folder, year, month, day);
	const file = app.vault.getAbstractFileByPath(path);

	if (file instanceof TFile) {
		await leaf.openFile(file);
	} else {
		const dir = path.split("/").slice(0, -1).join("/");
		if (dir && !app.vault.getAbstractFileByPath(dir)) {
			await app.vault.createFolder(dir);
		}
		const dateStr = `${year}-${pad(month)}-${pad(day)}`;
		const content = `## ${dateStr}\n\n`;
		const newFile = await app.vault.create(path, content);
		await leaf.openFile(newFile);
	}
}

export async function createRangeFile(
	app: App,
	folder: string,
	startYear: number,
	startMonth: number,
	startDay: number,
	endYear: number,
	endMonth: number,
	endDay: number,
): Promise<TFile> {
	const path = getRangeFilePath(
		folder,
		startYear,
		startMonth,
		startDay,
		endYear,
		endMonth,
		endDay,
	);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		throw new Error(`File already exists: ${path}`);
	}
	const dir = path.split("/").slice(0, -1).join("/");
	if (dir && !app.vault.getAbstractFileByPath(dir)) {
		await app.vault.createFolder(dir);
	}
	const startStr = `${startYear}-${pad(startMonth)}-${pad(startDay)}`;
	const endStr = `${endYear}-${pad(endMonth)}-${pad(endDay)}`;
	const content = `---
date_start: ${startStr}
date_end: ${endStr}
---

# ${startStr} ~ ${endStr}

`;
	return app.vault.create(path, content);
}

/** Extract YYYY-MM-DD from basename for heading (handles "2026-02-12" or "2026-02-12-meeting"). */
function extractDateFromBasename(basename: string): string | null {
	const m = basename.match(/^(\d{4}-\d{2}-\d{2})/);
	return m?.[1] ?? null;
}

export async function createSingleDateFile(
	app: App,
	folder: string,
	basename: string,
): Promise<TFile> {
	const trimmed = (folder || "Planner").trim();
	const cleanBasename = basename.trim().replace(/\.md$/i, "") || "untitled";
	const filename = cleanBasename.endsWith(".md")
		? cleanBasename
		: `${cleanBasename}.md`;
	const path = trimmed ? `${trimmed}/${filename}` : filename;
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		throw new Error(`File already exists: ${path}`);
	}
	const dir = path.split("/").slice(0, -1).join("/");
	if (dir && !app.vault.getAbstractFileByPath(dir)) {
		await app.vault.createFolder(dir);
	}
	const dateStr = extractDateFromBasename(cleanBasename) ?? cleanBasename;
	const content = `## ${dateStr}\n\n`;
	return app.vault.create(path, content);
}
