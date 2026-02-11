const RANGE_BASENAME_REGEX = /^(\d{4}-\d{2}-\d{2})--(\d{4}-\d{2}-\d{2})$/;

export interface ParsedRange {
	start: string;
	end: string;
}

export function parseRangeBasename(basename: string): ParsedRange | null {
	const m = basename.match(RANGE_BASENAME_REGEX);
	if (!m) return null;
	const [, start, end] = m;
	if (!start || !end) return null;
	if (start > end) return null;
	return { start, end };
}

export function isDateInRange(
	dateStr: string,
	start: string,
	end: string,
): boolean {
	return dateStr >= start && dateStr <= end;
}
