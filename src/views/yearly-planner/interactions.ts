import { App, Platform, TFile, WorkspaceLeaf } from "obsidian";
import {
	getTopmostPlannerElementAt,
	getCellAtClientPos,
} from "./dom";
import {
	getSelectionBounds,
	countSelectionCells,
	isDateInSelection,
} from "./selection";
import { CreateRangeModal, HolidayInfoModal } from "./modals";
import type { DragState } from "./types";

export interface YearlyPlannerViewDelegate {
	readonly contentEl: HTMLElement;
	readonly app: App;
	readonly leaf: WorkspaceLeaf;
	dragState: DragState | null;
	render(): void;
	openDateNote(year: number, month: number, day: number): Promise<void>;
	createRangeFile(
		startYear: number,
		startMonth: number,
		startDay: number,
		endYear: number,
		endMonth: number,
		endDay: number,
	): Promise<TFile>;
	getRangeFilePath(
		startYear: number,
		startMonth: number,
		startDay: number,
		endYear: number,
		endMonth: number,
		endDay: number,
	): string;
}

export class PlannerInteractionHandler {
	private view: YearlyPlannerViewDelegate;
	private boundHandleMouseMove: (e: MouseEvent) => void;
	private boundHandleMouseUp: () => void;
	private boundHandleTouchMove: (e: TouchEvent) => void;
	private boundHandleTouchEnd: () => void;

	constructor(view: YearlyPlannerViewDelegate) {
		this.view = view;
		this.boundHandleMouseMove = this.handleMouseMove.bind(this);
		this.boundHandleMouseUp = this.handleMouseUp.bind(this);
		this.boundHandleTouchMove = this.handleTouchMove.bind(this);
		this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
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
		const el = getTopmostPlannerElementAt(
			this.view.contentEl,
			clientX,
			clientY,
		);
		if (!el || !this.view.contentEl.contains(el as Node)) return;

		const rangeBar = (el as HTMLElement).closest?.(
			".yearly-planner-range-bar[data-path]",
		);
		if (rangeBar) {
			const path = (rangeBar as HTMLElement).dataset.path;
			if (path) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation?.();
				const file = this.view.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					void this.view.leaf.openFile(file);
				}
			}
			return;
		}

		const holidayBadge = (el as HTMLElement).closest?.(
			".yearly-planner-cell-holiday-badge",
		);
		if (holidayBadge) {
			const dateStr = (holidayBadge as HTMLElement).dataset.holidayDate;
			const namesJson = (holidayBadge as HTMLElement).dataset.holidayNames;
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
		if (cellFile) {
			const path = (cellFile as HTMLElement).dataset.path;
			if (path) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation?.();
				const file = this.view.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					void this.view.leaf.openFile(file);
				}
			}
			return;
		}

		const cell = (el as HTMLElement).closest?.(
			"td[data-year][data-month][data-day]:not(.yearly-planner-cell-invalid)",
		);
		if (cell) {
			if (Platform.isMobile) return;
			const year = parseInt(
				(cell as HTMLElement).dataset.year ?? "",
				10,
			);
			const month = parseInt(
				(cell as HTMLElement).dataset.month ?? "",
				10,
			);
			const day = parseInt((cell as HTMLElement).dataset.day ?? "", 10);
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation?.();
			if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
				void this.view.openDateNote(year, month, day);
			}
		}
	}

	handlePlannerMouseDown(e: MouseEvent): void {
		if (!Platform.isMobile) {
			this.maybeStartDrag(e.clientX, e.clientY, e);
		}
	}

	handlePlannerTouchStart(e: TouchEvent): void {
		if (Platform.isMobile) return;
		const t = e.touches[0];
		if (e.touches.length === 1 && t) {
			this.maybeStartDrag(t.clientX, t.clientY, e as unknown as MouseEvent);
		}
	}

	handlePlannerTouchEnd(e: TouchEvent): void {
		if (this.view.dragState) return;
		const t = e.changedTouches[0];
		if (!t) return;
		e.preventDefault();
		this.handlePlannerClickAt(t.clientX, t.clientY, e as unknown as MouseEvent);
	}

	maybeStartDrag(clientX: number, clientY: number, e: MouseEvent): void {
		const el = getTopmostPlannerElementAt(
			this.view.contentEl,
			clientX,
			clientY,
		);
		if (!el || !this.view.contentEl.contains(el as Node)) return;

		const onInteractive =
			(el as HTMLElement).closest?.(".yearly-planner-cell-file") ||
			(el as HTMLElement).closest?.(".yearly-planner-range-bar") ||
			(el as HTMLElement).closest?.(".yearly-planner-cell-holiday-badge");
		if (onInteractive) return;

		const cell = (el as HTMLElement).closest?.(
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
			const day = parseInt((cell as HTMLElement).dataset.day ?? "", 10);
			if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
				e.preventDefault();
				this.handleDragStart(e, year, month, day);
			}
		}
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
		const { startYear, startMonth, startDay } = this.view.dragState;
		this.view.dragState = null;
		this.view.render();

		if (count <= 1 || !bounds) {
			if (count === 1) {
				void this.view.openDateNote(startYear, startMonth, startDay);
			}
			return;
		}

		new CreateRangeModal(
			this.view.app,
			bounds,
			this.view.createRangeFile.bind(this.view),
			() => this.view.render(),
		).open();
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
	}
}
