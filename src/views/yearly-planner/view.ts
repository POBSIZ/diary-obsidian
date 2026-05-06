import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { t } from "../../i18n";
import DiaryObsidian from "../../main";
import { VIEW_TYPE_YEARLY_PLANNER } from "../../constants";
import type {
	ChipDragState,
	YearlyPlannerState,
	DragState,
	SelectionBounds,
} from "./types";
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
import { CreateFileModal, FileOptionsModal } from "./modals";
import { getSelectionBounds } from "./selection";
import { getHolidaysForYear } from "../../utils/holidays";
import {
	getRangesForYear,
	getRangeLaneMap,
	getYearNoteFilePath,
} from "./file-utils";
import {
	renderPlanNotePanel,
	syncPlanNotePanelExpandedState,
} from "../plan-note-panel";
import {
	copyPlannerSelectionToClipboard,
	isPrimaryMod,
	openPlannerClipboardSelectionTrashModal,
	PLANNER_CLIPBOARD_BUSY_CLASS,
	PLANNER_CLIPBOARD_ERROR_NOTICE_MS,
	PLANNER_CLIPBOARD_SUCCESS_NOTICE_MS,
	pastePlannerClipboard,
	resolveClipboardSelectionToFiles,
	shouldDeferPlannerClipboardToNative,
	undoPlannerPasteBatch,
} from "../planner-clipboard";

export type { YearlyPlannerState } from "./types";

export class YearlyPlannerView
	extends ItemView
	implements YearlyPlannerViewDelegate
{
	year: number;
	dragState: DragState | null = null;
	chipDragState: ChipDragState | null = null;
	clipboardSelection = new Set<string>();
	private interactionHandler: PlannerInteractionHandler;
	private clipboardKeydownRegistered = false;
	/** LIFO stack of paths created by each Cmd/Ctrl+V paste (for Cmd/Ctrl+Z undo). */
	private pasteUndoBatches: string[][] = [];
	private boundClipboardKeydown = (e: KeyboardEvent) => {
		this.handleClipboardKeydown(e);
	};

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
		return t("view.displayText", { year: this.year });
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

	onOpen(): Promise<void> {
		if (!this.clipboardKeydownRegistered) {
			this.registerDomEvent(window, "keydown", this.boundClipboardKeydown, {
				capture: true,
			});
			this.clipboardKeydownRegistered = true;
		}
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.interactionHandler.clearDragListeners();
		this.clipboardSelection.clear();
		this.pasteUndoBatches.length = 0;
		return Promise.resolve();
	}

	/** Update chip-drag state without full render: add chip-dragging class and drop-target. */
	updateChipDragDropTarget(): void {
		if (this.chipDragState) {
			this.contentEl.addClass("yearly-planner-chip-dragging");
			const { currentYear, currentMonth, currentDay } = this.chipDragState;
			const cells = this.contentEl.querySelectorAll(
				"td[data-year][data-month][data-day]:not(.yearly-planner-cell-invalid)",
			);
			for (const cell of Array.from(cells)) {
				const y = parseInt(cell.getAttribute("data-year") ?? "", 10);
				const m = parseInt(cell.getAttribute("data-month") ?? "", 10);
				const d = parseInt(cell.getAttribute("data-day") ?? "", 10);
				(cell as HTMLElement).toggleClass(
					"yearly-planner-cell-drop-target",
					y === currentYear && m === currentMonth && d === currentDay,
				);
			}
		} else {
			this.contentEl.removeClass("yearly-planner-chip-dragging");
			this.contentEl
				.querySelectorAll(".yearly-planner-cell-drop-target")
				.forEach((el) =>
					(el as HTMLElement).removeClass("yearly-planner-cell-drop-target"),
				);
		}
	}

	render(): void {
		const { contentEl } = this;
		const scrollEl = contentEl.querySelector<HTMLElement>(
			".yearly-planner-scroll",
		);
		const scrollTop = scrollEl?.scrollTop ?? 0;
		const scrollLeft = scrollEl?.scrollLeft ?? 0;

		const planNoteWrapper = contentEl.querySelector<HTMLElement>(
			".plan-note-panel-wrapper",
		);
		const preservePlanNote =
			planNoteWrapper &&
			planNoteWrapper.hasChildNodes() &&
			planNoteWrapper.dataset.year === String(this.year);
		if (preservePlanNote) planNoteWrapper.remove();

		contentEl.empty();
		contentEl.addClass("yearly-planner-container");
		if (this.chipDragState) {
			contentEl.addClass("yearly-planner-chip-dragging");
		} else {
			contentEl.removeClass("yearly-planner-chip-dragging");
		}

		const pad = this.plugin.settings.mobileBottomPadding ?? 3.5;
		contentEl.style.setProperty(
			"--yearly-planner-mobile-bottom-padding",
			`${pad}rem`,
		);

		const cellWidth = this.plugin.settings.mobileCellWidth ?? 0;
		if (cellWidth > 0) {
			contentEl.style.setProperty(
				"--yearly-planner-mobile-cell-width",
				`${cellWidth}rem`,
			);
		} else {
			contentEl.style.removeProperty(
				"--yearly-planner-mobile-cell-width",
			);
		}

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
			void this.renderYearNotePanel(notePanelEl);
		}
		this.renderTable(contentEl);

		const newScrollEl = contentEl.querySelector<HTMLElement>(
			".yearly-planner-scroll",
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
	}

	private async renderYearNotePanel(container: HTMLElement): Promise<void> {
		const folder = this.plugin.settings.plannerFolder || "Planner";
		const filePath = getYearNoteFilePath(folder, this.year);
		await renderPlanNotePanel(container, this.app, filePath, this, {
			label: String(this.year),
			expanded: this.plugin.settings.planNotePanelExpanded ?? true,
			onToggle: () => void this.plugin.togglePlanNotePanelExpanded(),
			onCreate: async () => {
				const dir = filePath.split("/").slice(0, -1).join("/");
				if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
					await this.app.vault.createFolder(dir);
				}
				const newFile = await this.app.vault.create(
					filePath,
					`# ${this.year}\n\n`,
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
		renderYearlyPlannerHeader(
			contentEl,
			{
				year: this.year,
				monthLabels: getMonthLabels(locale),
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
				onCyclePlannerView: () => {
					void this.plugin.cyclePlannerView(this.leaf);
				},
				onYearClick: (year) => {
					this.year = year;
					this.render();
				},
				onAddFile: () => {
					this.openCreateFileModal(
						getSelectionBounds(this.dragState),
					);
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
		scrollContainer.addEventListener(
			"touchcancel",
			this.interactionHandler.handlePlannerTouchCancel.bind(
				this.interactionHandler,
			),
			{ capture: true },
		);

		const tableParent = scrollContainer.createDiv({
			cls: "yearly-planner-table-wrapper",
		});

		const table = tableParent.createEl("table", {
			cls: "yearly-planner-table",
		});

		const monthLabels = getMonthLabels(this.plugin.settings.locale ?? "en");
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { cls: "yearly-planner-corner" });
		for (let m = 0; m < 12; m++) {
			headerRow.createEl("th", { text: monthLabels[m] });
		}

		const tbody = table.createEl("tbody");
		const folder = this.plugin.settings.plannerFolder || "Planner";
		const { showHolidays, holidayCountry } = this.plugin.settings;
		const holidaysData =
			showHolidays && holidayCountry
				? getHolidaysForYear(holidayCountry, this.year)
				: null;
		const ranges = getRangesForYear(this.app, this.year);
		const rangeLaneMap = getRangeLaneMap(ranges);
		const cellCtx = {
			year: this.year,
			app: this.app,
			folder,
			dragState: this.dragState,
			chipDragState: this.chipDragState,
			clipboardSelection: this.clipboardSelection,
			holidaysData,
			locale: this.plugin.settings.locale ?? "en",
			rangeLaneMap,
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

		this.interactionHandler.registerRangeHoverListeners(scrollContainer);
	}

	async openDateNote(
		year: number,
		month: number,
		day: number,
	): Promise<void> {
		const folder = this.plugin.settings.plannerFolder || "Planner";
		await openDateNoteOp(this.app, this.leaf, folder, year, month, day);
	}

	openCreateFileModal(bounds: SelectionBounds | null): void {
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

	private handleClipboardKeydown(e: KeyboardEvent): void {
		if (!isPrimaryMod(e) || e.shiftKey) return;
		if (shouldDeferPlannerClipboardToNative(e)) return;
		if (this.app.workspace.getActiveViewOfType(YearlyPlannerView) !== this)
			return;

		const k = e.key.toLowerCase();

		if (k === "backspace" || k === "delete") {
			if (this.clipboardSelection.size === 0) return;
			e.preventDefault();
			openPlannerClipboardSelectionTrashModal(
				this.app,
				resolveClipboardSelectionToFiles(this.app, this.clipboardSelection),
				this.clipboardSelection,
				() => this.render(),
			);
			return;
		}

		if (k === "z") {
			if (this.pasteUndoBatches.length === 0) {
				new Notice(t("plannerClipboard.undoNothing"));
				e.preventDefault();
				return;
			}
			e.preventDefault();
			const batch = this.pasteUndoBatches.pop()!;
			this.contentEl.addClass(PLANNER_CLIPBOARD_BUSY_CLASS);
			void (async () => {
				try {
					const u = await undoPlannerPasteBatch(this.app, batch);
					this.render();
					if (!u.ok) {
						this.pasteUndoBatches.push(batch);
						new Notice(
							t(u.errorKey, { path: u.path }),
							PLANNER_CLIPBOARD_ERROR_NOTICE_MS,
						);
					} else if (u.trashedCount === 0) {
						new Notice(
							t("plannerClipboard.undoMissingFiles"),
							PLANNER_CLIPBOARD_ERROR_NOTICE_MS,
						);
					} else {
						new Notice(
							t("plannerClipboard.undoSuccess", {
								count: u.trashedCount,
							}),
							PLANNER_CLIPBOARD_SUCCESS_NOTICE_MS,
						);
					}
				} finally {
					this.contentEl.removeClass(PLANNER_CLIPBOARD_BUSY_CLASS);
				}
			})();
			return;
		}

		if (k !== "c" && k !== "v") return;

		if (k === "c") {
			const files = resolveClipboardSelectionToFiles(
				this.app,
				this.clipboardSelection,
			);
			if (files.length === 0) {
				new Notice(t("plannerClipboard.emptyCopy"));
				e.preventDefault();
				return;
			}
			e.preventDefault();
			this.contentEl.addClass(PLANNER_CLIPBOARD_BUSY_CLASS);
			void (async () => {
				try {
					const r = await copyPlannerSelectionToClipboard(
						this.app,
						files,
					);
					if (!r.ok) {
						new Notice(
							t(r.errorKey),
							PLANNER_CLIPBOARD_ERROR_NOTICE_MS,
						);
					} else {
						new Notice(
							t("plannerClipboard.copySuccess", {
								count: r.noteCount,
							}),
							PLANNER_CLIPBOARD_SUCCESS_NOTICE_MS,
						);
					}
				} finally {
					this.contentEl.removeClass(PLANNER_CLIPBOARD_BUSY_CLASS);
				}
			})();
			return;
		}

		if (this.clipboardSelection.size === 0) return;
		e.preventDefault();
		this.contentEl.addClass(PLANNER_CLIPBOARD_BUSY_CLASS);
		void (async () => {
			try {
				const text = await navigator.clipboard.readText();
				const r = await pastePlannerClipboard(
					this.app,
					this.plugin.settings.plannerFolder || "Planner",
					text,
					this.clipboardSelection,
				);
				if (r.ok) {
					this.pasteUndoBatches.push(r.createdPaths);
					this.render();
					new Notice(
						t("plannerClipboard.pasteSuccess", {
							count: r.fileCount,
						}),
						PLANNER_CLIPBOARD_SUCCESS_NOTICE_MS,
					);
				} else {
					new Notice(t(r.errorKey), PLANNER_CLIPBOARD_ERROR_NOTICE_MS);
				}
			} catch {
				new Notice(
					t("plannerClipboard.pasteReadFailed"),
					PLANNER_CLIPBOARD_ERROR_NOTICE_MS,
				);
			} finally {
				this.contentEl.removeClass(PLANNER_CLIPBOARD_BUSY_CLASS);
			}
		})();
	}
}
