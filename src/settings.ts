/* eslint-disable obsidianmd/ui/sentence-case -- Setting names use title case for clarity */
import { App, PluginSettingTab, Setting } from "obsidian";
import { setLocale, t } from "./i18n";
import DiaryObsidian from "./main";

export interface DiaryObsidianSettings {
	locale: "en" | "ko";
	plannerFolder: string;
	dateFormat: string;
	showHolidays: boolean;
	holidayCountry: string;
	/** Mobile only: bottom padding (rem) so table isn't covered by Obsidian tools tab. 0 = use default. */
	mobileBottomPadding: number;
	/** Mobile only: month cell width (rem). 0 = use default. */
	mobileCellWidth: number;
}

export const DEFAULT_SETTINGS: DiaryObsidianSettings = {
	locale: "en",
	plannerFolder: "Planner",
	dateFormat: "YYYY-MM-DD",
	showHolidays: true,
	holidayCountry: "KR",
	mobileBottomPadding: 3.5,
	mobileCellWidth: 4.5,
};

export class DiaryObsidianSettingTab extends PluginSettingTab {
	plugin: DiaryObsidian;

	constructor(app: App, plugin: DiaryObsidian) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName(t("settings.language"))
			.setDesc(t("settings.languageDesc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("en", "English")
					.addOption("ko", "한국어")
					.setValue(this.plugin.settings.locale ?? "en")
					.onChange(async (value) => {
						this.plugin.settings.locale =
							value === "ko" ? "ko" : "en";
						setLocale(this.plugin.settings.locale);
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.plannerFolder"))
			.setDesc(t("settings.plannerFolderDesc"))
			.addText((text) =>
				text
					.setPlaceholder("Planner")
					.setValue(this.plugin.settings.plannerFolder)
					.onChange(async (value) => {
						this.plugin.settings.plannerFolder = value || "Planner";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.dateFormat"))
			.setDesc(t("settings.dateFormatDesc"))
			.addText((text) =>
				text
					.setPlaceholder("YYYY-MM-DD")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value || "YYYY-MM-DD";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.showHolidays"))
			.setDesc(t("settings.showHolidaysDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHolidays)
					.onChange(async (value) => {
						this.plugin.settings.showHolidays = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.holidayCountry"))
			.setDesc(t("settings.holidayCountryDesc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("", t("country.none"))
					.addOption("KR", t("country.KR"))
					.addOption("US", t("country.US"))
					.addOption("JP", t("country.JP"))
					.addOption("CN", t("country.CN"))
					.addOption("GB", t("country.GB"))
					.addOption("DE", t("country.DE"))
					.addOption("FR", t("country.FR"))
					.addOption("AU", t("country.AU"))
					.addOption("CA", t("country.CA"))
					.addOption("TW", t("country.TW"))
					.setValue(this.plugin.settings.holidayCountry || "")
					.onChange(async (value) => {
						this.plugin.settings.holidayCountry = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.mobileBottomPadding"))
			.setDesc(t("settings.mobileBottomPaddingDesc"))
			.addSlider((slider) =>
				slider
					.setLimits(0, 8, 0.5)
					.setValue(this.plugin.settings.mobileBottomPadding)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.mobileBottomPadding = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("settings.mobileCellWidth"))
			.setDesc(t("settings.mobileCellWidthDesc"))
			.addSlider((slider) =>
				slider
					.setLimits(0, 8, 0.25)
					.setValue(this.plugin.settings.mobileCellWidth)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.mobileCellWidth = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
