/** Get topmost planner-relevant element at coords; skips scroll/table wrappers. */
export function getTopmostMonthlyElementAt(
	contentEl: HTMLElement,
	clientX: number,
	clientY: number,
): Element | null {
	const elements = contentEl.ownerDocument.elementsFromPoint(clientX, clientY);
	for (const el of elements) {
		if (!contentEl.contains(el as Node)) continue;
		const he = el as HTMLElement;
		if (
			he.closest?.(".monthly-planner-range-bar[data-path]") ||
			he.closest?.(".monthly-planner-cell-file[data-path]") ||
			he.closest?.(".monthly-planner-cell-holiday-badge") ||
			he.closest?.("td[data-year][data-month][data-day]")
		) {
			return el;
		}
	}
	return null;
}

/** Get chip or range bar element at coords that has data-path (for chip drag). */
export function getChipOrBarAt(
	contentEl: HTMLElement,
	clientX: number,
	clientY: number,
): HTMLElement | null {
	const elements = contentEl.ownerDocument.elementsFromPoint(clientX, clientY);
	for (const el of elements) {
		if (!contentEl.contains(el as Node)) continue;
		const chip = (el as HTMLElement).closest?.(
			".monthly-planner-cell-file[data-path], .monthly-planner-range-bar[data-path]",
		);
		if (chip && (chip as HTMLElement).dataset.path) return chip as HTMLElement;
	}
	return null;
}

export function getMonthlyCellAtClientPos(
	contentEl: HTMLElement,
	clientX: number,
	clientY: number,
): {
	year: number;
	month: number;
	day: number;
} | null {
	const el = contentEl.ownerDocument.elementFromPoint(clientX, clientY);
	const cell = el?.closest("td[data-year][data-month][data-day]");
	if (!cell) return null;
	const year = parseInt(cell.getAttribute("data-year") ?? "", 10);
	const month = parseInt(cell.getAttribute("data-month") ?? "", 10);
	const day = parseInt(cell.getAttribute("data-day") ?? "", 10);
	if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
	if (cell.closest(".monthly-planner-cell-invalid")) return null;
	return { year, month, day };
}
