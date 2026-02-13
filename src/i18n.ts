import en from "../locales/en.json";
import ko from "../locales/ko.json";

export type Locale = "en" | "ko";

const LOCALES: Record<Locale, Record<string, string>> = { en, ko };

let currentLocale: Locale = "en";

export function setLocale(locale: string): void {
	if (locale in LOCALES) {
		currentLocale = locale as Locale;
	} else {
		currentLocale = "en";
	}
}

export function getLocale(): Locale {
	return currentLocale;
}

export function t(
	key: string,
	params?: Record<string, string | number>,
): string {
	const dict = LOCALES[currentLocale];
	const fallback = LOCALES.en[key] ?? key;
	let value = dict[key] ?? fallback;

	if (params) {
		for (const [k, v] of Object.entries(params)) {
			value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
		}
	}

	return value;
}
