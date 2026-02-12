import { App, Modal, Notice, TFile } from "obsidian";
import { getAllFolderPaths } from "./file-utils";
import type { CreateRangeModalBounds, SelectionBounds } from "./types";

/** Chip color presets for CreateFileModal. */
const CHIP_COLOR_PRESETS: readonly { hex: string }[] = [
	{ hex: "#7c3aed" },
	{ hex: "#22c55e" },
	{ hex: "#f59e0b" },
	{ hex: "#8b5cf6" },
	{ hex: "#ec4899" },
	{ hex: "#6b7280" },
];

/** Convert 3-digit hex to 6-digit for color picker. */
function toHex6(hex: string): string | null {
	const m = hex.match(/^#([0-9a-fA-F]{3})$/);
	if (m) {
		const c = m[1] ?? "";
		return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
	}
	const m6 = hex.match(/^#([0-9a-fA-F]{6})$/);
	return m6 ? hex : null;
}

export type CreateSingleDateFileFn = (basename: string) => Promise<TFile>;

export type CreateSingleDateFileWithFolderFn = (
	folder: string,
	basename: string,
	color?: string,
) => Promise<TFile>;

export type CreateRangeFileFn = (
	startYear: number,
	startMonth: number,
	startDay: number,
	endYear: number,
	endMonth: number,
	endDay: number,
) => Promise<TFile>;

export type CreateRangeFileWithFolderFn = (
	folder: string,
	startYear: number,
	startMonth: number,
	startDay: number,
	endYear: number,
	endMonth: number,
	endDay: number,
	color?: string,
) => Promise<TFile>;

export class CreateRangeModal extends Modal {
	constructor(
		app: App,
		private bounds: CreateRangeModalBounds,
		private createRangeFile: CreateRangeFileFn,
		private onCreated: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("yearly-planner-modal-content");
		const pad = (n: number) => String(n).padStart(2, "0");
		const startStr = `${this.bounds.startYear}-${pad(this.bounds.startMonth)}-${pad(this.bounds.startDay)}`;
		const endStr = `${this.bounds.endYear}-${pad(this.bounds.endMonth)}-${pad(this.bounds.endDay)}`;

		this.contentEl.createEl("h2", {
			text: "Create range note",
		});
		this.contentEl.createEl("p", {
			cls: "yearly-planner-range-modal-dates",
			text: `${startStr} ~ ${endStr}`,
		});

		const btn = this.contentEl.createEl("button", {
			text: "Create",
			cls: "mod-cta",
		});
		btn.onclick = async () => {
			try {
				const file = await this.createRangeFile(
					this.bounds.startYear,
					this.bounds.startMonth,
					this.bounds.startDay,
					this.bounds.endYear,
					this.bounds.endMonth,
					this.bounds.endDay,
				);
				this.onCreated();
				this.close();
				void this.app.workspace.getLeaf().openFile(file);
			} catch (err) {
				const msg =
					err instanceof Error
						? err.message
						: "Failed to create file";
				new Notice(msg);
			}
		};
	}
}

function formatHolidayDate(dateStr: string): string {
	const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return dateStr;
	const [, y, month, day] = m;
	const monthNum = parseInt(month ?? "1", 10);
	const dayNum = parseInt(day ?? "1", 10);
	return `${y}년 ${monthNum}월 ${dayNum}일`;
}

export class HolidayInfoModal extends Modal {
	constructor(
		app: App,
		private dateStr: string,
		private holidayNames: string[],
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("yearly-planner-modal-content");
		this.contentEl.createEl("h2", { text: "연휴" });
		this.contentEl.createEl("p", {
			cls: "yearly-planner-holiday-modal-date",
			text: formatHolidayDate(this.dateStr),
		});
		const namesEl = this.contentEl.createEl("p", {
			cls: "yearly-planner-holiday-modal-names",
		});
		for (const name of this.holidayNames) {
			namesEl.createEl("span", {
				cls: "yearly-planner-holiday-name",
				text: name,
			});
			if (name !== this.holidayNames[this.holidayNames.length - 1]) {
				namesEl.appendText(", ");
			}
		}
	}
}

const pad = (n: number) => String(n).padStart(2, "0");

function toDateStr(year: number, month: number, day: number): string {
	return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDateStr(str: string): {
	year: number;
	month: number;
	day: number;
} | null {
	const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return null;
	const year = parseInt(m[1] ?? "", 10);
	const month = parseInt(m[2] ?? "", 10);
	const day = parseInt(m[3] ?? "", 10);
	if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
	return { year, month, day };
}

export interface CreateFileModalOptions {
	bounds: SelectionBounds | null;
	defaultFolder: string;
	createSingleDateFile: CreateSingleDateFileWithFolderFn;
	createRangeFile: CreateRangeFileWithFolderFn;
	onCreated: () => void;
}

const FOLDER_OTHER = "__other__";

export class CreateFileModal extends Modal {
	private mode: "single" | "range" = "single";
	private folderSelect!: HTMLSelectElement;
	private folderCustomInput!: HTMLInputElement;
	private folderOtherRow!: HTMLElement;
	private startDateInput!: HTMLInputElement;
	private endDateInput!: HTMLInputElement;
	private filenameInput!: HTMLInputElement;
	private colorInput!: HTMLInputElement;
	private colorPickerInput!: HTMLInputElement;
	private colorPresetBtns: HTMLButtonElement[] = [];
	private rangeRow!: HTMLElement;
	private singleModeBtn!: HTMLButtonElement;
	private rangeModeBtn!: HTMLButtonElement;

	constructor(
		app: App,
		private options: CreateFileModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("yearly-planner-modal-content");
		const { bounds, defaultFolder } = this.options;
		const today = new Date();

		let startStr: string;
		let endStr: string;
		if (bounds) {
			const count =
				bounds.startYear === bounds.endYear &&
				bounds.startMonth === bounds.endMonth &&
				bounds.startDay === bounds.endDay
					? 1
					: 2;
			this.mode = count === 1 ? "single" : "range";
			startStr = toDateStr(
				bounds.startYear,
				bounds.startMonth,
				bounds.startDay,
			);
			endStr = toDateStr(bounds.endYear, bounds.endMonth, bounds.endDay);
		} else {
			startStr = toDateStr(
				today.getFullYear(),
				today.getMonth() + 1,
				today.getDate(),
			);
			endStr = startStr;
		}

		this.contentEl.createEl("h2", { text: "Create file" });

		const form = this.contentEl.createDiv({
			cls: "yearly-planner-create-file-modal",
		});

		const modeRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		modeRow.createEl("label", { text: "Mode" });
		this.singleModeBtn = modeRow.createEl("button", {
			cls: "yearly-planner-mode-btn",
			text: "단일 날짜",
		});
		this.rangeModeBtn = modeRow.createEl("button", {
			cls: "yearly-planner-mode-btn",
			text: "범위",
		});
		this.singleModeBtn.onclick = () => this.setMode("single");
		this.rangeModeBtn.onclick = () => this.setMode("range");
		if (this.mode === "single") this.singleModeBtn.addClass("is-active");
		else this.rangeModeBtn.addClass("is-active");

		const folderRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		folderRow.createEl("label", { text: "Folder" });
		const folderPaths = getAllFolderPaths(this.app);
		const hasDefault =
			defaultFolder && folderPaths.includes(defaultFolder.trim());
		if (defaultFolder && !hasDefault) {
			folderPaths.push(defaultFolder.trim());
			folderPaths.sort((a, b) => a.localeCompare(b));
		}
		this.folderSelect = folderRow.createEl("select", {
			cls: "yearly-planner-folder-select",
		});
		for (const path of folderPaths) {
			this.folderSelect.createEl("option", {
				value: path,
				text: path || "(root)",
			});
		}
		this.folderSelect.createEl("option", {
			value: FOLDER_OTHER,
			text: "Other...",
		});
		const targetFolder = defaultFolder?.trim() || "Planner";
		const idx = folderPaths.indexOf(targetFolder);
		if (idx >= 0 && folderPaths[idx] !== undefined) {
			this.folderSelect.value = folderPaths[idx];
		} else if (defaultFolder) {
			this.folderSelect.value = defaultFolder.trim();
		} else {
			this.folderSelect.value = folderPaths[0] ?? FOLDER_OTHER;
		}
		this.folderSelect.onchange = () => this.updateFolderOtherVisibility();

		this.folderOtherRow = form.createDiv({
			cls: "yearly-planner-create-file-row yearly-planner-folder-other-row",
		});
		this.folderOtherRow.createEl("label", { text: "Custom folder path" });
		this.folderCustomInput = this.folderOtherRow.createEl("input", {
			type: "text",
			cls: "yearly-planner-folder-input",
		});
		this.folderCustomInput.placeholder = "Planner";
		this.folderCustomInput.value = defaultFolder || "";
		this.updateFolderOtherVisibility();

		const startRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		startRow.createEl("label", { text: "Start date" });
		this.startDateInput = startRow.createEl("input", {
			type: "date",
			cls: "yearly-planner-date-input",
		});
		this.startDateInput.value = startStr;
		this.startDateInput.oninput = () => this.syncFilename();

		this.rangeRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		this.rangeRow.createEl("label", { text: "End date" });
		this.endDateInput = this.rangeRow.createEl("input", {
			type: "date",
			cls: "yearly-planner-date-input",
		});
		this.endDateInput.value = endStr;
		this.endDateInput.oninput = () => this.syncFilename();

		const filenameRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		filenameRow.createEl("label", { text: "File name" });
		this.filenameInput = filenameRow.createEl("input", {
			type: "text",
			cls: "yearly-planner-filename-input",
		});
		this.filenameInput.placeholder =
			"YYYY-MM-DD or YYYY-MM-DD-suffix"; /* eslint-disable-line obsidianmd/ui/sentence-case -- Format hint */
		this.filenameInput.oninput = () => {
			if (this.mode === "range") this.syncDatesFromFilename();
		};

		const colorRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		colorRow.createEl("label", { text: "Color" });
		const colorPresetsWrap = colorRow.createDiv({
			cls: "yearly-planner-color-row",
		});
		const presetsEl = colorPresetsWrap.createDiv({
			cls: "yearly-planner-color-presets",
		});
		CHIP_COLOR_PRESETS.forEach((preset) => {
			const btn = presetsEl.createEl("button", {
				cls: "yearly-planner-color-preset-btn",
				attr: { type: "button" },
			});
			btn.style.backgroundColor = preset.hex;
			btn.ariaLabel = preset.hex;
			btn.title = preset.hex;
			btn.onclick = () => this.setColorFromPreset(preset.hex);
			this.colorPresetBtns.push(btn);
		});
		this.colorPickerInput = colorPresetsWrap.createEl("input", {
			type: "color",
			cls: "yearly-planner-color-picker",
		});
		this.colorPickerInput.value = "#22c55e";
		this.colorPickerInput.title = "Pick color";
		this.colorPickerInput.oninput = () => {
			this.colorInput.value = this.colorPickerInput.value;
			this.updateColorPresetActive();
		};
		this.colorInput = colorRow.createEl("input", {
			type: "text",
			cls: "yearly-planner-filename-input",
		});
		this.colorInput.placeholder = "#22c55e";
		this.colorInput.title = "Chip color (hex, rgb, or color name)";
		this.colorInput.oninput = () => this.syncColorFromText();

		this.syncFilename();
		this.updateModeUI();

		const btn = this.contentEl.createEl("button", {
			text: "Create",
			cls: "mod-cta",
		});
		btn.onclick = () => void this.handleCreate();
	}

	private updateFolderOtherVisibility(): void {
		const isOther = this.folderSelect.value === FOLDER_OTHER;
		this.folderOtherRow.toggleClass("is-hidden", !isOther);
		if (isOther && !this.folderCustomInput.value) {
			this.folderCustomInput.focus();
		}
	}

	private setColorFromPreset(hex: string): void {
		this.colorInput.value = hex;
		this.colorPickerInput.value = toHex6(hex) ?? hex;
		this.updateColorPresetActive();
	}

	private syncColorFromText(): void {
		const hex = toHex6(this.colorInput.value.trim());
		if (hex) {
			this.colorPickerInput.value = hex;
		}
		this.updateColorPresetActive();
	}

	private updateColorPresetActive(): void {
		const val = this.colorInput.value.trim().toLowerCase();
		CHIP_COLOR_PRESETS.forEach((preset, i) => {
			const btn = this.colorPresetBtns[i];
			btn?.toggleClass(
				"is-active",
				val === preset.hex.toLowerCase(),
			);
		});
	}

	private getFolderValue(): string {
		if (this.folderSelect.value === FOLDER_OTHER) {
			return this.folderCustomInput.value.trim() || "Planner";
		}
		return this.folderSelect.value || "Planner";
	}

	private setMode(mode: "single" | "range"): void {
		this.mode = mode;
		this.updateModeUI();
		this.syncFilename();
	}

	private updateModeUI(): void {
		this.rangeRow.toggleClass("is-hidden", this.mode === "single");
		this.singleModeBtn.toggleClass("is-active", this.mode === "single");
		this.rangeModeBtn.toggleClass("is-active", this.mode === "range");
	}

	private syncFilename(): void {
		const start = this.startDateInput.value;
		const end = this.endDateInput.value;
		if (this.mode === "single") {
			this.filenameInput.value = start || "";
			this.filenameInput.readOnly = false;
		} else {
			this.filenameInput.value = start && end ? `${start}--${end}` : "";
			this.filenameInput.readOnly = true;
		}
	}

	private syncDatesFromFilename(): void {
		const m = this.filenameInput.value.match(
			/^(\d{4}-\d{2}-\d{2})--(\d{4}-\d{2}-\d{2})$/,
		);
		if (m) {
			this.startDateInput.value = m[1] ?? "";
			this.endDateInput.value = m[2] ?? "";
		}
	}

	private async handleCreate(): Promise<void> {
		const folder = this.getFolderValue();
		const start = this.startDateInput.value;
		const end = this.endDateInput.value;
		const filename = this.filenameInput.value.trim().replace(/\.md$/i, "");

		try {
			if (this.mode === "single") {
				if (!filename) return;
				const parsed = parseDateStr(
					filename.split("-").slice(0, 3).join("-"),
				);
				if (!parsed && !/^\d{4}-\d{2}-\d{2}/.test(filename)) return;
				const color = this.colorInput.value.trim() || undefined;
				const file = await this.options.createSingleDateFile(
					folder,
					filename,
					color,
				);
				this.options.onCreated();
				this.close();
				void this.app.workspace.getLeaf().openFile(file);
			} else {
				if (!start || !end || start > end) return;
				const startParts = start.split("-").map((x) => parseInt(x, 10));
				const endParts = end.split("-").map((x) => parseInt(x, 10));
				const [sy, sm, sd] = [
					startParts[0] ?? 0,
					startParts[1] ?? 0,
					startParts[2] ?? 0,
				];
				const [ey, em, ed] = [
					endParts[0] ?? 0,
					endParts[1] ?? 0,
					endParts[2] ?? 0,
				];
				const color = this.colorInput.value.trim() || undefined;
				const file = await this.options.createRangeFile(
					folder,
					sy,
					sm,
					sd,
					ey,
					em,
					ed,
					color,
				);
				this.options.onCreated();
				this.close();
				void this.app.workspace.getLeaf().openFile(file);
			}
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to create file";
			new Notice(msg);
		}
	}
}

export class YearInputModal extends Modal {
	constructor(
		app: App,
		currentYear: number,
		private onSubmit: (year: number) => void,
	) {
		super(app);
		this.contentEl.addClass("yearly-planner-modal-content");
		this.contentEl.createEl("h2", { text: "Enter year" });
		const form = this.contentEl.createDiv({
			cls: "yearly-planner-year-modal",
		});
		const input = form.createEl("input", {
			type: "number",
			cls: "yearly-planner-year-input",
		});
		input.value = String(currentYear);
		input.min = "1900";
		input.max = "2100";
		input.placeholder = "1900-2100";

		const btn = form.createEl("button", { text: "Apply", cls: "mod-cta" });
		btn.onclick = () => {
			const val = parseInt(input.value, 10);
			if (!isNaN(val) && val >= 1900 && val <= 2100) {
				this.onSubmit(val);
				this.close();
			}
		};
	}
}
