import { ItemView, Platform, TFile, WorkspaceLeaf } from "obsidian";
import { t } from "../../i18n";
import DiaryObsidian from "../../main";
import { VIEW_TYPE_MONTHLY_LIST_PLANNER } from "../../constants";
import type { MonthlyPlannerState } from "../monthly-planner/types";
import { getMonthLabel, renderMonthlyPlannerHeader } from "../monthly-planner/render";
import { getMonthNoteFilePath } from "../yearly-planner/file-utils";
import {
	renderPlanNotePanel,
	syncPlanNotePanelExpandedState,
} from "../plan-note-panel";
import { getHolidaysForYear } from "../../utils/holidays";
import { CreateFileModal, FileOptionsModal, HolidayInfoModal } from "../yearly-planner/modals";
import type { SelectionBounds } from "../yearly-planner/types";
import {
	createRangeFile as createRangeFileOp,
	createSingleDateFile as createSingleDateFileOp,
} from "../yearly-planner/file-operations";
import { renderMonthlyListBody } from "./render-list";

export class MonthlyListPlannerView extends ItemView {
	year: number;
	month: number;
	navigation = false;
	private touchStartPos: { x: number; y: number } | null = null;
	/** After header "go to current month" (today), scroll list to today's row. */
	private pendingScrollToToday = false;
	/** After opening the list view, scroll to today once (applied after final layout; see queue). */
	private pendingScrollToTodayOnOpen = false;
	private initialScrollToTodayHandle: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		public plugin: DiaryObsidian,
	) {
		super(leaf);
		const now = new Date();
		this.year = now.getFullYear();
		this.month = now.getMonth() + 1;
	}

	getViewType(): string {
		return VIEW_TYPE_MONTHLY_LIST_PLANNER;
	}

	getDisplayText(): string {
		const locale = this.plugin.settings.locale ?? "en";
		const monthLabel = getMonthLabel(locale, this.month);
		return t("view.monthlyListDisplayText", {
			year: this.year,
			month: monthLabel,
		});
	}

	getState(): MonthlyPlannerState {
		return { year: this.year, month: this.month };
	}

	async setState(
		state: MonthlyPlannerState,
		result: { history: boolean },
	): Promise<void> {
		if (state?.year && state?.month) {
			this.year = state.year;
			this.month = state.month;
			this.render();
		}
		await super.setState(state, result);
		/* Workspace may apply state after the first onOpen render; schedule scroll after that paint. */
		this.queueInitialScrollToToday();
	}

	onOpen(): Promise<void> {
		this.pendingScrollToTodayOnOpen = true;
		this.render();
		this.queueInitialScrollToToday();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.touchStartPos = null;
		this.clearInitialScrollToToday();
		return Promise.resolve();
	}

	/** Defer: setState can re-render after onOpen, which would reset scroll if we scrolled in render(). */
	private queueInitialScrollToToday(): void {
		if (!this.pendingScrollToTodayOnOpen) return;
		if (this.initialScrollToTodayHandle != null) {
			clearTimeout(this.initialScrollToTodayHandle);
		}
		this.initialScrollToTodayHandle = window.setTimeout(() => {
			this.initialScrollToTodayHandle = null;
			this.applyInitialScrollToToday();
		}, 0);
	}

	private clearInitialScrollToToday(): void {
		if (this.initialScrollToTodayHandle != null) {
			clearTimeout(this.initialScrollToTodayHandle);
			this.initialScrollToTodayHandle = null;
		}
		this.pendingScrollToTodayOnOpen = false;
	}

	private applyInitialScrollToToday(): void {
		if (!this.pendingScrollToTodayOnOpen) return;
		const now = new Date();
		if (
			this.year !== now.getFullYear() ||
			this.month !== now.getMonth() + 1
		) {
			this.pendingScrollToTodayOnOpen = false;
			return;
		}
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (!this.pendingScrollToTodayOnOpen) return;
				const newScroll = this.contentEl.querySelector<HTMLElement>(
					".monthly-list-planner-scroll",
				);
				const todayRow = newScroll?.querySelector<HTMLElement>(
					".monthly-list-planner-day-today",
				);
				this.pendingScrollToTodayOnOpen = false;
				if (todayRow) {
					todayRow.scrollIntoView({ block: "center", behavior: "auto" });
				}
			});
		});
	}

	private handleListClickAt(
		clientX: number,
		clientY: number,
		e: Event,
	): void {
		const elements = document.elementsFromPoint(clientX, clientY);
		for (const el of elements) {
			if (!this.contentEl.contains(el)) break;
			const h = el as HTMLElement;

			const rangeBar = h.closest?.(".monthly-planner-range-bar[data-path]");
			if (rangeBar) {
				const path = (rangeBar as HTMLElement).dataset.path;
				if (path) {
					e.preventDefault();
					const file = this.app.vault.getAbstractFileByPath(path);
					if (file instanceof TFile) {
						this.openFileOptionsModal(file);
					}
				}
				return;
			}

			const cellFile = h.closest?.(".monthly-planner-cell-file[data-path]");
			if (cellFile) {
				const path = (cellFile as HTMLElement).dataset.path;
				if (path) {
					e.preventDefault();
					const file = this.app.vault.getAbstractFileByPath(path);
					if (file instanceof TFile) {
						this.openFileOptionsModal(file);
					}
				}
				return;
			}

			const holidayBadge = h.closest?.(".monthly-planner-cell-holiday-badge");
			if (holidayBadge) {
				const dateStr = (holidayBadge as HTMLElement).dataset.holidayDate;
				const namesJson = (holidayBadge as HTMLElement).dataset
					.holidayNames;
				if (dateStr) {
					e.preventDefault();
					let names: string[] = [];
					try {
						if (namesJson) names = JSON.parse(namesJson) as string[];
					} catch {
						// ignore
					}
					new HolidayInfoModal(this.app, dateStr, names).open();
				}
				return;
			}

			const dayBlock = h.closest?.(
				".monthly-list-planner-day[data-year][data-month][data-day]",
			);
			if (dayBlock) {
				const year = parseInt(
					(dayBlock as HTMLElement).dataset.year ?? "",
					10,
				);
				const month = parseInt(
					(dayBlock as HTMLElement).dataset.month ?? "",
					10,
				);
				const day = parseInt(
					(dayBlock as HTMLElement).dataset.day ?? "",
					10,
				);
				if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
					e.preventDefault();
					this.openCreateFileModal({
						startYear: year,
						startMonth: month,
						startDay: day,
						endYear: year,
						endMonth: month,
						endDay: day,
					});
				}
				return;
			}
		}
	}

	render(): void {
		const { contentEl } = this;
		const shouldScrollToToday = this.pendingScrollToToday;
		this.pendingScrollToToday = false;
		/* Open-scroll runs via queueInitialScrollToToday, not here (avoids setState re-render reset). */
		const wantScrollToToday = shouldScrollToToday;
		const scrollEl = contentEl.querySelector<HTMLElement>(
			".monthly-list-planner-scroll",
		);
		const scrollTop = shouldScrollToToday
			? 0
			: (scrollEl?.scrollTop ?? 0);

		const planNoteWrapper = contentEl.querySelector<HTMLElement>(
			".plan-note-panel-wrapper",
		);
		const preservePlanNote =
			planNoteWrapper &&
			planNoteWrapper.hasChildNodes() &&
			planNoteWrapper.dataset.year === String(this.year) &&
			planNoteWrapper.dataset.month === String(this.month);
		if (preservePlanNote) planNoteWrapper.remove();

		contentEl.empty();
		contentEl.addClass("monthly-list-planner-container");
		const pad = this.plugin.settings.mobileBottomPadding ?? 3.5;
		contentEl.style.setProperty(
			"--monthly-list-planner-mobile-bottom-padding",
			`${pad}rem`,
		);

		this.renderHeader(contentEl);
		if (preservePlanNote && planNoteWrapper) {
			contentEl.appendChild(planNoteWrapper);
			syncPlanNotePanelExpandedState(
				planNoteWrapper,
				this.plugin.settings.planNotePanelExpanded ?? true,
			);
		} else {
			const notePanelEl = contentEl.createDiv({
				cls: "plan-note-panel-wrapper",
			});
			notePanelEl.dataset.year = String(this.year);
			notePanelEl.dataset.month = String(this.month);
			void this.renderMonthNotePanel(notePanelEl);
		}
		this.renderList(contentEl);

		const newScroll = contentEl.querySelector<HTMLElement>(
			".monthly-list-planner-scroll",
		);
		if (newScroll) {
			if (wantScrollToToday) {
				newScroll.scrollTop = 0;
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						const todayRow = newScroll.querySelector<HTMLElement>(
							".monthly-list-planner-day-today",
						);
						if (todayRow) {
							todayRow.scrollIntoView({
								block: "center",
								behavior: shouldScrollToToday ? "smooth" : "auto",
							});
						}
					});
				});
			} else {
				newScroll.scrollTop = scrollTop;
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						newScroll.scrollTop = scrollTop;
					});
				});
			}
		}
	}

	private async renderMonthNotePanel(container: HTMLElement): Promise<void> {
		const folder = this.plugin.settings.plannerFolder || "Planner";
		const filePath = getMonthNoteFilePath(folder, this.year, this.month);
		const locale = this.plugin.settings.locale ?? "en";
		const monthLabel = getMonthLabel(locale, this.month);
		const label = `${monthLabel} ${this.year}`;
		await renderPlanNotePanel(container, this.app, filePath, this, {
			label,
			expanded: this.plugin.settings.planNotePanelExpanded ?? true,
			onToggle: () => void this.plugin.togglePlanNotePanelExpanded(),
			onCreate: async () => {
				const dir = filePath.split("/").slice(0, -1).join("/");
				if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
					await this.app.vault.createFolder(dir);
				}
				const newFile = await this.app.vault.create(
					filePath,
					`# ${label}\n\n`,
				);
				await this.leaf.openFile(newFile);
				this.render();
			},
			onOpen: (file) => {
				void this.leaf.openFile(file);
			},
		});
	}

	private renderHeader(contentEl: HTMLElement): void {
		const locale = this.plugin.settings.locale ?? "en";
		const monthLabel = getMonthLabel(locale, this.month);
		renderMonthlyPlannerHeader(
			contentEl,
			{
				year: this.year,
				month: this.month,
				monthLabel,
				app: this.app,
				viewTitle: t("view.monthlyListTitle"),
			},
			{
				onPrev: () => {
					if (this.month === 1) {
						if (this.year > 1900) {
							this.year--;
							this.month = 12;
						}
					} else {
						this.month--;
					}
					this.render();
				},
				onNext: () => {
					if (this.month === 12) {
						if (this.year < 2100) {
							this.year++;
							this.month = 1;
						}
					} else {
						this.month++;
					}
					this.render();
				},
				onToday: () => {
					const now = new Date();
					this.year = now.getFullYear();
					this.month = now.getMonth() + 1;
					this.pendingScrollToToday = true;
					this.render();
				},
				onMonthYearClick: (year, month) => {
					this.year = year;
					this.month = month;
					this.render();
				},
				onAddFile: () => {
					this.openCreateFileModal(null);
				},
				onSwitchToYearly: () => {
					void this.plugin.switchToYearly(this.leaf, this.year);
				},
				onSwitchToGridView: () => {
					void this.plugin.switchToMonthly(
						this.leaf,
						this.year,
						this.month,
					);
				},
			},
		);
	}

	private openCreateFileModal(bounds: SelectionBounds | null): void {
		const defaultFolder = this.plugin.settings.plannerFolder || "Planner";
		new CreateFileModal(this.app, {
			bounds,
			defaultFolder,
			createSingleDateFile: (folder, basename, color, todo, notifyMinutes) =>
				createSingleDateFileOp(
					this.app,
					folder,
					basename,
					color,
					todo,
					notifyMinutes,
				),
			createRangeFile: (folder, basename, color, todo, notifyMinutes) =>
				createRangeFileOp(
					this.app,
					folder,
					basename,
					color,
					todo,
					notifyMinutes,
				),
			onCreated: () => this.render(),
		}).open();
	}

	private openFileOptionsModal(file: TFile): void {
		new FileOptionsModal(this.app, file, this.leaf, () => this.render()).open();
	}

	private renderList(contentEl: HTMLElement): void {
		const scrollContainer = contentEl.createDiv({
			cls: "monthly-list-planner-scroll",
		});
		scrollContainer.addEventListener(
			"click",
			(e: MouseEvent) => {
				if (Platform.isMobile) return;
				this.handleListClickAt(e.clientX, e.clientY, e);
			},
			{ capture: true },
		);
		scrollContainer.addEventListener(
			"touchstart",
			(e: TouchEvent) => {
				if (!Platform.isMobile) return;
				if (e.touches.length >= 2) {
					this.touchStartPos = null;
					return;
				}
				const t = e.touches[0];
				if (t) {
					this.touchStartPos = { x: t.clientX, y: t.clientY };
				}
			},
			{ capture: true },
		);
		scrollContainer.addEventListener(
			"touchcancel",
			() => {
				this.touchStartPos = null;
			},
			{ capture: true },
		);
		scrollContainer.addEventListener(
			"touchend",
			(e: TouchEvent) => {
				if (!Platform.isMobile) return;
				const t = e.changedTouches[0];
				if (!t) return;
				if (!this.touchStartPos) return;
				const dx = t.clientX - this.touchStartPos.x;
				const dy = t.clientY - this.touchStartPos.y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				this.touchStartPos = null;
				if (dist > 15) return;
				e.preventDefault();
				this.handleListClickAt(t.clientX, t.clientY, e);
			},
			{ capture: true },
		);

		const inner = scrollContainer.createDiv({ cls: "monthly-list-planner-inner" });
		const locale = this.plugin.settings.locale ?? "en";
		const { showHolidays, holidayCountry } = this.plugin.settings;
		const holidaysData =
			showHolidays && holidayCountry
				? getHolidaysForYear(holidayCountry, this.year)
				: null;
		renderMonthlyListBody(inner, {
			year: this.year,
			month: this.month,
			app: this.app,
			locale,
			holidaysData,
		});
	}
}
