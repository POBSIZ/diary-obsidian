import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import DiaryObsidian from "../../main";
import { VIEW_TYPE_YEARLY_PLANNER } from "../../constants";
import type { YearlyPlannerState, DragState } from "./types";
import {
	getRangeFilePath,
	getRangeStackIndexMap,
} from "./file-utils";
import {
	renderYearlyPlannerHeader,
	createPlannerCell,
	getMonthLabels,
} from "./render";
import {
	openDateNote as openDateNoteOp,
	createRangeFile as createRangeFileOp,
	createSingleDateFile as createSingleDateFileOp,
} from "./file-operations";
import {
	PlannerInteractionHandler,
	type YearlyPlannerViewDelegate,
} from "./interactions";
import { CreateFileModal } from "./modals";
import { getSelectionBounds } from "./selection";
import { getHolidaysForYear } from "../../utils/holidays";

export type { YearlyPlannerState } from "./types";

export class YearlyPlannerView extends ItemView implements YearlyPlannerViewDelegate {
	year: number;
	dragState: DragState | null = null;
	private interactionHandler: PlannerInteractionHandler;

	constructor(
		leaf: WorkspaceLeaf,
		public plugin: DiaryObsidian,
	) {
		super(leaf);
		this.year = new Date().getFullYear();
		this.navigation = false;
		this.interactionHandler = new PlannerInteractionHandler(this);
	}

	getViewType(): string {
		return VIEW_TYPE_YEARLY_PLANNER;
	}

	getDisplayText(): string {
		return `Yearly Planner ${this.year}`;
	}

	getState(): YearlyPlannerState {
		return { year: this.year };
	}

	async setState(
		state: YearlyPlannerState,
		result: { history: boolean },
	): Promise<void> {
		if (state?.year) {
			this.year = state.year;
			this.render();
		}
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.interactionHandler.clearDragListeners();
	}

	render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("yearly-planner-container");

		const pad =
			this.plugin.settings.mobileBottomPadding ?? 3.5;
		contentEl.style.setProperty(
			"--yearly-planner-mobile-bottom-padding",
			`${pad}rem`,
		);

		this.renderHeader(contentEl);
		this.renderTable(contentEl);
	}

	private renderHeader(contentEl: HTMLElement): void {
		const monthLabels = getMonthLabels(this.plugin.settings.monthLabels);
		renderYearlyPlannerHeader(
			contentEl,
			{
				year: this.year,
				monthLabels,
				app: this.app,
			},
			{
				onPrev: () => {
					if (this.year > 1900) {
						this.year--;
						this.render();
					}
				},
				onNext: () => {
					if (this.year < 2100) {
						this.year++;
						this.render();
					}
				},
				onToday: () => {
					this.year = new Date().getFullYear();
					this.render();
				},
				onYearClick: (year) => {
					this.year = year;
					this.render();
				},
				onAddFile: () => {
					const defaultFolder =
						this.plugin.settings.plannerFolder || "Planner";
					new CreateFileModal(this.app, {
						bounds: getSelectionBounds(this.dragState),
						defaultFolder,
						createSingleDateFile: (folder, basename) =>
							createSingleDateFileOp(this.app, folder, basename),
						createRangeFile: (folder, ...args) =>
							createRangeFileOp(this.app, folder, ...args),
						onCreated: () => this.render(),
					}).open();
				},
			},
		);
	}

	private renderTable(contentEl: HTMLElement): void {
		const scrollContainer = contentEl.createDiv({
			cls: "yearly-planner-scroll",
		});
		scrollContainer.addEventListener(
			"click",
			this.interactionHandler.handlePlannerClick.bind(
				this.interactionHandler,
			),
			{ capture: true },
		);
		scrollContainer.addEventListener(
			"touchend",
			this.interactionHandler.handlePlannerTouchEnd.bind(
				this.interactionHandler,
			),
			{ capture: true, passive: false },
		);
		const table = scrollContainer.createEl("table", {
			cls: "yearly-planner-table",
		});

		const monthLabels = getMonthLabels(this.plugin.settings.monthLabels);
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { cls: "yearly-planner-corner" });
		for (let m = 0; m < 12; m++) {
			headerRow.createEl("th", { text: monthLabels[m] });
		}

		const tbody = table.createEl("tbody");
		const folder = this.plugin.settings.plannerFolder || "Planner";
		const rangeStackMap = getRangeStackIndexMap(this.app, this.year);
		const { showHolidays, holidayCountry } = this.plugin.settings;
		const holidaysData =
			showHolidays && holidayCountry
				? getHolidaysForYear(holidayCountry, this.year)
				: null;
		const cellCtx = {
			year: this.year,
			app: this.app,
			folder,
			rangeStackMap,
			dragState: this.dragState,
			holidaysData,
		};

		for (let day = 1; day <= 31; day++) {
			const row = tbody.createEl("tr");
			row.createEl("th", { text: String(day) });
			for (let month = 1; month <= 12; month++) {
				createPlannerCell(row, day, month, cellCtx);
			}
		}
		scrollContainer.addEventListener(
			"mousedown",
			this.interactionHandler.handlePlannerMouseDown.bind(
				this.interactionHandler,
			),
			{ capture: true },
		);
		scrollContainer.addEventListener(
			"touchstart",
			this.interactionHandler.handlePlannerTouchStart.bind(
				this.interactionHandler,
			),
			{ capture: true, passive: false },
		);
	}

	async openDateNote(
		year: number,
		month: number,
		day: number,
	): Promise<void> {
		const folder = this.plugin.settings.plannerFolder || "Planner";
		await openDateNoteOp(this.app, this.leaf, folder, year, month, day);
	}

	getRangeFilePath(
		startYear: number,
		startMonth: number,
		startDay: number,
		endYear: number,
		endMonth: number,
		endDay: number,
	): string {
		const folder = this.plugin.settings.plannerFolder || "Planner";
		return getRangeFilePath(
			folder,
			startYear,
			startMonth,
			startDay,
			endYear,
			endMonth,
			endDay,
		);
	}

	async createRangeFile(
		startYear: number,
		startMonth: number,
		startDay: number,
		endYear: number,
		endMonth: number,
		endDay: number,
	): Promise<TFile> {
		const folder = this.plugin.settings.plannerFolder || "Planner";
		return createRangeFileOp(
			this.app,
			folder,
			startYear,
			startMonth,
			startDay,
			endYear,
			endMonth,
			endDay,
		);
	}
}
