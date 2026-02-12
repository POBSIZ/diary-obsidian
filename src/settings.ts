/* eslint-disable obsidianmd/ui/sentence-case -- Setting names use title case for clarity */
import { App, PluginSettingTab, Setting } from "obsidian";
import DiaryObsidian from "./main";

export type MonthLabelType = "korean" | "english";

export interface DiaryObsidianSettings {
	plannerFolder: string;
	dateFormat: string;
	monthLabels: MonthLabelType;
	showHolidays: boolean;
	holidayCountry: string;
	/** Mobile only: bottom padding (rem) so table isn't covered by Obsidian tools tab. 0 = use default. */
	mobileBottomPadding: number;
	/** Mobile only: month cell width (rem). 0 = use default. */
	mobileCellWidth: number;
}

export const DEFAULT_SETTINGS: DiaryObsidianSettings = {
	plannerFolder: "Planner",
	dateFormat: "YYYY-MM-DD",
	monthLabels: "korean",
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
			.setName("Planner folder")
			.setDesc("Folder for yearly planner date notes")
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
			.setName("Date format")
			.setDesc("Filename date format (e.g. 2000-01-15)")
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
			.setName("Month labels")
			.setDesc("Display format for month headers (1월–12월 or Jan–Dec)")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("korean", "1월–12월")
					.addOption("english", "Jan–Dec")
					.setValue(this.plugin.settings.monthLabels)
					.onChange(async (value) => {
						this.plugin.settings.monthLabels =
							value as MonthLabelType;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show holidays")
			.setDesc("Display public holidays in the yearly planner")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHolidays)
					.onChange(async (value) => {
						this.plugin.settings.showHolidays = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Holiday country")
			.setDesc("Country for holiday display (ISO 3166-1 alpha-2)")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("", "None")
					.addOption("KR", "대한민국")
					.addOption("US", "United States")
					.addOption("JP", "日本")
					.addOption("CN", "中国")
					.addOption("GB", "United Kingdom")
					.addOption("DE", "Deutschland")
					.addOption("FR", "France")
					.addOption("AU", "Australia")
					.addOption("CA", "Canada")
					.addOption("TW", "台灣")
					.setValue(
						this.plugin.settings.holidayCountry || "",
					)
					.onChange(async (value) => {
						this.plugin.settings.holidayCountry = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Mobile bottom padding")
			.setDesc(
				"Padding (rem) at bottom of yearly planner on mobile so the table is not covered by the tools tab. 0 to disable.",
			)
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
			.setName("Mobile cell width")
			.setDesc(
				"Width (rem) of month cells on mobile. 0 to use default (4.5rem / 4rem by breakpoint).",
			)
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
