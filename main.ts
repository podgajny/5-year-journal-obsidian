import {
	App,
	CachedMetadata,
	ItemView,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from "obsidian";

const VIEW_TYPE_FIVE_YEAR_JOURNAL = "five-year-journal-view";

type DateParts = {
	year: number;
	month: number;
	day: number;
};

type JournalEntry = {
	file: TFile;
	dateParts: DateParts;
};

type JournalSection = {
	title: string;
	targetYear: number;
};

class JournalQueryService {
	constructor(private readonly app: App) {}

	isJournalFile(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) {
			return false;
		}

		return this.getTags(cache).has("#journal");
	}

	getCreatedDateParts(file: TFile): DateParts | null {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			return null;
		}

		return this.parseCreated(cache.frontmatter.created);
	}

	getSectionEntries(activeDate: DateParts, targetYear: number): JournalEntry[] {
		const results: JournalEntry[] = [];
		const activeWeek = getIsoWeekNumber(activeDate);

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!this.isJournalFile(file)) {
				continue;
			}

			const created = this.getCreatedDateParts(file);
			if (!created) {
				continue;
			}

			if (created.year === targetYear && getIsoWeekNumber(created) === activeWeek) {
				results.push({ file, dateParts: created });
			}
		}

		results.sort((a, b) => {
			const aKey = a.dateParts.year * 10000 + a.dateParts.month * 100 + a.dateParts.day;
			const bKey = b.dateParts.year * 10000 + b.dateParts.month * 100 + b.dateParts.day;

			if (bKey !== aKey) {
				return bKey - aKey;
			}

			return a.file.basename.localeCompare(b.file.basename);
		});

		return results;
	}

	async getPreviewSnippet(file: TFile, maxLines = 4, maxChars = 420): Promise<string | null> {
		const content = await this.app.vault.cachedRead(file);
		const withoutFrontmatter = stripFrontmatter(content);
		const previewLines: string[] = [];
		let currentChars = 0;

		for (const line of withoutFrontmatter.split("\n")) {
			const compact = line.replace(/\s+/g, " ").trim();
			if (compact.length === 0) {
				continue;
			}

			const remaining = maxChars - currentChars;
			if (remaining <= 0) {
				break;
			}

			const truncatedLine =
				compact.length > remaining ? `${compact.slice(0, Math.max(0, remaining - 1))}\u2026` : compact;
			previewLines.push(truncatedLine);
			currentChars += truncatedLine.length;

			if (previewLines.length >= maxLines || truncatedLine.endsWith("\u2026")) {
				break;
			}
		}

		if (previewLines.length === 0) {
			return null;
		}

		return previewLines.join("\n");
	}

	private getTags(cache: CachedMetadata): Set<string> {
		const tags = new Set<string>();
		const maybeTagCaches = [
			...(cache.tags ?? []),
			...(((cache as CachedMetadata & { frontmatterTags?: Array<{ tag: string }> })
				.frontmatterTags as Array<{ tag: string }> | undefined) ?? []),
		];

		for (const tagObj of maybeTagCaches) {
			if (typeof tagObj?.tag === "string") {
				tags.add(tagObj.tag);
			}
		}

		const fmTags = cache.frontmatter?.tags;
		if (typeof fmTags === "string") {
			tags.add(normalizeTag(fmTags));
		} else if (Array.isArray(fmTags)) {
			for (const tag of fmTags) {
				if (typeof tag === "string") {
					tags.add(normalizeTag(tag));
				}
			}
		}

		return tags;
	}

	private parseCreated(value: unknown): DateParts | null {
		if (typeof value === "string") {
			return parseIsoLikeDate(value);
		}

		if (value instanceof Date && !Number.isNaN(value.getTime())) {
			return {
				year: value.getUTCFullYear(),
				month: value.getUTCMonth() + 1,
				day: value.getUTCDate(),
			};
		}

		return null;
	}
}

class FiveYearJournalView extends ItemView {
	private renderId = 0;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appRef: App,
		private readonly journalService: JournalQueryService,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_FIVE_YEAR_JOURNAL;
	}

	getDisplayText(): string {
		return "Five-Year Journal";
	}

	getIcon(): string {
		return "history";
	}

	async onOpen(): Promise<void> {
		await this.renderForFile(this.appRef.workspace.getActiveFile());
	}

	async renderForFile(activeFile: TFile | null): Promise<void> {
		const currentRenderId = ++this.renderId;
		const container = this.contentEl;
		container.empty();
		container.addClass("five-year-journal");

		if (!activeFile) {
			return;
		}

		if (!this.journalService.isJournalFile(activeFile)) {
			return;
		}

		const activeDate = this.journalService.getCreatedDateParts(activeFile);
		if (!activeDate) {
			container.createEl("p", {
				text: "This journal note has no valid 'created' date in frontmatter.",
				cls: "five-year-journal__message",
			});
			return;
		}

		const sections = this.buildSections(activeDate.year);
		for (const sectionDefinition of sections) {
			if (this.renderId !== currentRenderId) {
				return;
			}

			const section = container.createDiv({ cls: "five-year-journal__section" });
			section.createEl("h4", {
				text: sectionDefinition.title,
				cls: "five-year-journal__header",
			});

			const entries = this.journalService.getSectionEntries(activeDate, sectionDefinition.targetYear);
			if (entries.length === 0) {
				section.createEl("p", {
					text: "No entries",
					cls: "five-year-journal__empty",
				});
				continue;
			}

			const listContainer = section.createDiv({ cls: "five-year-journal__list" });
			for (const entry of entries) {
				if (this.renderId !== currentRenderId) {
					return;
				}

				const row = listContainer.createDiv({ cls: "five-year-journal__item" });
				const link = row.createEl("a", {
					text: entry.file.basename,
					href: "#",
					cls: "five-year-journal__link",
				});

				this.registerDomEvent(link, "click", (event) => {
					event.preventDefault();
					this.appRef.workspace.getLeaf(true).openFile(entry.file);
				});

				try {
					const preview = await this.journalService.getPreviewSnippet(entry.file);
					if (preview) {
						row.createEl("div", {
							text: preview,
							cls: "five-year-journal__preview",
						});
					}
				} catch {
					// File could be deleted/renamed while rendering.
				}
			}
		}
	}

	private buildSections(activeYear: number): JournalSection[] {
		const sections: JournalSection[] = [];
		const usedYears = new Set<number>();
		const currentYear = new Date().getFullYear();

		if (currentYear !== activeYear) {
			sections.push({
				title: "This year",
				targetYear: currentYear,
			});
			usedYears.add(currentYear);
		}

		for (let offset = 1; offset <= 4; offset += 1) {
			const targetYear = currentYear - offset;
			if (usedYears.has(targetYear)) {
				continue;
			}

			sections.push({
				title: `${offset} year${offset === 1 ? "" : "s"} ago`,
				targetYear,
			});
			usedYears.add(targetYear);
		}

		return sections;
	}
}

export default class FiveYearJournalPlugin extends Plugin {
	private journalService!: JournalQueryService;
	private refreshTimer: number | null = null;

	async onload(): Promise<void> {
		this.journalService = new JournalQueryService(this.app);

		this.registerView(
			VIEW_TYPE_FIVE_YEAR_JOURNAL,
			(leaf) => new FiveYearJournalView(leaf, this.app, this.journalService),
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				void this.refreshView();
			}),
		);

		for (const eventName of ["changed", "create", "delete", "rename"] as const) {
			this.registerEvent(
				this.app.vault.on(eventName, () => {
					this.scheduleRefresh();
				}),
			);
		}

		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.scheduleRefresh();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.activateView();
		});
	}

	onunload(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		this.app.workspace.detachLeavesOfType(VIEW_TYPE_FIVE_YEAR_JOURNAL);
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}

		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			void this.refreshView();
		}, 150);
	}

	private async activateView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_FIVE_YEAR_JOURNAL)[0];
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(true);
			await leaf.setViewState({
				type: VIEW_TYPE_FIVE_YEAR_JOURNAL,
				active: false,
			});
		}

		await this.refreshView();
	}

	private async refreshView(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_FIVE_YEAR_JOURNAL)) {
			const view = leaf.view;
			if (view instanceof FiveYearJournalView) {
				await view.renderForFile(activeFile);
			}
		}
	}
}

function normalizeTag(tag: string): string {
	const trimmed = tag.trim();
	return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function parseIsoLikeDate(value: string): DateParts | null {
	const trimmed = value.trim();
	const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[Tt ].*)?$/);
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day) ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31
	) {
		return null;
	}

	const check = new Date(Date.UTC(year, month - 1, day));
	if (
		check.getUTCFullYear() !== year ||
		check.getUTCMonth() + 1 !== month ||
		check.getUTCDate() !== day
	) {
		return null;
	}

	return { year, month, day };
}

function getIsoWeekNumber(dateParts: DateParts): number {
	const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
	date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const diffInDays = Math.floor((date.getTime() - yearStart.getTime()) / 86400000) + 1;
	return Math.ceil(diffInDays / 7);
}

function stripFrontmatter(content: string): string {
	if (!content.startsWith("---")) {
		return content;
	}

	const lines = content.split("\n");
	let endIndex = -1;
	for (let i = 1; i < lines.length; i += 1) {
		if (lines[i].trim() === "---") {
			endIndex = i;
			break;
		}
	}

	if (endIndex === -1) {
		return content;
	}

	return lines.slice(endIndex + 1).join("\n");
}
