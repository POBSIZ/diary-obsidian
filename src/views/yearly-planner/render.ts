import { App, setIcon } from "obsidian";
import { t } from "../../i18n";
import {
	MONTH_LABELS_KO,
	MONTH_LABELS_EN,
	WEEKEND_LABELS_KO,
	WEEKEND_LABELS_EN,
	TODO_CHIP_EMOJI_COMPLETED,
	TODO_CHIP_EMOJI_INCOMPLETE,
} from "../../constants";
import { getDaysInMonth, getDayOfWeek } from "../../utils/date";
import type { ChipDragState, DragState } from "./types";
import type { HolidayData } from "../../utils/holidays";
import { YearInputModal } from "./modals";
import {
	getFilesForDate,
	getFileTitle,
	getChipColor,
	isTodoCompleted,
	isTodoFile,
} from "./file-utils";
import { parseRangeBasename } from "../../utils/range";
import { isDateInSelection } from "./selection";

export interface HeaderCallbacks {
	onPrev: () => void;
	onNext: () => void;
	onToday: () => void;
	onYearClick: (year: number) => void;
	onAddFile?: () => void;
	onSwitchToMonthly?: () => void;
}

export function renderYearlyPlannerHeader(
	contentEl: HTMLElement,
	ctx: {
		year: number;
		monthLabels: readonly string[];
		app: App;
	},
	callbacks: HeaderCallbacks,
): void {
	const header = contentEl.createDiv({ cls: "yearly-planner-header" });
	header.createEl("h1", {
		text: t("view.title"),
		cls: "yearly-planner-title",
	});

	const yearWrapper = header.createDiv({
		cls: "yearly-planner-year-wrapper",
	});

	const prevBtn = yearWrapper.createEl("button", {
		cls: "yearly-planner-year-btn",
	});
	setIcon(prevBtn, "chevron-left");
	prevBtn.ariaLabel = t("header.prevYear");
	prevBtn.onclick = callbacks.onPrev;

	const yearDisplay = yearWrapper.createEl("span", {
		cls: "yearly-planner-year-display",
		text: String(ctx.year),
	});
	yearDisplay.onclick = () => {
		new YearInputModal(ctx.app, ctx.year, callbacks.onYearClick).open();
	};
	yearDisplay.title = t("header.clickToEnterYear");

	const nextBtn = yearWrapper.createEl("button", {
		cls: "yearly-planner-year-btn",
	});
	setIcon(nextBtn, "chevron-right");
	nextBtn.ariaLabel = t("header.nextYear");
	nextBtn.onclick = callbacks.onNext;

	const todayBtn = yearWrapper.createEl("button", {
		cls: "yearly-planner-year-btn",
	});
	setIcon(todayBtn, "calendar");
	todayBtn.ariaLabel = t("header.goToCurrentYear");
	todayBtn.onclick = callbacks.onToday;

	if (callbacks.onSwitchToMonthly) {
		const monthBtn = yearWrapper.createEl("button", {
			cls: "yearly-planner-year-btn",
		});
		setIcon(monthBtn, "calendar-days");
		monthBtn.ariaLabel = t("header.switchToMonthly");
		monthBtn.onclick = callbacks.onSwitchToMonthly;
	}

	if (callbacks.onAddFile) {
		const addFileBtn = yearWrapper.createEl("button", {
			cls: "yearly-planner-year-btn",
		});
		setIcon(addFileBtn, "file-plus");
		addFileBtn.ariaLabel = t("header.addFile");
		addFileBtn.onclick = callbacks.onAddFile;
	}
}

export interface CreateCellContext {
	year: number;
	app: App;
	folder: string;
	dragState: DragState | null;
	chipDragState: ChipDragState | null;
	holidaysData: HolidayData | null;
	locale: string;
	rangeLaneMap: Map<string, number>;
}

export function createPlannerCell(
	row: HTMLTableRowElement,
	day: number,
	month: number,
	ctx: CreateCellContext,
): HTMLTableCellElement | null {
	const daysInMonth = getDaysInMonth(ctx.year, month);
	const isValid = day <= daysInMonth;
	const isSelected = isDateInSelection(ctx.year, month, day, ctx.dragState);
	const isDropTarget =
		ctx.chipDragState &&
		ctx.chipDragState.currentYear === ctx.year &&
		ctx.chipDragState.currentMonth === month &&
		ctx.chipDragState.currentDay === day;
	const dateKey = `${ctx.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	const isHoliday = ctx.holidaysData?.dates.has(dateKey) ?? false;
	const dayOfWeek = getDayOfWeek(ctx.year, month, day);
	const isSaturday = dayOfWeek === 6;
	const isSunday = dayOfWeek === 0;
	const now = new Date();
	const isToday =
		isValid &&
		ctx.year === now.getFullYear() &&
		month === now.getMonth() + 1 &&
		day === now.getDate();

	const cell = row.createEl("td", {
		cls: [
			isValid ? "" : "yearly-planner-cell-invalid",
			isSelected && "yearly-planner-cell-selected",
			isDropTarget && "yearly-planner-cell-drop-target",
			isHoliday && "yearly-planner-cell-holiday",
			isSaturday && "yearly-planner-cell-saturday",
			isSunday && "yearly-planner-cell-sunday",
			isToday && "yearly-planner-cell-today",
		]
			.filter(Boolean)
			.join(" "),
	});

	if (!isValid) return null;

	cell.dataset.year = String(ctx.year);
	cell.dataset.month = String(month);
	cell.dataset.day = String(day);

	const { singleFiles, rangeFiles } = getFilesForDate(
		ctx.app,
		ctx.year,
		month,
		day,
	);

	if (rangeFiles.length > 0) {
		const basenames = rangeFiles.map((r) => r.file.basename);
		cell.dataset.rangeBasenames = basenames.join(",");
		cell.dataset.rangeLanes = rangeFiles
			.map((r) => ctx.rangeLaneMap.get(r.file.basename) ?? 0)
			.join(",");

		const barsContainer = cell.createDiv({
			cls: "yearly-planner-cell-range-bars",
		});
		for (const { file } of rangeFiles) {
			const lane = ctx.rangeLaneMap.get(file.basename) ?? 0;
			const bar = barsContainer.createDiv({
				cls: "yearly-planner-cell-range-bar",
			});
			bar.dataset.lane = String(lane);
			bar.dataset.path = file.path;
			(bar as HTMLElement).style.right = `${lane * 4}px`;
			bar.dataset.basename = file.basename;
			const chipColor = getChipColor(ctx.app, file);
			if (chipColor) {
				bar.style.borderRightColor = chipColor;
			}
		}
	}

	if (isHoliday && ctx.holidaysData?.names.has(dateKey)) {
		cell.dataset.hasHoliday = "true";
	}

	const startDateRangeFiles = rangeFiles.filter((r) => r.isFirst).map((r) => r.file);
	const allFiles = [...singleFiles, ...startDateRangeFiles];

	if (allFiles.length > 0) {
		const listEl = cell.createDiv({ cls: "yearly-planner-cell-files" });
		for (const file of allFiles) {
			const linkEl = listEl.createEl("div", {
				cls: "yearly-planner-cell-file",
			});
			const title = getFileTitle(ctx.app, file);
			if (isTodoCompleted(ctx.app, file)) {
				linkEl.addClass("yearly-planner-chip-completed");
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
			if (parseRangeBasename(file.basename)) {
				linkEl.dataset.rangeBasename = file.basename;
				if (chipColor) {
					linkEl.dataset.rangeColor = chipColor;
				}
			}
		}
	}

	if (isHoliday && ctx.holidaysData?.names.has(dateKey)) {
		const holidayNames = ctx.holidaysData.names.get(dateKey) ?? [];
		const holidaysContainer = cell.createDiv({
			cls: "yearly-planner-cell-holidays",
		});
		const badge = holidaysContainer.createDiv({
			cls: "yearly-planner-cell-holiday-badge",
		});
		badge.createSpan({
			cls: "yearly-planner-holiday-label",
			text: holidayNames.join(", "),
		});
		badge.dataset.holidayDate = dateKey;
		badge.dataset.holidayNames = JSON.stringify(holidayNames);
	}

	if (isValid && (isSaturday || isSunday)) {
		const weekendLabels =
			ctx.locale === "ko" ? WEEKEND_LABELS_KO : WEEKEND_LABELS_EN;
		const label = isSaturday ? weekendLabels.sat : weekendLabels.sun;
		const labelEl = cell.createSpan({
			cls: "yearly-planner-weekend-label",
			text: label,
		});
		labelEl.dataset.weekend = isSaturday ? "sat" : "sun";
	}

	return cell;
}

export function getMonthLabels(locale: string): readonly string[] {
	return locale === "ko" ? [...MONTH_LABELS_KO] : [...MONTH_LABELS_EN];
}
