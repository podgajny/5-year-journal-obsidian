import {
	App,
	CachedMetadata,
	ItemView,
	Plugin,
	PluginSettingTab,
	Setting,
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
import {
	DEFAULT_SETTINGS,
	FiveYearJournalSettings,
	filterMatches,
	normalizeSettings,
	shouldRebuildIndex,
} from "./plugin-settings";

const VIEW_TYPE_FIVE_YEAR_JOURNAL = "five-year-journal-view";

type JournalSection = {
	title: string;
	targetYear: number;
};

type JournalEntry = CoreJournalEntry<TFile>;

class JournalQueryService {
	private readonly index: JournalIndex<TFile>;
	private readonly getSettingsRef: () => FiveYearJournalSettings;

	constructor(app: App, getSettings: () => FiveYearJournalSettings) {
		this.getSettingsRef = getSettings;
			this.index = new JournalIndex<TFile>({
				getMarkdownFiles: () => app.vault.getMarkdownFiles(),
				isJournalFile: (file) => this.isJournalFile(file, app),
				getCreatedDateParts: (file) => this.getCreatedDateParts(file, app),
				readFile: (file) => app.vault.cachedRead(file),
				getFileSizeBytes: (file) => file.stat?.size ?? null,
				getFilePath: (file) => file.path,
				getFileBasename: (file) => file.basename,
			});
		}

	getSettings(): FiveYearJournalSettings {
		return this.getSettingsRef();
	}

	invalidateCaches(): void {
		this.index.invalidateCaches();
	}

	isJournalFile(file: TFile, app: App): boolean {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) {
			return false;
		}

		const settings = this.getSettingsRef();
		if (settings.filterField.trim().toLowerCase() === "tags") {
			return filterMatches("tags", this.getTags(cache), settings.filterValues, settings.filterMatchMode);
		}

		return filterMatches(
			settings.filterField,
			cache.frontmatter?.[settings.filterField],
			settings.filterValues,
			settings.filterMatchMode,
		);
	}

	getCreatedDateParts(file: TFile, app: App): DateParts | null {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			return null;
		}

		const settings = this.getSettingsRef();
		return this.parseCreated(cache.frontmatter[settings.dateField]);
	}

	getSectionEntries(activeDate: DateParts, targetYear: number): JournalEntry[] {
		return this.index.getSectionEntries(activeDate, targetYear);
	}

	async getPreviewSnippet(file: TFile): Promise<string | null> {
		const settings = this.getSettingsRef();
		return this.index.getPreviewSnippet(file, settings.previewMaxLines, settings.previewMaxChars, settings.previewMaxBytes);
	}

	private getTags(cache: CachedMetadata): string[] {
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
			tags.add(fmTags);
		} else if (Array.isArray(fmTags)) {
			for (const tag of fmTags) {
				if (typeof tag === "string") {
					tags.add(tag);
				}
			}
		}

		return [...tags];
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
	private readonly appRef: App;
	private readonly journalService: JournalQueryService;

	constructor(leaf: WorkspaceLeaf, appRef: App, journalService: JournalQueryService) {
		super(leaf);
		this.appRef = appRef;
		this.journalService = journalService;
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

		if (!this.journalService.isJournalFile(activeFile, this.appRef)) {
			return;
		}

		const activeDate = this.journalService.getCreatedDateParts(activeFile, this.appRef);
		if (!activeDate) {
			const settings = this.journalService.getSettings();
			container.createEl("p", {
				text: `This note has no valid '${settings.dateField}' date in frontmatter.`,
				cls: "five-year-journal__message",
			});
			return;
		}

		const settings = this.journalService.getSettings();
		const sections = this.buildSections(activeDate.year, settings);
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
				} catch (error) {
					logPreviewReadError(error);
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

	private buildSections(activeYear: number, settings: FiveYearJournalSettings): JournalSection[] {
		const sections: JournalSection[] = [];
		const usedYears = new Set<number>();
		const currentYear = new Date().getFullYear();

		if (settings.showThisYearSection && currentYear !== activeYear) {
			sections.push({
				title: "This year",
				targetYear: currentYear,
			});
			usedYears.add(currentYear);
		}

		for (let offset = 1; offset <= settings.yearsBack; offset += 1) {
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

class FiveYearJournalSettingTab extends PluginSettingTab {
	private readonly plugin: FiveYearJournalPlugin;
	private draft: FiveYearJournalSettings;
	private propertyOptions: string[] = [];
	private valueOptionsByProperty = new Map<string, string[]>();
	private hasCatalog = false;

	constructor(app: App, plugin: FiveYearJournalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.draft = { ...plugin.settings };
	}

	display(): void {
		this.draft = { ...this.plugin.settings };
		if (!this.hasCatalog) {
			this.refreshPropertyCatalog();
		}
		this.renderForm();
	}

	private renderForm(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h3", { text: "Filter" });
		containerEl.createEl("p", { text: "Changes apply when you click Save settings." });

		new Setting(containerEl)
			.setName("Filter property")
			.setDesc("Choose from existing frontmatter properties found in your vault")
			.addDropdown((dropdown) => {
				for (const property of this.getPropertyOptionsWithCurrent(this.draft.filterField)) {
					dropdown.addOption(property, property);
				}

				dropdown.setValue(this.draft.filterField).onChange((value) => {
					this.draft.filterField = value;
					this.renderForm();
				});
			});

		new Setting(containerEl)
			.setName("Filter values")
			.setDesc("Comma-separated values, with suggestions from existing notes")
			.addText((text) => {
				const suggestionId = `five-year-journal-values-${this.draft.filterField || "default"}`;
				text.inputEl.setAttr("list", suggestionId);
				const suggestions = this.getValueSuggestions(this.draft.filterField);
				const datalistEl = containerEl.createEl("datalist");
				datalistEl.id = suggestionId;
				for (const suggestion of suggestions) {
					datalistEl.createEl("option", { value: suggestion });
				}

				text.setPlaceholder("journal").setValue(this.draft.filterValues).onChange((value) => {
					this.draft.filterValues = value;
				});
			});

		new Setting(containerEl)
			.setName("Filter match mode")
			.setDesc("Match any value or require all values")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("any", "Any")
					.addOption("all", "All")
					.setValue(this.draft.filterMatchMode)
					.onChange((value) => {
						this.draft.filterMatchMode = value === "all" ? "all" : "any";
					});
			});

		containerEl.createEl("h3", { text: "Dates and range" });

		new Setting(containerEl)
			.setName("Date property")
			.setDesc("Choose from existing frontmatter properties found in your vault")
			.addDropdown((dropdown) => {
				for (const property of this.getPropertyOptionsWithCurrent(this.draft.dateField)) {
					dropdown.addOption(property, property);
				}

				dropdown.setValue(this.draft.dateField).onChange((value) => {
					this.draft.dateField = value;
				});
			});

		new Setting(containerEl).setName("Property catalog").setDesc("Refresh discovered properties and value suggestions").addButton((button) => {
			button.setButtonText("Refresh properties").onClick(() => {
				this.refreshPropertyCatalog();
				this.renderForm();
			});
		});

		new Setting(containerEl)
			.setName("Years back")
			.setDesc("How many historical year sections to show")
			.addText((text) => {
				text
					.setPlaceholder("4")
					.setValue(String(this.draft.yearsBack))
					.onChange((value) => {
						this.draft.yearsBack = Number(value);
					});
			});

		new Setting(containerEl)
			.setName("Show This year section")
			.setDesc("Show current-year section when active note is from a different year")
			.addToggle((toggle) => {
				toggle.setValue(this.draft.showThisYearSection).onChange((value) => {
					this.draft.showThisYearSection = value;
				});
			});

		containerEl.createEl("h3", { text: "Preview" });

		new Setting(containerEl)
			.setName("Preview max lines")
			.addText((text) => {
				text
					.setPlaceholder("4")
					.setValue(String(this.draft.previewMaxLines))
					.onChange((value) => {
						this.draft.previewMaxLines = Number(value);
					});
			});

		new Setting(containerEl)
			.setName("Preview max characters")
			.addText((text) => {
				text
					.setPlaceholder("420")
					.setValue(String(this.draft.previewMaxChars))
					.onChange((value) => {
						this.draft.previewMaxChars = Number(value);
					});
			});

		new Setting(containerEl)
			.setName("Preview max bytes")
			.setDesc("Skip preview extraction for files larger than this size in bytes")
			.addText((text) => {
				text
					.setPlaceholder("262144")
					.setValue(String(this.draft.previewMaxBytes))
					.onChange((value) => {
						this.draft.previewMaxBytes = Number(value);
					});
			});

		new Setting(containerEl)
			.setName("Save settings")
			.setDesc("Apply all changes and refresh the view")
			.addButton((button) => {
					button.setButtonText("Save settings").setCta().onClick(async () => {
						await this.plugin.savePluginSettings(this.draft);
						this.display();
					});
			})
			.addButton((button) => {
					button.setButtonText("Reset defaults").onClick(async () => {
						await this.plugin.savePluginSettings(DEFAULT_SETTINGS);
						this.display();
					});
				});
	}

	private refreshPropertyCatalog(): void {
		const properties = new Set<string>(["tags"]);
		const valueSets = new Map<string, Set<string>>();

		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) {
				continue;
			}

			const tags = this.getTagValues(cache);
			if (tags.length > 0) {
				const tagValues = getOrCreateSet(valueSets, "tags");
				for (const tag of tags) {
					tagValues.add(tag);
				}
			}

			const frontmatter = cache.frontmatter;
			if (!frontmatter) {
				continue;
			}

			for (const [key, value] of Object.entries(frontmatter)) {
				properties.add(key);
				const values = normalizeFrontmatterValue(value);
				if (values.length === 0) {
					continue;
				}

				const valueSet = getOrCreateSet(valueSets, key);
				for (const item of values) {
					valueSet.add(item);
				}
			}
		}

		this.propertyOptions = [...properties].sort((a, b) => a.localeCompare(b));
		this.valueOptionsByProperty.clear();
		for (const [key, values] of valueSets) {
			this.valueOptionsByProperty.set(key, [...values].sort((a, b) => a.localeCompare(b)).slice(0, 200));
		}
		this.hasCatalog = true;
	}

	private getPropertyOptionsWithCurrent(currentValue: string): string[] {
		const options = new Set(this.propertyOptions);
		if (currentValue.trim().length > 0) {
			options.add(currentValue);
		}

		const sorted = [...options].sort((a, b) => a.localeCompare(b));
		if (sorted.length === 0) {
			return ["tags"];
		}

		return sorted;
	}

	private getValueSuggestions(propertyName: string): string[] {
		const byExactName = this.valueOptionsByProperty.get(propertyName);
		if (byExactName) {
			return byExactName;
		}

		return [];
	}

	private getTagValues(cache: CachedMetadata): string[] {
		const tags = new Set<string>();
		for (const tagObj of cache.tags ?? []) {
			if (typeof tagObj?.tag === "string") {
				tags.add(tagObj.tag);
			}
		}

		const fmTags = cache.frontmatter?.tags;
		for (const tag of normalizeFrontmatterValue(fmTags)) {
			tags.add(tag.startsWith("#") ? tag : `#${tag}`);
		}

		return [...tags];
	}
}

function getOrCreateSet<K>(map: Map<K, Set<string>>, key: K): Set<string> {
	const existing = map.get(key);
	if (existing) {
		return existing;
	}

	const created = new Set<string>();
	map.set(key, created);
	return created;
}

function normalizeFrontmatterValue(value: unknown): string[] {
	if (Array.isArray(value)) {
		const result: string[] = [];
		for (const item of value) {
			const normalized = normalizeFrontmatterPrimitive(item);
			if (normalized) {
				result.push(normalized);
			}
		}
		return result;
	}

	const normalized = normalizeFrontmatterPrimitive(value);
	return normalized ? [normalized] : [];
}

function normalizeFrontmatterPrimitive(value: unknown): string | null {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		const trimmed = String(value).trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	return null;
}

function logPreviewReadError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	console.debug("[five-year-journal] Failed to build preview snippet.", message);
}

export default class FiveYearJournalPlugin extends Plugin {
	settings: FiveYearJournalSettings = { ...DEFAULT_SETTINGS };
	private journalService!: JournalQueryService;
	private refreshTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadPluginSettings();
		this.journalService = new JournalQueryService(this.app, () => this.settings);
		this.addSettingTab(new FiveYearJournalSettingTab(this.app, this));

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

	async savePluginSettings(nextSettings: FiveYearJournalSettings): Promise<void> {
		const previous = this.settings;
		const normalizedNext = normalizeSettings(nextSettings);
		this.settings = normalizedNext;
		await this.saveData(normalizedNext);

		if (shouldRebuildIndex(previous, normalizedNext)) {
			this.journalService.invalidateCaches();
		}

		await this.refreshView();
	}

	onunload(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		this.app.workspace.detachLeavesOfType(VIEW_TYPE_FIVE_YEAR_JOURNAL);
	}

	private async loadPluginSettings(): Promise<void> {
		const loaded = await this.loadData();
		this.settings = normalizeSettings(loaded);
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
