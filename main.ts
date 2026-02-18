import {
	App,
	CachedMetadata,
	ItemView,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import {
	DateParts,
	JournalEntry as CoreJournalEntry,
	JournalIndex,
	mapWithConcurrency,
	parseIsoLikeDate,
} from "./journal-core";

const VIEW_TYPE_FIVE_YEAR_JOURNAL = "five-year-journal-view";

type JournalSection = {
	title: string;
	targetYear: number;
};

type JournalEntry = CoreJournalEntry<TFile>;

export class JournalQueryService {
	private readonly index: JournalIndex<TFile>;

	constructor(private readonly app: App) {
		this.index = new JournalIndex<TFile>({
			getMarkdownFiles: () => this.app.vault.getMarkdownFiles(),
			isJournalFile: (file) => this.isJournalFile(file),
			getCreatedDateParts: (file) => this.getCreatedDateParts(file),
			readFile: (file) => this.app.vault.cachedRead(file),
			getFilePath: (file) => file.path,
			getFileBasename: (file) => file.basename,
		});
	}

	invalidateCaches(): void {
		this.index.invalidateCaches();
	}

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
		return this.index.getSectionEntries(activeDate, targetYear);
	}

	async getPreviewSnippet(file: TFile, maxLines = 4, maxChars = 420): Promise<string | null> {
		return this.index.getPreviewSnippet(file, maxLines, maxChars);
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
			const renderedRows = entries.map((entry) => {
				if (this.renderId !== currentRenderId) {
					return null;
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

				return { row, file: entry.file };
			});

			const rows = renderedRows.filter((item): item is { row: HTMLDivElement; file: TFile } => item !== null);
			const previews = await mapWithConcurrency(rows, 6, async ({ file }) => {
				try {
					return await this.journalService.getPreviewSnippet(file);
				} catch {
					// File could be deleted/renamed while rendering.
					return null;
				}
			});

			if (this.renderId !== currentRenderId) {
				return;
			}

			for (let i = 0; i < rows.length; i += 1) {
				const preview = previews[i];
				if (!preview) {
					continue;
				}

				rows[i].row.createEl("div", {
					text: preview,
					cls: "five-year-journal__preview",
				});
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
					this.journalService.invalidateCaches();
					this.scheduleRefresh();
				}),
			);
		}

		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.journalService.invalidateCaches();
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
