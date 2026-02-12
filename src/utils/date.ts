export function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Returns day of week: 0=Sunday, 6=Saturday */
export function getDayOfWeek(year: number, month: number, day: number): number {
	return new Date(year, month - 1, day).getDay();
}

export function getDaysInMonth(year: number, month: number): number {
	if (month === 2) {
		return isLeapYear(year) ? 29 : 28;
	}
	if ([4, 6, 9, 11].includes(month)) {
		return 30;
	}
	return 31;
}
