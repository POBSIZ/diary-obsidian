export const VIEW_TYPE_YEARLY_PLANNER = "yearly-planner-view";
export const VIEW_TYPE_MONTHLY_PLANNER = "monthly-planner-view";

/** Todo chip emoji: completed */
export const TODO_CHIP_EMOJI_COMPLETED = "✅";
/** Todo chip emoji: not completed */
export const TODO_CHIP_EMOJI_INCOMPLETE = "🫥";

export const MONTH_LABELS_KO = [
	"1", "2", "3", "4", "5", "6",
	"7", "8", "9", "10", "11", "12",
] as const;

export const MONTH_LABELS_EN = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const WEEKEND_LABELS_KO = { sat: "토", sun: "일" } as const;
export const WEEKEND_LABELS_EN = { sat: "Sat", sun: "Sun" } as const;

/** 월간 뷰 요일 헤더 (일요일 시작): 일, 월, ... 토 */
export const WEEKDAY_LABELS_KO = [
	"일", "월", "화", "수", "목", "금", "토",
] as const;
export const WEEKDAY_LABELS_EN = [
	"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
] as const;
