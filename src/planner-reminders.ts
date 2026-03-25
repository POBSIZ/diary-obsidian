import { Notice, Plugin, TFile } from "obsidian";
import { t } from "./i18n";
import {
	getFileTitle,
	getNotifyMinutes,
} from "./views/yearly-planner/file-utils";
import { getPlannerEventDateString } from "./views/yearly-planner/file-operations";

const pad2 = (n: number) => String(n).padStart(2, "0");

function localDateStr(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function debounce(fn: () => void, ms: number): () => void {
	let t: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (t) clearTimeout(t);
		t = setTimeout(() => {
			t = null;
			fn();
		}, ms);
	};
}

/**
 * While Obsidian is open, shows a Notice when local time matches `notify_minutes` on the note's event day.
 */
export function registerPlannerReminders(plugin: Plugin): void {
	type Entry = { file: TFile; dateStr: string; minutes: number };
	let entries: Entry[] = [];
	const fired = new Set<string>();

	const rebuild = (): void => {
		const app = plugin.app;
		const next: Entry[] = [];
		for (const file of app.vault.getMarkdownFiles()) {
			const minutes = getNotifyMinutes(app, file);
			if (minutes === null) continue;
			const dateStr = getPlannerEventDateString(file);
			if (!dateStr) continue;
			next.push({ file, dateStr, minutes });
		}
		entries = next;
	};

	const debounced = debounce(rebuild, 200);
	rebuild();

	plugin.registerEvent(plugin.app.metadataCache.on("changed", debounced));
	plugin.registerEvent(plugin.app.vault.on("create", debounced));
	plugin.registerEvent(plugin.app.vault.on("delete", debounced));
	plugin.registerEvent(plugin.app.vault.on("rename", debounced));

	plugin.registerInterval(
		window.setInterval(() => {
			const now = new Date();
			const todayStr = localDateStr(now);
			const nowMins = now.getHours() * 60 + now.getMinutes();

			for (const k of [...fired]) {
				const datePart = k.split("|")[1];
				if (datePart && datePart < todayStr) fired.delete(k);
			}

			for (const e of entries) {
				if (e.dateStr !== todayStr || e.minutes !== nowMins) continue;
				const key = `${e.file.path}|${e.dateStr}|${e.minutes}`;
				if (fired.has(key)) continue;
				fired.add(key);
				new Notice(
					t("notify.plannerReminder", {
						title: getFileTitle(plugin.app, e.file),
					}),
					12_000,
				);
			}
		}, 15_000),
	);
}
