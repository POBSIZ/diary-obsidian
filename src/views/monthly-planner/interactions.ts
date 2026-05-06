import { App, Notice, Platform, TFile, WorkspaceLeaf } from "obsidian";
import {
	getTopmostMonthlyElementAt,
	getMonthlyCellAtClientPos,
	getChipOrBarAt,
} from "./dom";
import { applyClipboardModifierClick, isPrimaryMod } from "../planner-clipboard";
import {
	getSelectionBounds,
	countSelectionCells,
	isDateInSelection,
} from "../yearly-planner/selection";
import { HolidayInfoModal } from "../yearly-planner/modals";
import { moveFileToDate } from "../yearly-planner/file-operations";
import { t } from "../../i18n";
import type {
	ChipDragState,
	DragState,
	SelectionBounds,
} from "../yearly-planner/types";

const DRAG_THRESHOLD = 8;

export interface MonthlyPlannerViewDelegate {
	readonly contentEl: HTMLElement;
	readonly app: App;
	readonly leaf: WorkspaceLeaf;
	dragState: DragState | null;
	chipDragState: ChipDragState | null;
	clipboardSelection: Set<string>;
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

export class MonthlyInteractionHandler {
	private view: MonthlyPlannerViewDelegate;
	private boundHandleMouseMove: (e: MouseEvent) => void;
	private boundHandleMouseUp: () => void;
	private boundHandleTouchMove: (e: TouchEvent) => void;
	private boundHandleTouchEnd: () => void;
	private boundHandleChipMouseMove: (e: MouseEvent) => void;
	private boundHandleChipMouseUp: (e: MouseEvent) => void;
	private touchStartPos: { x: number; y: number } | null = null;
	private chipDragPending: ChipDragPending | null = null;
	private chipDragJustEnded = false;

	constructor(view: MonthlyPlannerViewDelegate) {
		this.view = view;
		this.boundHandleMouseMove = this.handleMouseMove.bind(this);
		this.boundHandleMouseUp = this.handleMouseUp.bind(this);
		this.boundHandleTouchMove = this.handleTouchMove.bind(this);
		this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
		this.boundHandleChipMouseMove = this.handleChipMouseMove.bind(this);
		this.boundHandleChipMouseUp = this.handleChipMouseUp.bind(this);
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
		if (
			applyClipboardModifierClick({
				contentEl: this.view.contentEl,
				clientX,
				clientY,
				e,
				topmostAt: (cx, cy) =>
					getTopmostMonthlyElementAt(this.view.contentEl, cx, cy),
				chipBarSelector:
					".monthly-planner-cell-file[data-path], .monthly-planner-range-bar[data-path]",
				cellSelector:
					"td[data-year][data-month][data-day]:not(.monthly-planner-cell-invalid)",
				selection: this.view.clipboardSelection,
				rerender: () => this.view.render(),
			})
		) {
			return;
		}
		const el = getTopmostMonthlyElementAt(
			this.view.contentEl,
			clientX,
			clientY,
		);
		if (!el || !this.view.contentEl.contains(el as Node)) return;

		const rangeBar = (el as HTMLElement).closest?.(
			".monthly-planner-range-bar[data-path]",
		);
		if (rangeBar) {
			const path = (rangeBar as HTMLElement).dataset.path;
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

		const holidayBadge = (el as HTMLElement).closest?.(
			".monthly-planner-cell-holiday-badge",
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
			".monthly-planner-cell-file[data-path]",
		);
		if (cellFile) {
			const path = (cellFile as HTMLElement).dataset.path;
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
			"td[data-year][data-month][data-day]:not(.monthly-planner-cell-invalid)",
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
		if (this.view.dragState || this.view.chipDragState) return;
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
		if (isPrimaryMod(e)) return;
		const el = getTopmostMonthlyElementAt(
			this.view.contentEl,
			clientX,
			clientY,
		);
		if (!el || !this.view.contentEl.contains(el as Node)) return;

		const onHoliday = (el as HTMLElement).closest?.(
			".monthly-planner-cell-holiday-badge",
		);
		if (onHoliday) return;

		const chipOrBar = getChipOrBarAt(this.view.contentEl, clientX, clientY);
		if (chipOrBar && Platform.isDesktop) {
			const path = chipOrBar.dataset.path;
			if (path) {
				const file = this.view.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					const cell = chipOrBar.closest?.(
						"td[data-year][data-month][data-day]:not(.monthly-planner-cell-invalid)",
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
			"td[data-year][data-month][data-day]:not(.monthly-planner-cell-invalid)",
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
			const cell = getMonthlyCellAtClientPos(e.clientX, e.clientY);
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
		const cell = getMonthlyCellAtClientPos(e.clientX, e.clientY);
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
		const cell = getMonthlyCellAtClientPos(t.clientX, t.clientY);
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
			"td[data-year][data-month][data-day]:not(.monthly-planner-cell-invalid)",
		);
		for (const cell of Array.from(cells)) {
			const year = parseInt(cell.getAttribute("data-year") ?? "", 10);
			const month = parseInt(cell.getAttribute("data-month") ?? "", 10);
			const day = parseInt(cell.getAttribute("data-day") ?? "", 10);
			if (isDateInSelection(year, month, day, this.view.dragState)) {
				cell.addClass("monthly-planner-cell-selected");
			} else {
				cell.removeClass("monthly-planner-cell-selected");
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

	handleRangeBarMouseOver(e: MouseEvent): void {
		const el = (e.target as HTMLElement).closest?.(
			".monthly-planner-range-bar[data-path]",
		);
		if (!el || !this.view.contentEl.contains(el)) return;
		const path = (el as HTMLElement).dataset.path;
		if (!path) return;
		const bars = this.view.contentEl.querySelectorAll(
			".monthly-planner-range-bar[data-path]",
		);
		for (const bar of Array.from(bars)) {
			if ((bar as HTMLElement).dataset.path === path) {
				bar.addClass("monthly-planner-range-bar-highlighted");
			}
		}
	}

	handleRangeBarMouseOut(e: MouseEvent): void {
		const el = (e.target as HTMLElement).closest?.(
			".monthly-planner-range-bar[data-path]",
		);
		if (!el) return;
		const path = (el as HTMLElement).dataset.path;
		const related = (e.relatedTarget as HTMLElement)?.closest?.(
			".monthly-planner-range-bar[data-path]",
		);
		if (related && (related as HTMLElement).dataset.path === path) return;
		const bars = this.view.contentEl.querySelectorAll(
			".monthly-planner-range-bar[data-path]",
		);
		for (const bar of Array.from(bars)) {
			if ((bar as HTMLElement).dataset.path === path) {
				bar.removeClass("monthly-planner-range-bar-highlighted");
			}
		}
	}
}
