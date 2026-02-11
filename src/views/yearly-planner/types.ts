export interface YearlyPlannerState extends Record<string, unknown> {
	year: number;
}

export interface DragState {
	startYear: number;
	startMonth: number;
	startDay: number;
	currentYear: number;
	currentMonth: number;
	currentDay: number;
}

export interface RangeRunPosition {
	runStart: boolean;
	runEnd: boolean;
}

export interface SelectionBounds {
	startYear: number;
	startMonth: number;
	startDay: number;
	endYear: number;
	endMonth: number;
	endDay: number;
}

export type CreateRangeModalBounds = SelectionBounds;
