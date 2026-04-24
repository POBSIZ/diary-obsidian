import { ItemView, Platform, TFile, WorkspaceLeaf } from "obsidian";
import { t } from "../../i18n";
import DiaryObsidian from "../../main";
import { VIEW_TYPE_MONTHLY_PLANNER } from "../../constants";
import type { ChipDragState } from "../yearly-planner/types";
import type { MonthlyPlannerState } from "./types";
import {
	getRangeStackIndexMap,
	getMonthNoteFilePath,
} from "../yearly-planner/file-utils";
import {
	renderPlanNotePanel,
	syncPlanNotePanelExpandedState,
} from "../plan-note-panel";
import {
	renderMonthlyPlannerHeader,
	createMonthlyCell,
	getMonthLabel,
	getWeekdayLabels,
} from "./render";
import {
	openDateNote as openDateNoteOp,
	createRangeFile as createRangeFileOp,
	createSingleDateFile as createSingleDateFileOp,
} from "../yearly-planner/file-operations";
import {
	MonthlyInteractionHandler,
	type MonthlyPlannerViewDelegate,
} from "./interactions";
import { CreateFileModal, FileOptionsModal } from "../yearly-planner/modals";
import { getSelectionBounds } from "../yearly-planner/selection";
import { getHolidaysForYear } from "../../utils/holidays";
import { getMonthCalendarCells } from "../../utils/date";
import { PinchZoomController } from "./pinch-zoom";

export type { MonthlyPlannerState } from "./types";

export class MonthlyPlannerView
	extends ItemView
	implements MonthlyPlannerViewDelegate
{
	year: number;
	month: number;
	dragState: import("../yearly-planner/types").DragState | null = null;
	chipDragState: ChipDragState | null = null;
	private interactionHandler: MonthlyInteractionHandler;
	private pinchZoom: PinchZoomController | null = null;
	private pinchZoomScale = 1;

	constructor(
		leaf: WorkspaceLeaf,
		public plugin: DiaryObsidian,
	) {
		super(leaf);
		const now = new Date();
		this.year = now.getFullYear();
		this.month = now.getMonth() + 1;
		this.navigation = false;
		this.interactionHandler = new MonthlyInteractionHandler(this);
	}

	getViewType(): string {
		return VIEW_TYPE_MONTHLY_PLANNER;
	}

	getDisplayText(): string {
		const locale = this.plugin.settings.locale ?? "en";
		const monthLabel = getMonthLabel(locale, this.month);
		return t("view.monthlyDisplayText", {
			year: this.year,
			month: monthLabel,
		});
	}

	getState(): MonthlyPlannerState {
		return { year: this.year, month: this.month };
	}

	async setState(
		state: MonthlyPlannerState,
		result: { history: boolean },
	): Promise<void> {
		if (state?.year && state?.month) {
			this.year = state.year;
			this.month = state.month;
			this.render();
		}
		await super.setState(state, result);
	}

	onOpen(): Promise<void> {
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.interactionHandler.clearDragListeners();
		this.pinchZoom?.detach();
		this.pinchZoom = null;
		return Promise.resolve();
	}

	/** Update chip-drag state without full render: add chip-dragging class and drop-target. */
	updateChipDragDropTarget(): void {
		if (this.chipDragState) {
			this.contentEl.addClass("monthly-planner-chip-dragging");
			const { currentYear, currentMonth, currentDay } = this.chipDragState;
			const cells = this.contentEl.querySelectorAll(
				"td[data-year][data-month][data-day]:not(.monthly-planner-cell-invalid)",
			);
			for (const cell of Array.from(cells)) {
				const y = parseInt(cell.getAttribute("data-year") ?? "", 10);
				const m = parseInt(cell.getAttribute("data-month") ?? "", 10);
				const d = parseInt(cell.getAttribute("data-day") ?? "", 10);
				(cell as HTMLElement).toggleClass(
					"monthly-planner-cell-drop-target",
					y === currentYear && m === currentMonth && d === currentDay,
				);
			}
		} else {
			this.contentEl.removeClass("monthly-planner-chip-dragging");
			this.contentEl
				.querySelectorAll(".monthly-planner-cell-drop-target")
				.forEach((el) =>
					(el as HTMLElement).removeClass("monthly-planner-cell-drop-target"),
				);
		}
	}

	render(): void {
		const { contentEl } = this;
		const scrollEl = contentEl.querySelector<HTMLElement>(
			".monthly-planner-scroll",
		);
		const scrollTop = scrollEl?.scrollTop ?? 0;
		const scrollLeft = scrollEl?.scrollLeft ?? 0;

		this.pinchZoomScale = this.pinchZoom?.getScale() ?? this.pinchZoomScale;
		this.pinchZoom?.detach();
		this.pinchZoom = null;

		const planNoteWrapper = contentEl.querySelector<HTMLElement>(
			".plan-note-panel-wrapper",
		);
		const preservePlanNote =
			planNoteWrapper &&
			planNoteWrapper.hasChildNodes() &&
			planNoteWrapper.dataset.year === String(this.year) &&
			planNoteWrapper.dataset.month === String(this.month);
		if (preservePlanNote) planNoteWrapper.remove();

		contentEl.empty();
		contentEl.addClass("monthly-planner-container");
		if (this.chipDragState) {
			contentEl.addClass("monthly-planner-chip-dragging");
		} else {
			contentEl.removeClass("monthly-planner-chip-dragging");
		}

		const pad = this.plugin.settings.mobileBottomPadding ?? 3.5;
		contentEl.style.setProperty(
			"--monthly-planner-mobile-bottom-padding",
			`${pad}rem`,
		);

		this.renderHeader(contentEl);
		if (preservePlanNote && planNoteWrapper) {
			contentEl.appendChild(planNoteWrapper);
			syncPlanNotePanelExpandedState(
				planNoteWrapper,
				this.plugin.settings.planNotePanelExpanded ?? true,
			);
		} else {
			const notePanelEl = contentEl.createDiv({
				cls: "plan-note-panel-wrapper",
			});
			notePanelEl.dataset.year = String(this.year);
			notePanelEl.dataset.month = String(this.month);
			void this.renderMonthNotePanel(notePanelEl);
		}
		this.renderTable(contentEl);

		const newScrollEl = contentEl.querySelector<HTMLElement>(
			".monthly-planner-scroll",
		);
		if (newScrollEl) {
			newScrollEl.scrollTop = scrollTop;
			newScrollEl.scrollLeft = scrollLeft;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					newScrollEl.scrollTop = scrollTop;
					newScrollEl.scrollLeft = scrollLeft;
				});
			});
		}

		if (Platform.isMobile) {
			const zoomWrapper = contentEl.querySelector<HTMLElement>(
				".monthly-planner-zoom-wrapper",
			);
			const zoomInner = contentEl.querySelector<HTMLElement>(
				".monthly-planner-zoom-inner",
			);
			if (zoomWrapper && zoomInner) {
				this.pinchZoom = new PinchZoomController({
					scrollContainer: newScrollEl as HTMLElement,
					zoomWrapper,
					zoomInner,
					initialScale: this.pinchZoomScale,
					onScaleChange: (s) => {
						this.pinchZoomScale = s;
					},
				});
				this.pinchZoom.attach();
				requestAnimationFrame(() => this.pinchZoom?.refresh());
			}
		}
	}

	private async renderMonthNotePanel(container: HTMLElement): Promise<void> {
		const folder = this.plugin.settings.plannerFolder || "Planner";
		const filePath = getMonthNoteFilePath(folder, this.year, this.month);
		const locale = this.plugin.settings.locale ?? "en";
		const monthLabel = getMonthLabel(locale, this.month);
		const label = `${monthLabel} ${this.year}`;
		await renderPlanNotePanel(container, this.app, filePath, this, {
			label,
			expanded: this.plugin.settings.planNotePanelExpanded ?? true,
			onToggle: () => void this.plugin.togglePlanNotePanelExpanded(),
			onCreate: async () => {
				const dir = filePath.split("/").slice(0, -1).join("/");
				if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
					await this.app.vault.createFolder(dir);
				}
				const newFile = await this.app.vault.create(
					filePath,
					`# ${label}\n\n`,
				);
				await this.leaf.openFile(newFile);
				this.render();
			},
			onOpen: (file) => {
				void this.leaf.openFile(file);
			},
		});
	}

	private renderHeader(contentEl: HTMLElement): void {
		const locale = this.plugin.settings.locale ?? "en";
		const monthLabel = getMonthLabel(locale, this.month);
		renderMonthlyPlannerHeader(
			contentEl,
			{
				year: this.year,
				month: this.month,
				monthLabel,
				app: this.app,
			},
			{
				onPrev: () => {
					if (this.month === 1) {
						if (this.year > 1900) {
							this.year--;
							this.month = 12;
						}
					} else {
						this.month--;
					}
					this.render();
				},
				onNext: () => {
					if (this.month === 12) {
						if (this.year < 2100) {
							this.year++;
							this.month = 1;
						}
					} else {
						this.month++;
					}
					this.render();
				},
				onToday: () => {
					const now = new Date();
					this.year = now.getFullYear();
					this.month = now.getMonth() + 1;
					this.render();
				},
				onMonthYearClick: (year, month) => {
					this.year = year;
					this.month = month;
					this.render();
				},
				onAddFile: () => {
					this.openCreateFileModal(
						getSelectionBounds(this.dragState),
					);
				},
				onResetZoom:
					Platform.isMobile
						? () => {
								this.pinchZoom?.resetScale();
							}
						: undefined,
				onSwitchToYearly: () => {
					void this.plugin.switchToYearly(this.leaf, this.year);
				},
				onSwitchToListView: () => {
					void this.plugin.switchToMonthlyList(
						this.leaf,
						this.year,
						this.month,
					);
				},
			},
		);
	}

	private renderTable(contentEl: HTMLElement): void {
		const scrollContainer = contentEl.createDiv({
			cls: "monthly-planner-scroll",
		});
		scrollContainer.addEventListener(
			"click",
			this.interactionHandler.handlePlannerClick.bind(
				this.interactionHandler,
			),
			{ capture: true },
		);
		scrollContainer.addEventListener(
			"mouseover",
			this.interactionHandler.handleRangeBarMouseOver.bind(
				this.interactionHandler,
			),
			{ capture: true },
		);
		scrollContainer.addEventListener(
			"mouseout",
			this.interactionHandler.handleRangeBarMouseOut.bind(
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
		scrollContainer.addEventListener(
			"touchcancel",
			this.interactionHandler.handlePlannerTouchCancel.bind(
				this.interactionHandler,
			),
			{ capture: true },
		);

		const tableParent = Platform.isMobile
			? scrollContainer
					.createDiv({ cls: "monthly-planner-zoom-wrapper" })
					.createDiv({ cls: "monthly-planner-zoom-inner" })
					.createDiv({ cls: "monthly-planner-table-wrapper" })
			: scrollContainer.createDiv({
					cls: "monthly-planner-table-wrapper",
				});

		const table = tableParent.createEl("table", {
			cls: "monthly-planner-table",
		});

		const locale = this.plugin.settings.locale ?? "en";
		const weekdayLabels = getWeekdayLabels(locale);

		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		for (const label of weekdayLabels) {
			headerRow.createEl("th", { text: label });
		}

		const tbody = table.createEl("tbody");
		const folder = this.plugin.settings.plannerFolder || "Planner";
		const { showHolidays, holidayCountry } = this.plugin.settings;
		const holidaysData =
			showHolidays && holidayCountry
				? getHolidaysForYear(holidayCountry, this.year)
				: null;
		const rangeStackMap = getRangeStackIndexMap(this.app, this.year);
		const cellCtx = {
			app: this.app,
			folder,
			dragState: this.dragState,
			chipDragState: this.chipDragState,
			holidaysData,
			locale,
			rangeStackMap,
		};

		const cells = getMonthCalendarCells(this.year, this.month);
		let row: HTMLTableRowElement | null = null;
		for (let i = 0; i < cells.length; i++) {
			if (i % 7 === 0) {
				row = tbody.createEl("tr");
			}
			const cellData = cells[i] ?? null;
			const cell = createMonthlyCell(cellData, cellCtx);
			row?.appendChild(cell);
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

	openCreateFileModal(
		bounds: import("../yearly-planner/types").SelectionBounds | null,
	): void {
		const defaultFolder = this.plugin.settings.plannerFolder || "Planner";
		new CreateFileModal(this.app, {
			bounds,
			defaultFolder,
			createSingleDateFile: (folder, basename, color, todo, notifyMinutes) =>
				createSingleDateFileOp(
					this.app,
					folder,
					basename,
					color,
					todo,
					notifyMinutes,
				),
			createRangeFile: (folder, basename, color, todo, notifyMinutes) =>
				createRangeFileOp(
					this.app,
					folder,
					basename,
					color,
					todo,
					notifyMinutes,
				),
			onCreated: () => this.render(),
		}).open();
	}

	openFileOptionsModal(file: TFile): void {
		new FileOptionsModal(this.app, file, this.leaf, () =>
			this.render(),
		).open();
	}
}
