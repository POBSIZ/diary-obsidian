import { App, setIcon } from "obsidian";
import { MONTH_LABELS_KO, MONTH_LABELS_EN } from "../../constants";
import { getDaysInMonth } from "../../utils/date";
import type { DragState } from "./types";
import type { HolidayData } from "../../utils/holidays";
import { YearInputModal } from "./modals";
import { getFilesForDate, getFileTitle } from "./file-utils";
import { isDateInSelection } from "./selection";

export interface HeaderCallbacks {
	onPrev: () => void;
	onNext: () => void;
	onToday: () => void;
	onYearClick: (year: number) => void;
	onAddFile?: () => void;
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
		text: "Yearly planner",
		cls: "yearly-planner-title",
	});

	const yearWrapper = header.createDiv({
		cls: "yearly-planner-year-wrapper",
	});

	const prevBtn = yearWrapper.createEl("button", {
		cls: "yearly-planner-year-btn",
	});
	setIcon(prevBtn, "chevron-left");
	prevBtn.ariaLabel = "Previous year";
	prevBtn.onclick = callbacks.onPrev;

	const yearDisplay = yearWrapper.createEl("span", {
		cls: "yearly-planner-year-display",
		text: String(ctx.year),
	});
	yearDisplay.onclick = () => {
		new YearInputModal(ctx.app, ctx.year, callbacks.onYearClick).open();
	};
	yearDisplay.title = "Click to enter year";

	const nextBtn = yearWrapper.createEl("button", {
		cls: "yearly-planner-year-btn",
	});
	setIcon(nextBtn, "chevron-right");
	nextBtn.ariaLabel = "Next year";
	nextBtn.onclick = callbacks.onNext;

	const todayBtn = yearWrapper.createEl("button", {
		cls: "yearly-planner-year-btn",
	});
	setIcon(todayBtn, "calendar");
	todayBtn.ariaLabel = "Go to current year";
	todayBtn.onclick = callbacks.onToday;

	if (callbacks.onAddFile) {
		const addFileBtn = yearWrapper.createEl("button", {
			cls: "yearly-planner-year-btn",
		});
		setIcon(addFileBtn, "file-plus");
		addFileBtn.ariaLabel = "Add file";
		addFileBtn.onclick = callbacks.onAddFile;
	}
}

export interface CreateCellContext {
	year: number;
	app: App;
	folder: string;
	rangeStackMap: Map<string, number>;
	dragState: DragState | null;
	holidaysData: HolidayData | null;
}

export function createPlannerCell(
	row: HTMLTableRowElement,
	day: number,
	month: number,
	ctx: CreateCellContext,
): HTMLTableCellElement | null {
	const daysInMonth = getDaysInMonth(ctx.year, month);
	const isValid = day <= daysInMonth;
	const isSelected = isDateInSelection(
		ctx.year,
		month,
		day,
		ctx.dragState,
	);
	const dateKey = `${ctx.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	const isHoliday = ctx.holidaysData?.dates.has(dateKey) ?? false;

	const cell = row.createEl("td", {
		cls: [
			isValid ? "" : "yearly-planner-cell-invalid",
			isSelected && "yearly-planner-cell-selected",
			isHoliday && "yearly-planner-cell-holiday",
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

	if (rangeFiles.length > 0 && singleFiles.length > 0) {
		cell.dataset.hasBoth = "true";
	}
	if (isHoliday && ctx.holidaysData?.names.has(dateKey)) {
		cell.dataset.hasHoliday = "true";
	}

	if (rangeFiles.length > 0) {
		for (const { file, runPos, isFirst } of rangeFiles) {
			const barClasses = [
				"yearly-planner-range-bar",
				runPos.runStart && "yearly-planner-range-run-start",
				runPos.runEnd && "yearly-planner-range-run-end",
				!runPos.runStart &&
					!runPos.runEnd &&
					"yearly-planner-range-run-mid",
			]
				.filter(Boolean)
				.join(" ");
			const barEl = cell.createDiv({ cls: barClasses });
			const stackIdx = ctx.rangeStackMap.get(file.basename) ?? 0;
			barEl.dataset.rangeStack = String(Math.min(stackIdx, 9));
			barEl.dataset.path = file.path;
			if (isFirst) {
				barEl.createSpan({
					cls: "yearly-planner-range-label",
					text: getFileTitle(ctx.app, file),
				});
			}
		}
	}

	if (singleFiles.length > 0) {
		const listEl = cell.createDiv({ cls: "yearly-planner-cell-files" });
		for (const file of singleFiles) {
			const linkEl = listEl.createEl("div", {
				cls: "yearly-planner-cell-file",
			});
			linkEl.textContent = getFileTitle(ctx.app, file);
			linkEl.title = file.path;
			linkEl.dataset.path = file.path;
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

	return cell;
}

export function getMonthLabels(monthLabelsSetting: string): readonly string[] {
	return monthLabelsSetting === "korean"
		? [...MONTH_LABELS_KO]
		: [...MONTH_LABELS_EN];
}
