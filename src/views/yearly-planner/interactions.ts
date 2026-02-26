import { App, Notice, Platform, TFile, WorkspaceLeaf } from "obsidian";
import {
	getTopmostPlannerElementAt,
	getCellAtClientPos,
	getChipOrBarAt,
} from "./dom";
import {
	getSelectionBounds,
	countSelectionCells,
	isDateInSelection,
} from "./selection";
import { HolidayInfoModal } from "./modals";
import { moveFileToDate } from "./file-operations";
import { t } from "../../i18n";
import type { ChipDragState, DragState, SelectionBounds } from "./types";

const DRAG_THRESHOLD = 8;

export interface YearlyPlannerViewDelegate {
	readonly contentEl: HTMLElement;
	readonly app: App;
	readonly leaf: WorkspaceLeaf;
	dragState: DragState | null;
	chipDragState: ChipDragState | null;
	render(): void;
	updateChipDragDropTarget(): void;
	openCreateFileModal(bounds: SelectionBounds | null): void;
	openFileOptionsModal(file: TFile): void;
}

interface ChipDragPending {
	file: TFile;
	startYear: number;
	startMonth: number;
	startDay: number;
	startX: number;
	startY: number;
}

export class PlannerInteractionHandler {
	private view: YearlyPlannerViewDelegate;
	private boundHandleMouseMove: (e: MouseEvent) => void;
	private boundHandleMouseUp: (e: MouseEvent) => void;
	private boundHandleTouchMove: (e: TouchEvent) => void;
	private boundHandleTouchEnd: () => void;
	private boundHandleChipMouseMove: (e: MouseEvent) => void;
	private boundHandleChipMouseUp: (e: MouseEvent) => void;
	private boundHandleRangeMouseOver: (e: MouseEvent) => void;
	private boundHandleRangeMouseOut: (e: MouseEvent) => void;
	private boundHandleRangeTouchStart: (e: TouchEvent) => void;
	private boundHandleRangeTouchMove: (e: TouchEvent) => void;
	private boundHandleRangeTouchEnd: (e: TouchEvent) => void;
	private touchStartPos: { x: number; y: number } | null = null;
	private rangeHighlightBasenames: Set<string> = new Set();
	private rangeHighlightColor: string | null = null;
	private chipDragPending: ChipDragPending | null = null;
	private chipDragJustEnded = false;

	constructor(view: YearlyPlannerViewDelegate) {
		this.view = view;
		this.boundHandleMouseMove = this.handleMouseMove.bind(this);
		this.boundHandleMouseUp = this.handleMouseUp.bind(this);
		this.boundHandleTouchMove = this.handleTouchMove.bind(this);
		this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
		this.boundHandleChipMouseMove = this.handleChipMouseMove.bind(this);
		this.boundHandleChipMouseUp = this.handleChipMouseUp.bind(this);
		this.boundHandleRangeMouseOver = this.handleRangeMouseOver.bind(this);
		this.boundHandleRangeMouseOut = this.handleRangeMouseOut.bind(this);
		this.boundHandleRangeTouchStart = this.handleRangeTouchStart.bind(this);
		this.boundHandleRangeTouchMove = this.handleRangeTouchMove.bind(this);
		this.boundHandleRangeTouchEnd = this.handleRangeTouchEnd.bind(this);
	}

	registerRangeHoverListeners(container: HTMLElement): void {
		container.addEventListener(
			"mouseover",
			this.boundHandleRangeMouseOver,
			{
				capture: true,
			},
		);
		container.addEventListener("mouseout", this.boundHandleRangeMouseOut, {
			capture: true,
		});
		if (Platform.isMobile) {
			container.addEventListener(
				"touchstart",
				this.boundHandleRangeTouchStart,
				{ capture: true, passive: true },
			);
			container.addEventListener(
				"touchmove",
				this.boundHandleRangeTouchMove,
				{ capture: true, passive: true },
			);
			container.addEventListener(
				"touchend",
				this.boundHandleRangeTouchEnd,
				{ capture: true },
			);
			container.addEventListener(
				"touchcancel",
				this.boundHandleRangeTouchEnd,
				{ capture: true },
			);
		}
	}

	private getHoverChipInfo(el: Element | null): {
		basename: string;
		color: string | null;
	} | null {
		if (!el || !this.view.contentEl.contains(el as Node)) return null;
		const chip = (el as HTMLElement).closest?.(
			".yearly-planner-cell-file[data-range-basename]",
		);
		if (!chip) return null;
		const b = (chip as HTMLElement).dataset.rangeBasename;
		if (!b) return null;
		const color = (chip as HTMLElement).dataset.rangeColor ?? null;
		return { basename: b, color };
	}

	private isOverChipWithBasename(
		el: Element | null,
		basename: string,
	): boolean {
		if (!el || !this.view.contentEl.contains(el as Node)) return false;
		const chip = (el as HTMLElement).closest?.(
			".yearly-planner-cell-file[data-range-basename]",
		);
		if (!chip) return false;
		return (chip as HTMLElement).dataset.rangeBasename === basename;
	}

	private applyRangeHighlight(info: {
		basename: string;
		color: string | null;
	}): void {
		this.rangeHighlightBasenames = new Set([info.basename]);
		this.rangeHighlightColor = info.color;
		const highlightColor = info.color ?? "var(--interactive-accent)";
		const cells = this.view.contentEl.querySelectorAll(
			"td[data-range-basenames]:not(.yearly-planner-cell-invalid)",
		);
		for (const cell of Array.from(cells)) {
			const s = (cell as HTMLElement).dataset.rangeBasenames ?? "";
			const cellBasenames = s.split(",").filter(Boolean);
			if (
				cellBasenames.some((b) => this.rangeHighlightBasenames.has(b))
			) {
				cell.addClass("yearly-planner-cell-range-highlight");
				(cell as HTMLElement).style.setProperty(
					"--yearly-planner-range-highlight-color",
					highlightColor,
				);
			}
		}
	}

	private clearRangeHighlight(): void {
		this.rangeHighlightBasenames = new Set();
		this.rangeHighlightColor = null;
		const cells = this.view.contentEl.querySelectorAll(
			".yearly-planner-cell-range-highlight",
		);
		for (const cell of Array.from(cells)) {
			(cell as HTMLElement).style.removeProperty(
				"--yearly-planner-range-highlight-color",
			);
			cell.removeClass("yearly-planner-cell-range-highlight");
		}
	}

	private handleRangeMouseOver(e: MouseEvent): void {
		const info = this.getHoverChipInfo(e.target as Element);
		if (!info) return;
		this.applyRangeHighlight(info);
	}

	private handleRangeMouseOut(e: MouseEvent): void {
		if (this.rangeHighlightBasenames.size === 0) return;
		const related = e.relatedTarget as Element | null;
		const basenames = Array.from(this.rangeHighlightBasenames);
		if (basenames.some((b) => this.isOverChipWithBasename(related, b))) {
			return;
		}
		this.clearRangeHighlight();
	}

	private handleRangeTouchStart(e: TouchEvent): void {
		const t = e.touches[0];
		if (!t) return;
		const el = document.elementFromPoint(t.clientX, t.clientY);
		const info = this.getHoverChipInfo(el);
		if (!info) return;
		this.applyRangeHighlight(info);
	}

	private handleRangeTouchMove(e: TouchEvent): void {
		if (this.rangeHighlightBasenames.size === 0) return;
		const t = e.touches[0];
		if (!t) return;
		const el = document.elementFromPoint(t.clientX, t.clientY);
		const basenames = Array.from(this.rangeHighlightBasenames);
		if (!basenames.some((b) => this.isOverChipWithBasename(el, b))) {
			this.clearRangeHighlight();
		}
	}

	private handleRangeTouchEnd(_e?: TouchEvent): void {
		this.clearRangeHighlight();
	}

	handlePlannerClick(e: MouseEvent): void {
		if (Platform.isMobile) return;
		this.handlePlannerClickAt(e.clientX, e.clientY, e);
	}

	handlePlannerClickAt(
		clientX: number,
		clientY: number,
		e: MouseEvent,
	): void {
		if (this.chipDragJustEnded) {
			this.chipDragJustEnded = false;
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		const el = getTopmostPlannerElementAt(
			this.view.contentEl,
			clientX,
			clientY,
		);
		if (!el || !this.view.contentEl.contains(el as Node)) return;

		const holidayBadge = (el as HTMLElement).closest?.(
			".yearly-planner-cell-holiday-badge",
		);
		if (holidayBadge) {
			const dateStr = (holidayBadge as HTMLElement).dataset.holidayDate;
			const namesJson = (holidayBadge as HTMLElement).dataset
				.holidayNames;
			if (dateStr) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation?.();
				let names: string[] = [];
				try {
					if (namesJson) names = JSON.parse(namesJson) as string[];
				} catch {
					// ignore
				}
				new HolidayInfoModal(this.view.app, dateStr, names).open();
			}
			return;
		}

		const cellFile = (el as HTMLElement).closest?.(
			".yearly-planner-cell-file[data-path]",
		);
		const rangeBar = (el as HTMLElement).closest?.(
			".yearly-planner-cell-range-bar[data-path]",
		);
		const chipOrBar = cellFile ?? rangeBar;
		if (chipOrBar) {
			const path = (chipOrBar as HTMLElement).dataset.path;
			if (path) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation?.();
				const file = this.view.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					this.view.openFileOptionsModal(file);
				}
			}
			return;
		}

		const cell = (el as HTMLElement).closest?.(
			"td[data-year][data-month][data-day]:not(.yearly-planner-cell-invalid)",
		);
		if (cell) {
			const year = parseInt((cell as HTMLElement).dataset.year ?? "", 10);
			const month = parseInt(
				(cell as HTMLElement).dataset.month ?? "",
				10,
			);
			const day = parseInt((cell as HTMLElement).dataset.day ?? "", 10);
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation?.();
			if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
				const bounds: SelectionBounds = {
					startYear: year,
					startMonth: month,
					startDay: day,
					endYear: year,
					endMonth: month,
					endDay: day,
				};
				this.view.openCreateFileModal(bounds);
			}
		}
	}

	handlePlannerMouseDown(e: MouseEvent): void {
		if (!Platform.isMobile) {
			this.maybeStartDrag(e.clientX, e.clientY, e);
		}
	}

	handlePlannerTouchStart(e: TouchEvent): void {
		if (e.touches.length >= 2) {
			this.touchStartPos = null;
			return;
		}
		const t = e.touches[0];
		if (e.touches.length === 1 && t) {
			if (Platform.isMobile) {
				this.touchStartPos = { x: t.clientX, y: t.clientY };
				return;
			}
			this.maybeStartDrag(
				t.clientX,
				t.clientY,
				e as unknown as MouseEvent,
			);
		}
	}

	handlePlannerTouchEnd(e: TouchEvent): void {
		if (this.view.dragState) return;
		const t = e.changedTouches[0];
		if (!t) return;

		if (Platform.isMobile) {
			if (!this.touchStartPos) return; /* Pinch or multi-touch: no tap */
			const dx = t.clientX - this.touchStartPos.x;
			const dy = t.clientY - this.touchStartPos.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			this.touchStartPos = null;
			if (dist > 15) return;
		}

		e.preventDefault();
		this.handlePlannerClickAt(
			t.clientX,
			t.clientY,
			e as unknown as MouseEvent,
		);
	}

	handlePlannerTouchCancel(): void {
		this.touchStartPos = null;
	}

	maybeStartDrag(clientX: number, clientY: number, e: MouseEvent): void {
		const el = getTopmostPlannerElementAt(
			this.view.contentEl,
			clientX,
			clientY,
		);
		const chipOrBar = getChipOrBarAt(this.view.contentEl, clientX, clientY);
		if (!el || !this.view.contentEl.contains(el as Node)) return;

		const onHoliday = (el as HTMLElement).closest?.(
			".yearly-planner-cell-holiday-badge",
		);
		if (onHoliday) return;

		if (chipOrBar && Platform.isDesktop) {
			const path = chipOrBar.dataset.path;
			if (path) {
				const file = this.view.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					const cell = chipOrBar.closest?.(
						"td[data-year][data-month][data-day]:not(.yearly-planner-cell-invalid)",
					);
					if (cell) {
						const year = parseInt(
							(cell as HTMLElement).dataset.year ?? "",
							10,
						);
						const month = parseInt(
							(cell as HTMLElement).dataset.month ?? "",
							10,
						);
						const day = parseInt(
							(cell as HTMLElement).dataset.day ?? "",
							10,
						);
						if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
							e.preventDefault();
							this.maybeStartChipDrag(
								file,
								year,
								month,
								day,
								clientX,
								clientY,
							);
						}
					}
				}
			}
			return;
		}
		if (chipOrBar) return;

		const cell = (el as HTMLElement).closest?.(
			"td[data-year][data-month][data-day]:not(.yearly-planner-cell-invalid)",
		);
		if (cell) {
			const year = parseInt((cell as HTMLElement).dataset.year ?? "", 10);
			const month = parseInt(
				(cell as HTMLElement).dataset.month ?? "",
				10,
			);
			const day = parseInt((cell as HTMLElement).dataset.day ?? "", 10);
			if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
				e.preventDefault();
				this.handleDragStart(e, year, month, day);
			}
		}
	}

	private maybeStartChipDrag(
		file: TFile,
		startYear: number,
		startMonth: number,
		startDay: number,
		startX: number,
		startY: number,
	): void {
		this.chipDragPending = {
			file,
			startYear,
			startMonth,
			startDay,
			startX,
			startY,
		};
		document.addEventListener("mousemove", this.boundHandleChipMouseMove);
		document.addEventListener("mouseup", this.boundHandleChipMouseUp);
	}

	private handleChipMouseMove(e: MouseEvent): void {
		const pending = this.chipDragPending;
		if (!pending && !this.view.chipDragState) return;

		const dx = pending ? e.clientX - pending.startX : 0;
		const dy = pending ? e.clientY - pending.startY : 0;
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (!this.view.chipDragState && pending && dist >= DRAG_THRESHOLD) {
			this.view.chipDragState = {
				file: pending.file,
				startYear: pending.startYear,
				startMonth: pending.startMonth,
				startDay: pending.startDay,
				currentYear: pending.startYear,
				currentMonth: pending.startMonth,
				currentDay: pending.startDay,
			};
			this.chipDragPending = null;
			this.view.updateChipDragDropTarget();
		}

		if (this.view.chipDragState) {
			// render() adds pointer-events:none to chips, so getCellAtClientPos hits td
			const cell = getCellAtClientPos(e.clientX, e.clientY);

			if (cell) {
				const s = this.view.chipDragState;
				const changed =
					s.currentYear !== cell.year ||
					s.currentMonth !== cell.month ||
					s.currentDay !== cell.day;
				s.currentYear = cell.year;
				s.currentMonth = cell.month;
				s.currentDay = cell.day;
				if (changed) this.view.updateChipDragDropTarget();
			}
		}
	}

	private handleChipMouseUp(e: MouseEvent): void {
		const pending = this.chipDragPending;
		this.chipDragPending = null;
		this.clearChipDragListeners();

		if (this.view.chipDragState || pending) {
			this.chipDragJustEnded = true;
			e.preventDefault();
			e.stopPropagation();
		}

		if (this.view.chipDragState) {
			void this.handleChipDragEnd(e.clientX, e.clientY);
			return;
		}

		if (pending) {
			this.view.openFileOptionsModal(pending.file);
		}
	}

	private async handleChipDragEnd(
		_clientX: number,
		_clientY: number,
	): Promise<void> {
		const state = this.view.chipDragState;
		if (!state) return;

		this.view.chipDragState = null;
		this.view.updateChipDragDropTarget();

		// Use last tracked cell during drag (more reliable than mouseup position)
		const cell = {
			year: state.currentYear,
			month: state.currentMonth,
			day: state.currentDay,
		};
		if (
			cell.year === state.startYear &&
			cell.month === state.startMonth &&
			cell.day === state.startDay
		) {
			return;
		}

		const result = await moveFileToDate(
			this.view.app,
			state.file,
			cell.year,
			cell.month,
			cell.day,
		);
		if (result) {
			this.view.render();
		} else {
			new Notice(t("chipDrag.targetExists"));
		}
	}

	clearChipDragListeners(): void {
		document.removeEventListener(
			"mousemove",
			this.boundHandleChipMouseMove,
		);
		document.removeEventListener("mouseup", this.boundHandleChipMouseUp);
	}

	private handleDragStart(
		_e: MouseEvent,
		year: number,
		month: number,
		day: number,
	): void {
		this.view.dragState = {
			startYear: year,
			startMonth: month,
			startDay: day,
			currentYear: year,
			currentMonth: month,
			currentDay: day,
		};
		document.addEventListener("mousemove", this.boundHandleMouseMove);
		document.addEventListener("mouseup", this.boundHandleMouseUp);
		document.addEventListener("touchmove", this.boundHandleTouchMove, {
			passive: false,
		});
		document.addEventListener("touchend", this.boundHandleTouchEnd);
		document.addEventListener("touchcancel", this.boundHandleTouchEnd);
		this.view.render();
	}

	private handleMouseMove(e: MouseEvent): void {
		if (!this.view.dragState) return;
		const cell = getCellAtClientPos(e.clientX, e.clientY);
		if (!cell) return;
		this.view.dragState.currentYear = cell.year;
		this.view.dragState.currentMonth = cell.month;
		this.view.dragState.currentDay = cell.day;
		this.updateSelectionHighlight();
	}

	private handleTouchMove(e: TouchEvent): void {
		const t = e.touches[0];
		if (!this.view.dragState || !t) return;
		e.preventDefault();
		const cell = getCellAtClientPos(t.clientX, t.clientY);
		if (!cell) return;
		this.view.dragState.currentYear = cell.year;
		this.view.dragState.currentMonth = cell.month;
		this.view.dragState.currentDay = cell.day;
		this.updateSelectionHighlight();
	}

	private handleMouseUp(): void {
		this.handleDragEnd();
	}

	private handleTouchEnd(): void {
		this.handleDragEnd();
	}

	private handleDragEnd(): void {
		this.clearDragListeners();
		if (!this.view.dragState) return;

		const bounds = getSelectionBounds(this.view.dragState);
		const count = countSelectionCells(bounds);
		this.view.dragState = null;
		this.view.render();

		if (count <= 1 || !bounds) {
			if (count === 1 && bounds) {
				this.view.openCreateFileModal(bounds);
			}
			return;
		}

		this.view.openCreateFileModal(bounds);
	}

	private updateSelectionHighlight(): void {
		const cells = this.view.contentEl.querySelectorAll(
			"td[data-year][data-month][data-day]:not(.yearly-planner-cell-invalid)",
		);
		for (const cell of Array.from(cells)) {
			const year = parseInt(cell.getAttribute("data-year") ?? "", 10);
			const month = parseInt(cell.getAttribute("data-month") ?? "", 10);
			const day = parseInt(cell.getAttribute("data-day") ?? "", 10);
			if (isDateInSelection(year, month, day, this.view.dragState)) {
				cell.addClass("yearly-planner-cell-selected");
			} else {
				cell.removeClass("yearly-planner-cell-selected");
			}
		}
	}

	clearDragListeners(): void {
		document.removeEventListener("mousemove", this.boundHandleMouseMove);
		document.removeEventListener("mouseup", this.boundHandleMouseUp);
		document.removeEventListener("touchmove", this.boundHandleTouchMove);
		document.removeEventListener("touchend", this.boundHandleTouchEnd);
		document.removeEventListener("touchcancel", this.boundHandleTouchEnd);
		this.clearChipDragListeners();
	}
}
