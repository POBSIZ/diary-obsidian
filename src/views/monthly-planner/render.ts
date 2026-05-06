import { App, setIcon } from "obsidian";
import { t } from "../../i18n";
import {
	MONTH_LABELS_KO,
	MONTH_LABELS_EN,
	WEEKDAY_LABELS_KO,
	WEEKDAY_LABELS_EN,
	WEEKEND_LABELS_KO,
	WEEKEND_LABELS_EN,
	TODO_CHIP_EMOJI_COMPLETED,
	TODO_CHIP_EMOJI_INCOMPLETE,
} from "../../constants";
import { getDayOfWeek } from "../../utils/date";
import type { ChipDragState, DragState } from "../yearly-planner/types";
import type { HolidayData } from "../../utils/holidays";
import {
	getFilesForDate,
	getFileTitle,
	getChipColor,
	isTodoCompleted,
	isTodoFile,
} from "../yearly-planner/file-utils";
import { isDateInSelection } from "../yearly-planner/selection";
import {
	makeDateSelectionKey,
	makeFileSelectionKey,
} from "../planner-clipboard";
import type { CalendarCell } from "../../utils/date";
import { MonthYearInputModal } from "./modals";

export interface MonthlyHeaderCallbacks {
	onPrev: () => void;
	onNext: () => void;
	onToday: () => void;
	onMonthYearClick: (year: number, month: number) => void;
	onAddFile?: () => void;
	onResetZoom?: () => void;
	/** Yearly → monthly grid → list → yearly */
	onCyclePlannerView?: () => void;
}

export function renderMonthlyPlannerHeader(
	contentEl: HTMLElement,
	ctx: {
		year: number;
		month: number;
		monthLabel: string;
		app: App;
		/** Overrides default monthly planner title (e.g. list view) */
		viewTitle?: string;
	},
	callbacks: MonthlyHeaderCallbacks,
): void {
	const header = contentEl.createDiv({ cls: "monthly-planner-header" });
	header.createEl("h1", {
		text: ctx.viewTitle ?? t("view.monthlyTitle"),
		cls: "monthly-planner-title",
	});

	const navWrapper = header.createDiv({
		cls: "monthly-planner-nav-wrapper",
	});

	const prevBtn = navWrapper.createEl("button", {
		cls: "monthly-planner-nav-btn",
	});
	setIcon(prevBtn, "chevron-left");
	prevBtn.ariaLabel = t("header.prevMonth");
	prevBtn.onclick = callbacks.onPrev;

	const monthYearDisplay = navWrapper.createEl("span", {
		cls: "monthly-planner-month-year-display",
		text: `${ctx.monthLabel} ${ctx.year}`,
	});
	monthYearDisplay.onclick = () => {
		new MonthYearInputModal(
			ctx.app,
			ctx.year,
			ctx.month,
			callbacks.onMonthYearClick,
		).open();
	};
	monthYearDisplay.title = t("header.clickToEnterMonthYear");

	const nextBtn = navWrapper.createEl("button", {
		cls: "monthly-planner-nav-btn",
	});
	setIcon(nextBtn, "chevron-right");
	nextBtn.ariaLabel = t("header.nextMonth");
	nextBtn.onclick = callbacks.onNext;

	const todayBtn = navWrapper.createEl("button", {
		cls: "monthly-planner-nav-btn",
	});
	setIcon(todayBtn, "calendar");
	todayBtn.ariaLabel = t("header.goToCurrentMonth");
	todayBtn.onclick = callbacks.onToday;

	if (callbacks.onCyclePlannerView) {
		const cycleBtn = navWrapper.createEl("button", {
			cls: "monthly-planner-nav-btn monthly-planner-nav-btn--cycle-view",
		});
		setIcon(cycleBtn, "repeat");
		cycleBtn.ariaLabel = t("header.cyclePlannerView");
		cycleBtn.title = t("header.cyclePlannerViewHint");
		cycleBtn.onclick = callbacks.onCyclePlannerView;
	}

	if (callbacks.onAddFile) {
		const addFileBtn = navWrapper.createEl("button", {
			cls: "monthly-planner-nav-btn",
		});
		setIcon(addFileBtn, "file-plus");
		addFileBtn.ariaLabel = t("header.addFile");
		addFileBtn.onclick = callbacks.onAddFile;
	}

	if (callbacks.onResetZoom) {
		const resetZoomBtn = navWrapper.createEl("button", {
			cls: "monthly-planner-nav-btn monthly-planner-reset-zoom-btn",
		});
		setIcon(resetZoomBtn, "rotate-ccw");
		resetZoomBtn.ariaLabel = t("header.resetZoom");
		resetZoomBtn.onclick = callbacks.onResetZoom;
	}
}

export interface CreateMonthlyCellContext {
	app: App;
	folder: string;
	dragState: DragState | null;
	chipDragState: ChipDragState | null;
	clipboardSelection: Set<string>;
	holidaysData: HolidayData | null;
	locale: string;
	rangeLaneMap: Map<string, number>;
}

export function createMonthlyCell(
	cellData: CalendarCell | null,
	ctx: CreateMonthlyCellContext,
): HTMLTableCellElement {
	const cell = document.createElement("td");

	if (!cellData) {
		cell.addClass("monthly-planner-cell-invalid");
		cell.createDiv({ cls: "monthly-planner-cell-inner" });
		return cell;
	}

	const { year, month, day } = cellData;
	const isSelected = isDateInSelection(year, month, day, ctx.dragState);
	const isDropTarget =
		ctx.chipDragState &&
		ctx.chipDragState.currentYear === year &&
		ctx.chipDragState.currentMonth === month &&
		ctx.chipDragState.currentDay === day;
	const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	const isClipboardDate = ctx.clipboardSelection.has(
		makeDateSelectionKey(dateKey),
	);
	const isHoliday = ctx.holidaysData?.dates.has(dateKey) ?? false;
	const dayOfWeek = getDayOfWeek(year, month, day);
	const isSaturday = dayOfWeek === 6;
	const isSunday = dayOfWeek === 0;
	const now = new Date();
	const isToday =
		year === now.getFullYear() &&
		month === now.getMonth() + 1 &&
		day === now.getDate();

	cell.className = [
		"monthly-planner-cell",
		isSelected && "monthly-planner-cell-selected",
		isClipboardDate && "monthly-planner-cell-clipboard-selected",
		isDropTarget && "monthly-planner-cell-drop-target",
		isHoliday && "monthly-planner-cell-holiday",
		isSaturday && "monthly-planner-cell-saturday",
		isSunday && "monthly-planner-cell-sunday",
		isToday && "monthly-planner-cell-today",
	]
		.filter(Boolean)
		.join(" ");

	cell.dataset.year = String(year);
	cell.dataset.month = String(month);
	cell.dataset.day = String(day);

	const inner = cell.createDiv({ cls: "monthly-planner-cell-inner" });
	const dayNumEl = inner.createDiv({ cls: "monthly-planner-cell-day" });
	dayNumEl.textContent = String(day);

	const { singleFiles, rangeFiles } = getFilesForDate(
		ctx.app,
		year,
		month,
		day,
	);

	if (rangeFiles.length > 0 && singleFiles.length > 0) {
		cell.dataset.hasBoth = "true";
	}
	if (isHoliday && ctx.holidaysData?.names.has(dateKey)) {
		cell.dataset.hasHoliday = "true";
	}

	/* Range bars: lane index from getRangeLaneMap (overlap-based, same as yearly); data-range-stack holds lane 0–9 */
	if (rangeFiles.length > 0) {
		const rangeContainer = inner.createDiv({
			cls: "monthly-planner-range-bars",
		});
		const laneIndices = rangeFiles.map(
			({ file }) => ctx.rangeLaneMap.get(file.basename) ?? 0,
		);
		const maxLane = Math.max(0, ...laneIndices);
		const requiredSlots = maxLane + 1;
		rangeContainer.dataset.rangeCount = String(
			Math.min(Math.max(requiredSlots, rangeFiles.length), 10),
		);
		rangeFiles.forEach(({ file, runPos, isFirst }) => {
			const barClasses = [
				"monthly-planner-range-bar",
				runPos.runStart && "monthly-planner-range-run-start",
				runPos.runEnd && "monthly-planner-range-run-end",
				!runPos.runStart &&
					!runPos.runEnd &&
					"monthly-planner-range-run-mid",
			]
				.filter(Boolean)
				.join(" ");
			const barEl = rangeContainer.createDiv({ cls: barClasses });
			const laneIdx = ctx.rangeLaneMap.get(file.basename) ?? 0;
			barEl.dataset.rangeStack = String(Math.min(laneIdx, 9));
			barEl.dataset.path = file.path;
			const chipColor = getChipColor(ctx.app, file);
			if (chipColor) {
				barEl.style.setProperty("--range-color", chipColor);
			}
			if (ctx.clipboardSelection.has(makeFileSelectionKey(file.path))) {
				barEl.addClass("monthly-planner-cell-clipboard-selected");
			}
			if (isFirst) {
				const title = getFileTitle(ctx.app, file);
				const displayTitle = isTodoCompleted(ctx.app, file)
					? `${TODO_CHIP_EMOJI_COMPLETED} ${title}`
					: isTodoFile(ctx.app, file)
						? `${TODO_CHIP_EMOJI_INCOMPLETE} ${title}`
						: title;
				const labelEl = barEl.createSpan({
					cls: "monthly-planner-range-label",
					text: displayTitle,
				});
				if (isTodoCompleted(ctx.app, file)) {
					labelEl.addClass("monthly-planner-chip-completed");
				}
			}
		});
	}

	if (singleFiles.length > 0) {
		const listEl = inner.createDiv({ cls: "monthly-planner-cell-files" });
		for (const file of singleFiles) {
			const linkEl = listEl.createEl("div", {
				cls: "monthly-planner-cell-file",
			});
			const title = getFileTitle(ctx.app, file);
			if (isTodoCompleted(ctx.app, file)) {
				linkEl.addClass("monthly-planner-chip-completed");
				linkEl.textContent = `${TODO_CHIP_EMOJI_COMPLETED} ${title}`;
			} else if (isTodoFile(ctx.app, file)) {
				linkEl.textContent = `${TODO_CHIP_EMOJI_INCOMPLETE} ${title}`;
			} else {
				linkEl.textContent = title;
			}
			linkEl.title = file.path;
			linkEl.dataset.path = file.path;
			const chipColor = getChipColor(ctx.app, file);
			if (chipColor) {
				linkEl.style.borderLeftColor = chipColor;
			}
			if (ctx.clipboardSelection.has(makeFileSelectionKey(file.path))) {
				linkEl.addClass("monthly-planner-cell-clipboard-selected");
			}
		}
	}

	if (isHoliday && ctx.holidaysData?.names.has(dateKey)) {
		const holidayNames = ctx.holidaysData.names.get(dateKey) ?? [];
		const holidaysContainer = inner.createDiv({
			cls: "monthly-planner-cell-holidays",
		});
		const badge = holidaysContainer.createDiv({
			cls: "monthly-planner-cell-holiday-badge",
		});
		badge.createSpan({
			cls: "monthly-planner-holiday-label",
			text: holidayNames.join(", "),
		});
		badge.dataset.holidayDate = dateKey;
		badge.dataset.holidayNames = JSON.stringify(holidayNames);
	}

	if (isSaturday || isSunday) {
		const weekendLabels =
			ctx.locale === "ko" ? WEEKEND_LABELS_KO : WEEKEND_LABELS_EN;
		const label = isSaturday ? weekendLabels.sat : weekendLabels.sun;
		const labelEl = inner.createSpan({
			cls: "monthly-planner-weekend-label",
			text: label,
		});
		labelEl.dataset.weekend = isSaturday ? "sat" : "sun";
	}

	return cell;
}

export function getMonthLabel(locale: string, month: number): string {
	const labels = locale === "ko" ? MONTH_LABELS_KO : MONTH_LABELS_EN;
	return labels[month - 1] ?? String(month);
}

export function getWeekdayLabels(locale: string): readonly string[] {
	return locale === "ko" ? [...WEEKDAY_LABELS_KO] : [...WEEKDAY_LABELS_EN];
}
