import { App, Component, MarkdownRenderer, setIcon, TFile } from "obsidian";
import { t } from "../i18n";

export interface PlanNotePanelOptions {
	/** Human-readable label shown in the header (e.g. "2026" or "February 2026"). */
	label: string;
	/** Whether the panel body is expanded. Required when file exists. */
	expanded?: boolean;
	/** Called when the user toggles expand/collapse. Required when file exists. */
	onToggle?: () => void;
	onCreate: () => Promise<void>;
	onOpen: (file: TFile) => void;
}

/**
 * Renders a plan note panel into `container`.
 * - If `filePath` exists: renders the file's markdown content with an open button.
 * - If `filePath` is absent: renders an empty state with a create button.
 */
export async function renderPlanNotePanel(
	container: HTMLElement,
	app: App,
	filePath: string,
	component: Component,
	opts: PlanNotePanelOptions,
): Promise<void> {
	const panel = container.createDiv({ cls: "plan-note-panel" });
	const file = app.vault.getAbstractFileByPath(filePath);

	if (file instanceof TFile) {
		const header = panel.createDiv({ cls: "plan-note-panel-header" });
		const expanded = opts.expanded ?? true;
		if (opts.onToggle) {
			const toggleBtn = header.createEl("button", {
				cls: "plan-note-panel-toggle-btn clickable-icon",
				attr: {
					"aria-label": expanded
						? t("planNote.collapse")
						: t("planNote.expand"),
				},
			});
			setIcon(toggleBtn, expanded ? "chevron-down" : "chevron-right");
			toggleBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				opts.onToggle!();
			});
		}
		header.createEl("span", {
			cls: "plan-note-panel-title",
			text: opts.label,
		});
		const openBtn = header.createEl("button", {
			cls: "plan-note-panel-open-btn clickable-icon",
			attr: { "aria-label": t("planNote.openButton") },
		});
		const svg = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"svg",
		);
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("width", "14");
		svg.setAttribute("height", "14");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		const path = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path",
		);
		path.setAttribute(
			"d",
			"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
		);
		const polyline = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"polyline",
		);
		polyline.setAttribute("points", "15 3 21 3 21 9");
		const line = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"line",
		);
		line.setAttribute("x1", "10");
		line.setAttribute("y1", "14");
		line.setAttribute("x2", "21");
		line.setAttribute("y2", "3");
		svg.append(path, polyline, line);
		openBtn.appendChild(svg);
		openBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			opts.onOpen(file);
		});

		const body = panel.createDiv({
			cls: expanded
				? "plan-note-panel-body"
				: "plan-note-panel-body is-collapsed",
		});
		const content = await app.vault.read(file);
		if (content.trim()) {
			await MarkdownRenderer.render(
				app,
				content,
				body,
				file.path,
				component,
			);
		} else {
			body.createEl("p", {
				cls: "plan-note-panel-empty-content",
				text: t("planNote.emptyContent"),
			});
		}

		body.addEventListener("click", () => opts.onOpen(file));
	} else {
		const emptyEl = panel.createDiv({ cls: "plan-note-panel-empty" });
		emptyEl.createEl("span", {
			cls: "plan-note-panel-empty-hint",
			text: t("planNote.emptyHint", { label: opts.label }),
		});
		const createBtn = emptyEl.createEl("button", {
			cls: "plan-note-panel-create-btn",
			text: t("planNote.createButton"),
		});
		createBtn.addEventListener("click", () => void opts.onCreate());
	}
}

/**
 * Syncs the expanded state to an existing plan note panel DOM (e.g. when preserved during re-render).
 * Call this when reusing a preserved plan note wrapper so the toggle reflects current settings.
 */
export function syncPlanNotePanelExpandedState(
	wrapper: HTMLElement,
	expanded: boolean,
): void {
	const body = wrapper.querySelector<HTMLElement>(".plan-note-panel-body");
	const toggleBtn = wrapper.querySelector<HTMLElement>(
		".plan-note-panel-toggle-btn",
	);
	if (body) {
		body.toggleClass("is-collapsed", !expanded);
	}
	if (toggleBtn) {
		setIcon(toggleBtn, expanded ? "chevron-down" : "chevron-right");
		toggleBtn.setAttribute(
			"aria-label",
			expanded ? t("planNote.collapse") : t("planNote.expand"),
		);
	}
}
