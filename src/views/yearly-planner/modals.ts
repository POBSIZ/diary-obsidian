import {
	App,
	Component,
	MarkdownRenderer,
	Modal,
	Notice,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { getLocale, t } from "../../i18n";
import {
	getAllFolderPaths,
	getChipColor,
	isTodoCompleted,
	isTodoFile,
} from "./file-utils";
import {
	moveFileToDate,
	moveRangeFileToNewDates,
	parseSingleDateBasename,
	updateFileColor,
	updateFileTodoStatus,
} from "./file-operations";
import { parseRangeBasename } from "../../utils/range";
import type { SelectionBounds } from "./types";

/** Additional chip color presets (first preset is theme accent, computed at runtime). No duplicates. */
const CHIP_COLOR_PRESETS_EXTRA: readonly { hex: string }[] = [
	{ hex: "#22c55e" }, // green
	{ hex: "#f59e0b" }, // yellow/orange
	{ hex: "#ec4899" }, // pink
	{ hex: "#6b7280" }, // gray
];

/** Resolves var(--interactive-accent) to 6-digit hex. Falls back to #7c3aed if unavailable. */
function getThemeAccentHex(): string {
	const el = document.createElement("div");
	el.setCssProps({ color: "var(--interactive-accent)" });
	document.body.appendChild(el);
	const computed = getComputedStyle(el).color;
	document.body.removeChild(el);
	const m = computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
	if (m) {
		const r = parseInt(m[1] ?? "0", 10);
		const g = parseInt(m[2] ?? "0", 10);
		const b = parseInt(m[3] ?? "0", 10);
		return (
			"#" +
			[r, g, b]
				.map((x) =>
					Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"),
				)
				.join("")
		);
	}
	const m2 = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (m2) {
		const r = parseInt(m2[1] ?? "0", 10);
		const g = parseInt(m2[2] ?? "0", 10);
		const b = parseInt(m2[3] ?? "0", 10);
		return (
			"#" +
			[r, g, b]
				.map((x) =>
					Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"),
				)
				.join("")
		);
	}
	if (toHex6(computed)) return toHex6(computed)!;
	return "#7c3aed";
}

/** Chip color presets: first = theme accent, rest = static. Deduplicates by normalized hex. */
function getChipColorPresets(): { hex: string }[] {
	const themeHex = getThemeAccentHex();
	const all = [{ hex: themeHex }, ...CHIP_COLOR_PRESETS_EXTRA];
	const seen = new Set<string>();
	return all.filter((p) => {
		const normalized = (toHex6(p.hex) ?? p.hex).toLowerCase();
		if (seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
}

/** Max lines to show in file preview. */
const FILE_PREVIEW_MAX_LINES = 20;

/** Max chars to show in file preview (fallback). */
const FILE_PREVIEW_MAX_CHARS = 500;

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

/** Normalize any CSS color to 6-digit hex for comparison. Returns null if invalid. */
function normalizeColorToHex(cssColor: string): string | null {
	const trimmed = cssColor.trim();
	if (!trimmed) return null;
	const hex = toHex6(trimmed);
	if (hex) return hex.toLowerCase();
	const div = document.createElement("div");
	div.style.color = trimmed;
	document.body.appendChild(div);
	const computed = getComputedStyle(div).color;
	document.body.removeChild(div);
	if (!computed) return null;
	const m = computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
	if (m) {
		const r = parseInt(m[1] ?? "0", 10);
		const g = parseInt(m[2] ?? "0", 10);
		const b = parseInt(m[3] ?? "0", 10);
		return (
			"#" +
			[r, g, b]
				.map((x) =>
					Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"),
				)
				.join("")
		);
	}
	const m2 = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (m2) {
		const r = parseInt(m2[1] ?? "0", 10);
		const g = parseInt(m2[2] ?? "0", 10);
		const b = parseInt(m2[3] ?? "0", 10);
		return (
			"#" +
			[r, g, b]
				.map((x) =>
					Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"),
				)
				.join("")
		);
	}
	return toHex6(computed);
}

export type CreateSingleDateFileFn = (basename: string) => Promise<TFile>;

export type CreateSingleDateFileWithFolderFn = (
	folder: string,
	basename: string,
	color?: string,
	todo?: boolean,
) => Promise<TFile>;

export type CreateRangeFileWithFolderFn = (
	folder: string,
	basename: string,
	color?: string,
	todo?: boolean,
) => Promise<TFile>;

function formatHolidayDate(dateStr: string): string {
	const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!m) return dateStr;
	const [, y, month, day] = m;
	const monthNum = parseInt(month ?? "1", 10);
	const dayNum = parseInt(day ?? "1", 10);
	return getLocale() === "ko"
		? t("dateFormat.ko", {
				year: y ?? "",
				month: monthNum,
				day: dayNum,
			})
		: t("dateFormat.en", {
				year: y ?? "",
				month: monthNum,
				day: dayNum,
			});
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
		this.contentEl.createEl("h2", { text: t("modal.holidayTitle") });
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
	private colorPresets: { hex: string }[] = [];
	private todoCheckbox!: HTMLInputElement;
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

		this.contentEl.createEl("h2", { text: t("modal.createFile") });

		const form = this.contentEl.createDiv({
			cls: "yearly-planner-create-file-modal",
		});

		const modeRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		modeRow.createEl("label", { text: t("modal.mode") });
		const modeBtnsWrap = modeRow.createDiv({
			cls: "yearly-planner-mode-btns",
		});
		this.singleModeBtn = modeBtnsWrap.createEl("button", {
			cls: "yearly-planner-mode-btn",
			text: t("modal.singleDate"),
		});
		this.rangeModeBtn = modeBtnsWrap.createEl("button", {
			cls: "yearly-planner-mode-btn",
			text: t("modal.range"),
		});
		this.singleModeBtn.onclick = () => this.setMode("single");
		this.rangeModeBtn.onclick = () => this.setMode("range");
		if (this.mode === "single") this.singleModeBtn.addClass("is-active");
		else this.rangeModeBtn.addClass("is-active");

		const folderRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		folderRow.createEl("label", { text: t("modal.folder") });
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
				text: path || t("modal.root"),
			});
		}
		this.folderSelect.createEl("option", {
			value: FOLDER_OTHER,
			text: t("modal.other"),
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
		this.folderOtherRow.createEl("label", {
			text: t("modal.customFolderPath"),
		});
		this.folderCustomInput = this.folderOtherRow.createEl("input", {
			type: "text",
			cls: "yearly-planner-folder-input",
		});
		this.folderCustomInput.placeholder =
			"Planner"; /* Default folder name */
		this.folderCustomInput.value = defaultFolder || "";
		this.updateFolderOtherVisibility();

		const startRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		startRow.createEl("label", { text: t("modal.startDate") });
		this.startDateInput = startRow.createEl("input", {
			type: "date",
			cls: "yearly-planner-date-input",
		});
		this.startDateInput.value = startStr;
		this.startDateInput.oninput = () => this.syncFilename();

		this.rangeRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		this.rangeRow.createEl("label", { text: t("modal.endDate") });
		this.endDateInput = this.rangeRow.createEl("input", {
			type: "date",
			cls: "yearly-planner-date-input",
		});
		this.endDateInput.value = endStr;
		this.endDateInput.oninput = () => this.syncFilename();

		const filenameRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		filenameRow.createEl("label", { text: t("modal.fileName") });
		this.filenameInput = filenameRow.createEl("input", {
			type: "text",
			cls: "yearly-planner-filename-input",
		});
		this.filenameInput.placeholder = t("modal.fileNamePlaceholder");
		this.filenameInput.oninput = () => {
			if (this.mode === "range") this.syncDatesFromFilename();
		};
		const filenameHint = filenameRow.createDiv({
			cls: "yearly-planner-create-file-hint",
		});
		filenameHint.appendText(t("modal.suffixAsTitle"));
		filenameHint.appendText(" ");
		filenameHint.appendText(t("modal.suffixExample"));

		this.colorPresets = getChipColorPresets();
		const defaultColor = this.colorPresets[0]!.hex;
		const colorRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		colorRow.createEl("label", { text: t("modal.color") });
		const colorPresetsWrap = colorRow.createDiv({
			cls: "yearly-planner-color-row",
		});
		const presetsEl = colorPresetsWrap.createDiv({
			cls: "yearly-planner-color-presets",
		});
		this.colorPresets.forEach((preset) => {
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
		this.colorPickerInput.value = defaultColor;
		this.colorPickerInput.title = t("modal.pickColor");
		this.colorPickerInput.oninput = () => {
			this.colorInput.value = this.colorPickerInput.value;
			this.updateColorPresetActive();
		};
		this.colorInput = colorRow.createEl("input", {
			type: "text",
			cls: "yearly-planner-filename-input",
		});
		this.colorInput.value = defaultColor;
		this.colorInput.placeholder = defaultColor;
		this.colorInput.title = t("modal.chipColorTitle");
		this.colorInput.oninput = () => this.syncColorFromText();
		this.updateColorPresetActive();

		const todoRow = form.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		this.todoCheckbox = todoRow.createEl("input", {
			type: "checkbox",
			cls: "yearly-planner-todo-checkbox",
		});
		const todoLabel = todoRow.createEl("label");
		todoLabel.appendChild(this.todoCheckbox);
		todoLabel.appendText(` ${t("modal.todoFile")}`);

		this.syncFilename();
		this.updateModeUI();

		const btn = this.contentEl.createEl("button", {
			text: t("modal.create"),
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
		const val = this.colorInput.value.trim();
		const normalizedVal = normalizeColorToHex(val) ?? val.toLowerCase();
		this.colorPresets.forEach((preset, i) => {
			const btn = this.colorPresetBtns[i];
			const presetHex = (toHex6(preset.hex) ?? preset.hex).toLowerCase();
			btn?.toggleClass("is-active", normalizedVal === presetHex);
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
		} else {
			this.filenameInput.value = start && end ? `${start}--${end}` : "";
		}
		this.filenameInput.readOnly = false;
	}

	private syncDatesFromFilename(): void {
		const m = this.filenameInput.value.match(
			/^(\d{4}-\d{2}-\d{2})--(\d{4}-\d{2}-\d{2})(?:-.+)?$/,
		);
		if (m) {
			this.startDateInput.value = m[1] ?? "";
			this.endDateInput.value = m[2] ?? "";
		}
	}

	private async handleCreate(): Promise<void> {
		const folder = this.getFolderValue();
		const filename = this.filenameInput.value.trim().replace(/\.md$/i, "");

		try {
			if (this.mode === "single") {
				if (!filename) return;
				const parsed = parseDateStr(
					filename.split("-").slice(0, 3).join("-"),
				);
				if (!parsed && !/^\d{4}-\d{2}-\d{2}/.test(filename)) return;
				const rawColor = this.colorInput.value.trim();
				const themeHex = getThemeAccentHex().toLowerCase();
				const color =
					rawColor &&
					(toHex6(rawColor) ?? rawColor).toLowerCase() !== themeHex
						? rawColor
						: undefined;
				const todo = this.todoCheckbox.checked;
				const file = await this.options.createSingleDateFile(
					folder,
					filename,
					color,
					todo,
				);
				this.options.onCreated();
				this.close();
				void this.app.workspace.getLeaf().openFile(file);
			} else {
				if (!filename) return;
				const rawColor = this.colorInput.value.trim();
				const themeHex = getThemeAccentHex().toLowerCase();
				const color =
					rawColor &&
					(toHex6(rawColor) ?? rawColor).toLowerCase() !== themeHex
						? rawColor
						: undefined;
				const todo = this.todoCheckbox.checked;
				const file = await this.options.createRangeFile(
					folder,
					filename,
					color,
					todo,
				);
				this.options.onCreated();
				this.close();
				void this.app.workspace.getLeaf().openFile(file);
			}
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: t("modal.failedToCreateFile");
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
		this.contentEl.createEl("h2", { text: t("modal.enterYear") });
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

		const btn = form.createEl("button", {
			text: t("modal.apply"),
			cls: "mod-cta",
		});
		btn.onclick = () => {
			const val = parseInt(input.value, 10);
			if (!isNaN(val) && val >= 1900 && val <= 2100) {
				this.onSubmit(val);
				this.close();
			}
		};
	}
}

export class DeleteConfirmModal extends Modal {
	constructor(
		app: App,
		private titleText: string,
		private desc: string,
		private onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("yearly-planner-modal-content");
		this.contentEl.createEl("h2", { text: this.titleText });
		this.contentEl.createEl("p", {
			cls: "yearly-planner-delete-desc",
			text: this.desc,
		});
		const btnRow = this.contentEl.createDiv({
			cls: "yearly-planner-modal-buttons",
		});
		const cancelBtn = btnRow.createEl("button", {
			text: t("modal.cancel"),
		});
		cancelBtn.onclick = () => this.close();
		const deleteBtn = btnRow.createEl("button", {
			text: t("modal.delete"),
			cls: "mod-danger",
		});
		deleteBtn.onclick = () => {
			this.onConfirm();
			this.close();
		};
	}
}

export class FileOptionsModal extends Modal {
	private colorInput!: HTMLInputElement;
	private colorPickerInput!: HTMLInputElement;
	private colorPresetBtns: HTMLButtonElement[] = [];
	private colorPresets: { hex: string }[] = [];
	private todoCheckbox!: HTMLInputElement;
	private completedCheckbox!: HTMLInputElement;
	private completedRow!: HTMLElement;
	private previewComponent: Component | null = null;
	private startDateInput?: HTMLInputElement;
	private endDateInput?: HTMLInputElement;
	private singleDateInput?: HTMLInputElement;

	constructor(
		app: App,
		private file: TFile,
		private leaf: WorkspaceLeaf,
		private onClosed: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("yearly-planner-modal-content");
		this.contentEl.createEl("h2", { text: t("modal.fileOptions") });

		const titleEl = this.contentEl.createEl("p", {
			cls: "yearly-planner-file-options-title",
		});
		titleEl.createEl("strong", { text: this.file.basename });
		titleEl.appendText(` (${this.file.path})`);

		const previewWrap = this.contentEl.createDiv({
			cls: "yearly-planner-file-preview-wrap",
		});
		previewWrap.createEl("label", { text: t("modal.preview") });
		const previewEl = previewWrap.createDiv({
			cls: "yearly-planner-file-preview",
		});
		previewEl.createSpan({
			text: t("modal.previewLoading"),
			cls: "yearly-planner-file-preview-loading",
		});
		void this.loadPreview(previewEl);

		const todoSection = this.contentEl.createDiv({
			cls: "yearly-planner-create-file-modal",
		});
		const todoRow = todoSection.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		this.todoCheckbox = todoRow.createEl("input", {
			type: "checkbox",
			cls: "yearly-planner-todo-checkbox",
		});
		this.todoCheckbox.checked = isTodoFile(this.app, this.file);
		const todoLabel = todoRow.createEl("label");
		todoLabel.appendChild(this.todoCheckbox);
		todoLabel.appendText(` ${t("modal.todoFile")}`);
		this.todoCheckbox.onchange = () => this.updateCompletedRowVisibility();

		this.completedRow = todoSection.createDiv({
			cls: "yearly-planner-create-file-row yearly-planner-completed-row",
		});
		this.completedCheckbox = this.completedRow.createEl("input", {
			type: "checkbox",
			cls: "yearly-planner-completed-checkbox",
		});
		this.completedCheckbox.checked = isTodoCompleted(this.app, this.file);
		const completedLabel = this.completedRow.createEl("label");
		completedLabel.appendChild(this.completedCheckbox);
		completedLabel.appendText(` ${t("modal.completed")}`);
		this.updateCompletedRowVisibility();

		const rangeParsed = parseRangeBasename(this.file.basename);
		const singleParsed =
			!rangeParsed &&
			parseSingleDateBasename(this.file.basename.replace(/\.md$/i, ""));
		if (rangeParsed || singleParsed) {
			const dateSection = this.contentEl.createDiv({
				cls: "yearly-planner-create-file-modal",
			});
			if (rangeParsed) {
				const startRow = dateSection.createDiv({
					cls: "yearly-planner-create-file-row",
				});
				startRow.createEl("label", { text: t("modal.startDate") });
				this.startDateInput = startRow.createEl("input", {
					type: "date",
					cls: "yearly-planner-date-input",
				});
				this.startDateInput.value = rangeParsed.start;
				const endRow = dateSection.createDiv({
					cls: "yearly-planner-create-file-row",
				});
				endRow.createEl("label", { text: t("modal.endDate") });
				this.endDateInput = endRow.createEl("input", {
					type: "date",
					cls: "yearly-planner-date-input",
				});
				this.endDateInput.value = rangeParsed.end;
			} else if (singleParsed) {
				const dateRow = dateSection.createDiv({
					cls: "yearly-planner-create-file-row",
				});
				dateRow.createEl("label", { text: t("modal.changeDate") });
				this.singleDateInput = dateRow.createEl("input", {
					type: "date",
					cls: "yearly-planner-date-input",
				});
				this.singleDateInput.value = singleParsed.date;
			}
		}

		this.colorPresets = getChipColorPresets();
		const defaultColor = this.colorPresets[0]!.hex;
		const colorRow = this.contentEl.createDiv({
			cls: "yearly-planner-create-file-row",
		});
		colorRow.createEl("label", { text: t("modal.color") });
		const colorPresetsWrap = colorRow.createDiv({
			cls: "yearly-planner-color-row",
		});
		const presetsEl = colorPresetsWrap.createDiv({
			cls: "yearly-planner-color-presets",
		});
		const currentColor = getChipColor(this.app, this.file) ?? defaultColor;
		this.colorPresets.forEach((preset) => {
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
		this.colorPickerInput.value =
			toHex6(currentColor) ?? currentColor ?? defaultColor;
		this.colorPickerInput.title = t("modal.pickColor");
		this.colorPickerInput.oninput = () => {
			this.colorInput.value = this.colorPickerInput.value;
			this.updateColorPresetActive();
		};
		this.colorInput = colorRow.createEl("input", {
			type: "text",
			cls: "yearly-planner-filename-input",
		});
		this.colorInput.value = currentColor;
		this.colorInput.placeholder = defaultColor;
		this.colorInput.title = t("modal.chipColorTitle");
		this.colorInput.oninput = () => this.syncColorFromText();
		this.updateColorPresetActive();

		const btnRow = this.contentEl.createDiv({
			cls: "yearly-planner-file-options-buttons",
		});
		const openBtn = btnRow.createEl("button", {
			text: t("modal.openFile"),
			cls: "mod-cta",
		});
		openBtn.onclick = () => {
			void this.leaf.openFile(this.file);
			this.close();
		};
		const applyBtn = btnRow.createEl("button", {
			text: t("modal.applyChange"),
		});
		applyBtn.onclick = () => void this.handleApplyChange();
		const deleteBtn = btnRow.createEl("button", {
			text: t("modal.delete"),
			cls: "mod-danger",
		});
		deleteBtn.onclick = () => this.handleDelete();
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
		const val = this.colorInput.value.trim();
		const normalizedVal = normalizeColorToHex(val) ?? val.toLowerCase();
		this.colorPresets.forEach((preset, i) => {
			const btn = this.colorPresetBtns[i];
			const presetHex = (toHex6(preset.hex) ?? preset.hex).toLowerCase();
			btn?.toggleClass("is-active", normalizedVal === presetHex);
		});
	}

	private updateCompletedRowVisibility(): void {
		this.completedRow.toggleClass("is-hidden", !this.todoCheckbox.checked);
	}

	private async handleApplyChange(): Promise<void> {
		let fileToUpdate: TFile = this.file;

		if (this.singleDateInput) {
			const dateStr = this.singleDateInput.value;
			const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
			if (!m) return;
			const year = parseInt(m[1] ?? "", 10);
			const month = parseInt(m[2] ?? "", 10);
			const day = parseInt(m[3] ?? "", 10);
			const result = await moveFileToDate(
				this.app,
				this.file,
				year,
				month,
				day,
			);
			if (result === null) {
				new Notice(t("modal.dateChangeConflict"));
				return;
			}
			fileToUpdate = result;
		} else if (this.startDateInput && this.endDateInput) {
			const startStr = this.startDateInput.value;
			const endStr = this.endDateInput.value;
			const startM = startStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
			const endM = endStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
			if (!startM || !endM || startStr > endStr) return;
			const startYear = parseInt(startM[1] ?? "", 10);
			const startMonth = parseInt(startM[2] ?? "", 10);
			const startDay = parseInt(startM[3] ?? "", 10);
			const endYear = parseInt(endM[1] ?? "", 10);
			const endMonth = parseInt(endM[2] ?? "", 10);
			const endDay = parseInt(endM[3] ?? "", 10);
			const result = await moveRangeFileToNewDates(
				this.app,
				this.file,
				startYear,
				startMonth,
				startDay,
				endYear,
				endMonth,
				endDay,
			);
			if (result === null) {
				new Notice(t("modal.dateChangeConflict"));
				return;
			}
			fileToUpdate = result;
		}

		const rawColor = this.colorInput.value.trim();
		const themeHex = getThemeAccentHex().toLowerCase();
		const color =
			rawColor &&
			(toHex6(rawColor) ?? rawColor).toLowerCase() !== themeHex
				? rawColor
				: undefined;
		const todo = this.todoCheckbox.checked;
		const completed = this.completedCheckbox.checked;
		try {
			await updateFileColor(this.app, fileToUpdate, color);
			await updateFileTodoStatus(this.app, fileToUpdate, todo, completed);
			this.onClosed();
			this.close();
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: t("modal.failedToCreateFile");
			new Notice(msg);
		}
	}

	private handleDelete(): void {
		new DeleteConfirmModal(
			this.app,
			t("modal.deleteConfirm"),
			t("modal.deleteConfirmDesc", { path: this.file.path }),
			() => {
				void (async () => {
					await this.app.fileManager.trashFile(this.file);
					this.close();
					this.onClosed();
				})();
			},
		).open();
	}

	onClose(): void {
		this.previewComponent?.unload();
		this.previewComponent = null;
	}

	private async loadPreview(containerEl: HTMLElement): Promise<void> {
		try {
			const content = await this.app.vault.read(this.file);
			containerEl.empty();

			const lines = content.split("\n");
			const truncated =
				lines.length > FILE_PREVIEW_MAX_LINES
					? lines.slice(0, FILE_PREVIEW_MAX_LINES).join("\n") + "\n…"
					: content.length > FILE_PREVIEW_MAX_CHARS
						? content.slice(0, FILE_PREVIEW_MAX_CHARS) + "…"
						: content;

			if (!truncated.trim()) {
				containerEl.createSpan({
					text: t("modal.previewEmpty"),
					cls: "yearly-planner-file-preview-empty",
				});
				return;
			}

			const ext = (this.file.extension ?? "").toLowerCase();
			if (ext === "md" || ext === "markdown") {
				this.previewComponent = new Component();
				this.previewComponent.load();
				const inner = containerEl.createDiv("markdown-preview-view");
				await MarkdownRenderer.render(
					this.app,
					truncated,
					inner,
					this.file.path,
					this.previewComponent,
				);
			} else {
				const pre = containerEl.createEl("pre", {
					cls: "yearly-planner-file-preview-plain",
				});
				pre.setText(truncated);
			}
		} catch {
			containerEl.empty();
			containerEl.createSpan({
				text: t("modal.previewFailed"),
				cls: "yearly-planner-file-preview-error",
			});
		}
	}
}
