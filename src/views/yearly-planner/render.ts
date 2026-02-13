import { App, setIcon } from "obsidian";
import { t } from "../../i18n";
import {
	MONTH_LABELS_KO,
	MONTH_LABELS_EN,
	WEEKEND_LABELS_KO,
	WEEKEND_LABELS_EN,
} from "../../constants";
import { getDaysInMonth, getDayOfWeek } from "../../utils/date";
import type { DragState } from "./types";
import type { HolidayData } from "../../utils/holidays";
import { YearInputModal } from "./modals";
import { getFilesForDate, getFileTitle, getChipColor } from "./file-utils";
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
	holidaysData: HolidayData | null;
	locale: string;
	rangeStackMap: Map<string, number>;
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

	if (rangeFiles.length > 0 && singleFiles.length > 0) {
		cell.dataset.hasBoth = "true";
	}
	if (isHoliday && ctx.holidaysData?.names.has(dateKey)) {
		cell.dataset.hasHoliday = "true";
	}

	if (rangeFiles.length > 0) {
		rangeFiles.forEach(({ file, runPos, isFirst }) => {
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
			const chipColor = getChipColor(ctx.app, file);
			if (chipColor) {
				barEl.style.setProperty("--range-color", chipColor);
			}
			if (isFirst) {
				barEl.createSpan({
					cls: "yearly-planner-range-label",
					text: getFileTitle(ctx.app, file),
				});
			}
		});
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
			const chipColor = getChipColor(ctx.app, file);
			if (chipColor) {
				linkEl.style.borderLeftColor = chipColor;
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
