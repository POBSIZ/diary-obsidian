import Holidays from "date-holidays";

export type HolidayFilterTypes = "public" | "bank" | "school" | "optional" | "observance";

export interface HolidayData {
	dates: Set<string>;
	names: Map<string, string[]>;
}

/**
 * Get public holiday dates and names for a given country and year.
 * @param country - ISO 3166-1 alpha-2 country code (e.g. KR, US, JP)
 * @param year - Calendar year
 * @param types - Holiday types to include. Default: ["public"] only.
 * @returns Object with `dates` (Set of YYYY-MM-DD) and `names` (Map of date → holiday names[])
 */
export function getHolidaysForYear(
	country: string,
	year: number,
	types: HolidayFilterTypes[] = ["public"],
): HolidayData {
	const hd = new Holidays(country);
	const holidays = hd.getHolidays(year) ?? [];
	const dates = new Set<string>();
	const names = new Map<string, string[]>();

	for (const h of holidays) {
		const typeMatch = types.length === 0 || types.includes(h.type ?? "public");
		if (!typeMatch || !h.date) continue;

		const [datePart] = h.date.split(" ");
		if (!datePart) continue;

		dates.add(datePart);
		if (h.name) {
			const existing = names.get(datePart) ?? [];
			existing.push(h.name);
			names.set(datePart, existing);
		}
	}

	return { dates, names };
}
