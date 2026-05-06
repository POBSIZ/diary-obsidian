import { Plugin, WorkspaceLeaf } from "obsidian";
import { setLocale, t } from "./i18n";
import {
	DEFAULT_SETTINGS,
	DiaryObsidianSettings,
	DiaryObsidianSettingTab,
} from "./settings";
import {
	VIEW_TYPE_YEARLY_PLANNER,
	VIEW_TYPE_MONTHLY_PLANNER,
	VIEW_TYPE_MONTHLY_LIST_PLANNER,
} from "./constants";
import { YearlyPlannerView } from "./views/yearly-planner/view";
import { MonthlyPlannerView } from "./views/monthly-planner/view";
import { MonthlyListPlannerView } from "./views/monthly-list-planner/view";
import { registerPlannerReminders } from "./planner-reminders";

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
		this.registerView(
			VIEW_TYPE_MONTHLY_LIST_PLANNER,
			(leaf) => new MonthlyListPlannerView(leaf, this),
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
		this.addRibbonIcon(
			"list-ordered",
			t("ribbon.openMonthlyListPlanner"),
			() => {
				void this.activateMonthlyListPlanner();
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
		this.addCommand({
			id: "open-monthly-list-planner",
			name: t("command.openMonthlyListPlanner"),
			callback: () => void this.activateMonthlyListPlanner(),
		});

		this.addSettingTab(new DiaryObsidianSettingTab(this.app, this));

		registerPlannerReminders(this);

		const debouncedRefresh = this.debounce(() => {
			this.refreshYearlyPlannerViews();
			this.refreshMonthlyPlannerViews();
			this.refreshMonthlyListPlannerViews();
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
					this.refreshMonthlyListPlannerViews();
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

	async activateMonthlyListPlanner(): Promise<void> {
		const { workspace } = this.app;
		const now = new Date();
		const leaf = workspace.getLeaf();
		await leaf.setViewState({
			type: VIEW_TYPE_MONTHLY_LIST_PLANNER,
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

	/** Switch leaf to monthly list planner. Reuses the same leaf. */
	async switchToMonthlyList(
		leaf: WorkspaceLeaf,
		year: number,
		month: number,
	): Promise<void> {
		await leaf.setViewState({
			type: VIEW_TYPE_MONTHLY_LIST_PLANNER,
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

	/**
	 * Single control: yearly → monthly grid → monthly list → yearly.
	 * Preserves year/month between the two monthly modes.
	 */
	async cyclePlannerView(leaf: WorkspaceLeaf): Promise<void> {
		const { view } = leaf;
		if (view instanceof YearlyPlannerView) {
			const y = view.year;
			const now = new Date();
			const m =
				now.getFullYear() === y ? now.getMonth() + 1 : 1;
			await this.switchToMonthly(leaf, y, m);
		} else if (view instanceof MonthlyPlannerView) {
			await this.switchToMonthlyList(leaf, view.year, view.month);
		} else if (view instanceof MonthlyListPlannerView) {
			await this.switchToYearly(leaf, view.year);
		}
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
		this.refreshMonthlyListPlannerViews();
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

	refreshMonthlyListPlannerViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_MONTHLY_LIST_PLANNER,
		);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MonthlyListPlannerView) {
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
