import { getDaysInMonth } from "../../utils/date";
import type { DragState, SelectionBounds } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

export function getSelectionBounds(dragState: DragState | null): SelectionBounds | null {
	if (!dragState) return null;
	const { startYear, startMonth, startDay } = dragState;
	const { currentYear, currentMonth, currentDay } = dragState;
	if (startYear !== currentYear) return null;
	const [startM, startD] =
		startMonth < currentMonth ||
		(startMonth === currentMonth && startDay <= currentDay)
			? [startMonth, startDay]
			: [currentMonth, currentDay];
	const [endM, endD] =
		startMonth < currentMonth ||
		(startMonth === currentMonth && startDay <= currentDay)
			? [currentMonth, currentDay]
			: [startMonth, startDay];
	return {
		startYear,
		startMonth: startM,
		startDay: startD,
		endYear: currentYear,
		endMonth: endM,
		endDay: endD,
	};
}

export function countSelectionCells(bounds: SelectionBounds | null): number {
	if (!bounds) return 0;
	let count = 0;
	for (let m = bounds.startMonth; m <= bounds.endMonth; m++) {
		const daysInMonth = getDaysInMonth(bounds.startYear, m);
		const firstDay = m === bounds.startMonth ? bounds.startDay : 1;
		const lastDay = m === bounds.endMonth ? bounds.endDay : daysInMonth;
		count += lastDay - firstDay + 1;
	}
	return count;
}

export function isDateInSelection(
	year: number,
	month: number,
	day: number,
	dragState: DragState | null,
): boolean {
	const b = getSelectionBounds(dragState);
	if (!b) return false;
	const dateStr = `${year}-${pad(month)}-${pad(day)}`;
	const startStr = `${b.startYear}-${pad(b.startMonth)}-${pad(b.startDay)}`;
	const endStr = `${b.endYear}-${pad(b.endMonth)}-${pad(b.endDay)}`;
	return dateStr >= startStr && dateStr <= endStr;
}
