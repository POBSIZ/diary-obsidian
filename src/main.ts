import { Plugin, WorkspaceLeaf } from "obsidian";
import { setLocale, t } from "./i18n";
import {
	DEFAULT_SETTINGS,
	DiaryObsidianSettings,
	DiaryObsidianSettingTab,
} from "./settings";
import { VIEW_TYPE_YEARLY_PLANNER, VIEW_TYPE_MONTHLY_PLANNER } from "./constants";
import { YearlyPlannerView } from "./views/yearly-planner/view";
import { MonthlyPlannerView } from "./views/monthly-planner/view";

export default class DiaryObsidian extends Plugin {
	settings: DiaryObsidianSettings;

	async onload() {
		await this.loadSettings();
		setLocale(this.settings.locale ?? "en");

		this.registerView(
			VIEW_TYPE_YEARLY_PLANNER,
			(leaf) => new YearlyPlannerView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_MONTHLY_PLANNER,
			(leaf) => new MonthlyPlannerView(leaf, this),
		);

		this.addRibbonIcon(
			"calendar-range",
			t("ribbon.openYearlyPlanner"),
			() => {
				void this.activateYearlyPlanner();
			},
		);
		this.addRibbonIcon(
			"calendar-days",
			t("ribbon.openMonthlyPlanner"),
			() => {
				void this.activateMonthlyPlanner();
			},
		);

		this.addCommand({
			id: "open-yearly-planner",
			name: t("command.openYearlyPlanner"),
			callback: () => void this.activateYearlyPlanner(),
		});
		this.addCommand({
			id: "open-monthly-planner",
			name: t("command.openMonthlyPlanner"),
			callback: () => void this.activateMonthlyPlanner(),
		});

		this.addSettingTab(new DiaryObsidianSettingTab(this.app, this));

		const debouncedRefresh = this.debounce(() => {
			this.refreshYearlyPlannerViews();
			this.refreshMonthlyPlannerViews();
		}, 150);

		this.registerEvent(
			this.app.vault.on("create", debouncedRefresh),
		);
		this.registerEvent(
			this.app.vault.on("delete", debouncedRefresh),
		);
		this.registerEvent(
			this.app.vault.on("rename", debouncedRefresh),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", debouncedRefresh),
		);

		let lastCheckedDate = new Date().toDateString();
		this.registerInterval(
			window.setInterval(() => {
				const today = new Date().toDateString();
				if (today !== lastCheckedDate) {
					lastCheckedDate = today;
					this.refreshYearlyPlannerViews();
					this.refreshMonthlyPlannerViews();
				}
			}, 60_000),
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

	async activateMonthlyPlanner(): Promise<void> {
		const { workspace } = this.app;
		const now = new Date();
		const leaf = workspace.getLeaf();
		await leaf.setViewState({
			type: VIEW_TYPE_MONTHLY_PLANNER,
			state: { year: now.getFullYear(), month: now.getMonth() + 1 },
		});
		await workspace.revealLeaf(leaf);
	}

	/** Switch leaf to monthly planner. Reuses the same leaf. */
	async switchToMonthly(
		leaf: WorkspaceLeaf,
		year: number,
		month: number,
	): Promise<void> {
		await leaf.setViewState({
			type: VIEW_TYPE_MONTHLY_PLANNER,
			state: { year, month },
		});
		await this.app.workspace.revealLeaf(leaf);
	}

	/** Switch leaf to yearly planner. Reuses the same leaf. */
	async switchToYearly(leaf: WorkspaceLeaf, year: number): Promise<void> {
		await leaf.setViewState({
			type: VIEW_TYPE_YEARLY_PLANNER,
			state: { year },
		});
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DiaryObsidianSettings>,
		);
	}

	async saveSettings() {
		setLocale(this.settings.locale ?? "en");
		await this.saveData(this.settings);
		this.refreshYearlyPlannerViews();
		this.refreshMonthlyPlannerViews();
	}

	/** Toggle plan note panel expanded state and persist. */
	async togglePlanNotePanelExpanded(): Promise<void> {
		this.settings.planNotePanelExpanded =
			!(this.settings.planNotePanelExpanded ?? true);
		await this.saveSettings();
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

	refreshMonthlyPlannerViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_MONTHLY_PLANNER,
		);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MonthlyPlannerView) {
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
