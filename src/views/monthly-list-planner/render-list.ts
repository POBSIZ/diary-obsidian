import { App } from "obsidian";
import {
	TODO_CHIP_EMOJI_COMPLETED,
	TODO_CHIP_EMOJI_INCOMPLETE,
	WEEKEND_LABELS_EN,
	WEEKEND_LABELS_KO,
} from "../../constants";
import { t } from "../../i18n";
import { getDayOfWeek, getDaysInMonth } from "../../utils/date";
import type { HolidayData } from "../../utils/holidays";
import {
	getFileTitle,
	getFilesForDate,
	getChipColor,
	isTodoCompleted,
	isTodoFile,
} from "../yearly-planner/file-utils";
import { getWeekdayLabels } from "../monthly-planner/render";

export function renderMonthlyListBody(
	parent: HTMLElement,
	ctx: {
		year: number;
		month: number;
		app: App;
		locale: string;
		holidaysData: HolidayData | null;
	},
): void {
	const { year, month, app, locale, holidaysData } = ctx;
	const daysInMonth = getDaysInMonth(year, month);
	const weekdayShort = getWeekdayLabels(locale);
	const weekendL = locale === "ko" ? WEEKEND_LABELS_KO : WEEKEND_LABELS_EN;
	const now = new Date();

	for (let day = 1; day <= daysInMonth; day++) {
		const dayOfWeek = getDayOfWeek(year, month, day);
		const wk = weekdayShort[dayOfWeek];
		const isSaturday = dayOfWeek === 6;
		const isSunday = dayOfWeek === 0;
		const isToday =
			year === now.getFullYear() &&
			month === now.getMonth() + 1 &&
			day === now.getDate();

		const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		const isHoliday = holidaysData?.dates.has(dateKey) ?? false;

		const { singleFiles, rangeFiles } = getFilesForDate(app, year, month, day);

		const dayBlock = parent.createDiv({
			cls: [
				"monthly-list-planner-day",
				isToday && "monthly-list-planner-day-today",
				isHoliday && "monthly-list-planner-day-holiday",
				isSaturday && "monthly-list-planner-day-sat",
				isSunday && "monthly-list-planner-day-sun",
			]
				.filter(Boolean)
				.join(" "),
		});
		dayBlock.dataset.year = String(year);
		dayBlock.dataset.month = String(month);
		dayBlock.dataset.day = String(day);

		const head = dayBlock.createDiv({ cls: "monthly-list-planner-day-header" });
		const dateLine = head.createDiv({ cls: "monthly-list-planner-day-date-line" });
		dateLine.createSpan({
			cls: "monthly-list-planner-day-num",
			text: String(day),
		});
		dateLine.createSpan({
			cls: "monthly-list-planner-day-weekday",
			text: wk,
		});
		if (isSaturday || isSunday) {
			dateLine.createSpan({
				cls: "monthly-list-planner-weekend-label",
				text: isSaturday ? weekendL.sat : weekendL.sun,
			});
		}

		const body = dayBlock.createDiv({ cls: "monthly-list-planner-day-body" });

		if (rangeFiles.length > 0) {
			const rangeWrap = body.createDiv({ cls: "monthly-list-planner-ranges" });
			for (const { file, runPos, isFirst } of rangeFiles) {
				const barClasses = [
					"monthly-planner-range-bar",
					"monthly-list-planner-range-bar",
					runPos.runStart && "monthly-planner-range-run-start",
					runPos.runEnd && "monthly-planner-range-run-end",
					!runPos.runStart &&
						!runPos.runEnd &&
						"monthly-planner-range-run-mid",
				]
					.filter(Boolean)
					.join(" ");
				const barEl = rangeWrap.createDiv({ cls: barClasses });
				barEl.dataset.path = file.path;
				const chipColor = getChipColor(app, file);
				if (chipColor) {
					barEl.style.setProperty("--range-color", chipColor);
				}
				if (isFirst) {
					const title = getFileTitle(app, file);
					const displayTitle = isTodoCompleted(app, file)
						? `${TODO_CHIP_EMOJI_COMPLETED} ${title}`
						: isTodoFile(app, file)
							? `${TODO_CHIP_EMOJI_INCOMPLETE} ${title}`
							: title;
					const labelEl = barEl.createSpan({
						cls: "monthly-planner-range-label",
						text: displayTitle,
					});
					if (isTodoCompleted(app, file)) {
						labelEl.addClass("monthly-planner-chip-completed");
					}
				}
			}
		}

		if (singleFiles.length > 0) {
			const listEl = body.createDiv({ cls: "monthly-list-planner-files" });
			for (const file of singleFiles) {
				const linkEl = listEl.createEl("div", {
					cls: "monthly-planner-cell-file monthly-list-planner-cell-file",
				});
				const title = getFileTitle(app, file);
				if (isTodoCompleted(app, file)) {
					linkEl.addClass("monthly-planner-chip-completed");
					linkEl.textContent = `${TODO_CHIP_EMOJI_COMPLETED} ${title}`;
				} else if (isTodoFile(app, file)) {
					linkEl.textContent = `${TODO_CHIP_EMOJI_INCOMPLETE} ${title}`;
				} else {
					linkEl.textContent = title;
				}
				linkEl.title = file.path;
				linkEl.dataset.path = file.path;
				const chipColor = getChipColor(app, file);
				if (chipColor) {
					linkEl.style.borderLeftColor = chipColor;
				}
			}
		}

		if (isHoliday && holidaysData?.names.has(dateKey)) {
			const holidayNames = holidaysData.names.get(dateKey) ?? [];
			const holidaysContainer = body.createDiv({
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

		const hasHolidayLine =
			isHoliday && (holidaysData?.names.get(dateKey)?.length ?? 0) > 0;
		if (
			rangeFiles.length === 0 &&
			singleFiles.length === 0 &&
			!hasHolidayLine
		) {
			body.createDiv({
				cls: "monthly-list-planner-empty",
				text: t("view.monthlyListEmptyDay"),
			});
		}
	}
}
