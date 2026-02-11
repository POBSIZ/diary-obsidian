/** Get topmost planner-relevant element at coords; skips scroll/table wrappers. */
export function getTopmostPlannerElementAt(
	contentEl: HTMLElement,
	clientX: number,
	clientY: number,
): Element | null {
	const elements = document.elementsFromPoint(clientX, clientY);
	for (const el of elements) {
		if (!contentEl.contains(el as Node)) break;
		const he = el as HTMLElement;
		if (
			he.closest?.(".yearly-planner-range-bar[data-path]") ||
			he.closest?.(".yearly-planner-cell-file[data-path]") ||
			he.closest?.(".yearly-planner-cell-holiday-badge") ||
			he.closest?.("td[data-year][data-month][data-day]")
		) {
			return el;
		}
	}
	return null;
}

export function getCellAtClientPos(
	clientX: number,
	clientY: number,
): {
	year: number;
	month: number;
	day: number;
} | null {
	const el = document.elementFromPoint(clientX, clientY);
	const cell = el?.closest("td[data-year][data-month][data-day]");
	if (!cell) return null;
	const year = parseInt(cell.getAttribute("data-year") ?? "", 10);
	const month = parseInt(cell.getAttribute("data-month") ?? "", 10);
	const day = parseInt(cell.getAttribute("data-day") ?? "", 10);
	if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
	if (cell.closest(".yearly-planner-cell-invalid")) return null;
	return { year, month, day };
}
