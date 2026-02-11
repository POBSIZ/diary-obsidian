import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	DiaryObsidianSettings,
	DiaryObsidianSettingTab,
} from "./settings";
import { VIEW_TYPE_YEARLY_PLANNER } from "./constants";
import { YearlyPlannerView } from "./views/yearly-planner/view";

export default class DiaryObsidian extends Plugin {
	settings: DiaryObsidianSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_YEARLY_PLANNER,
			(leaf) => new YearlyPlannerView(leaf, this),
		);

		this.addRibbonIcon("calendar-range", "Open yearly planner", () => {
			void this.activateYearlyPlanner();
		});

		this.addCommand({
			id: "open-yearly-planner",
			name: "Open yearly planner",
			callback: () => void this.activateYearlyPlanner(),
		});

		this.addSettingTab(new DiaryObsidianSettingTab(this.app, this));

		const debouncedRefreshYearlyPlanner = this.debounce(() => {
			this.refreshYearlyPlannerViews();
		}, 150);

		this.registerEvent(
			this.app.vault.on("create", debouncedRefreshYearlyPlanner),
		);
		this.registerEvent(
			this.app.vault.on("delete", debouncedRefreshYearlyPlanner),
		);
		this.registerEvent(
			this.app.vault.on("rename", debouncedRefreshYearlyPlanner),
		);
		this.registerEvent(
			this.app.metadataCache.on(
				"changed",
				debouncedRefreshYearlyPlanner,
			),
		);
	}

	onunload() {}

	async activateYearlyPlanner(): Promise<void> {
		const { workspace } = this.app;
		const year = new Date().getFullYear();
		const leaf = workspace.getLeaf();
		await leaf.setViewState({
			type: VIEW_TYPE_YEARLY_PLANNER,
			state: { year },
		});
		await workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DiaryObsidianSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshYearlyPlannerViews();
	}

	refreshYearlyPlannerViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_YEARLY_PLANNER,
		);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof YearlyPlannerView) {
				view.render();
			}
		}
	}

	private debounce(fn: () => void, delayMs: number): () => void {
		let timeout: ReturnType<typeof setTimeout> | null = null;
		return () => {
			if (timeout) clearTimeout(timeout);
			timeout = setTimeout(() => {
				timeout = null;
				fn();
			}, delayMs);
		};
	}
}
