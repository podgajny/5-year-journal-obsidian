"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FiveYearJournalPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// journal-core.ts
var JournalIndex = class {
  constructor(deps) {
    this.isIndexDirty = true;
    this.entriesByYearWeek = /* @__PURE__ */ new Map();
    this.previewCache = /* @__PURE__ */ new Map();
    this.deps = deps;
  }
  invalidateCaches() {
    this.isIndexDirty = true;
    this.entriesByYearWeek.clear();
    this.previewCache.clear();
  }
  getSectionEntries(activeDate, targetYear) {
    this.ensureIndex();
    const activeWeek = getIsoWeekNumber(activeDate);
    const yearMap = this.entriesByYearWeek.get(targetYear);
    if (!yearMap) {
      return [];
    }
    return [...yearMap.get(activeWeek) ?? []];
  }
  async getPreviewSnippet(file, maxLines = 4, maxChars = 420, maxBytes = 262144) {
    const cacheKey = `${this.deps.getFilePath(file)}:${maxLines}:${maxChars}:${maxBytes}`;
    if (this.previewCache.has(cacheKey)) {
      return this.previewCache.get(cacheKey) ?? null;
    }
    const fileSizeBytes = this.deps.getFileSizeBytes(file);
    if (fileSizeBytes !== null && fileSizeBytes > maxBytes) {
      this.previewCache.set(cacheKey, null);
      return null;
    }
    const content = await this.deps.readFile(file);
    const withoutFrontmatter = stripFrontmatter(content);
    const previewLines = [];
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
      const truncatedLine = compact.length > remaining ? `${compact.slice(0, Math.max(0, remaining - 1))}\u2026` : compact;
      previewLines.push(truncatedLine);
      currentChars += truncatedLine.length;
      if (previewLines.length >= maxLines || truncatedLine.endsWith("\u2026")) {
        break;
      }
    }
    if (previewLines.length === 0) {
      this.previewCache.set(cacheKey, null);
      return null;
    }
    const preview = previewLines.join("\n");
    this.previewCache.set(cacheKey, preview);
    return preview;
  }
  ensureIndex() {
    if (!this.isIndexDirty) {
      return;
    }
    this.entriesByYearWeek.clear();
    for (const file of this.deps.getMarkdownFiles()) {
      if (!this.deps.isJournalFile(file)) {
        continue;
      }
      const created = this.deps.getCreatedDateParts(file);
      if (!created) {
        continue;
      }
      const week = getIsoWeekNumber(created);
      const yearMap = getOrCreateMap(this.entriesByYearWeek, created.year);
      const entries = getOrCreateArray(yearMap, week);
      entries.push({ file, dateParts: created });
    }
    for (const yearMap of this.entriesByYearWeek.values()) {
      for (const entries of yearMap.values()) {
        entries.sort((a, b) => {
          const aKey = a.dateParts.year * 1e4 + a.dateParts.month * 100 + a.dateParts.day;
          const bKey = b.dateParts.year * 1e4 + b.dateParts.month * 100 + b.dateParts.day;
          if (bKey !== aKey) {
            return bKey - aKey;
          }
          return this.deps.getFileBasename(a.file).localeCompare(this.deps.getFileBasename(b.file));
        });
      }
    }
    this.isIndexDirty = false;
  }
};
function parseIsoLikeDate(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[Tt ].*)?$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}
function getIsoWeekNumber(dateParts) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diffInDays = Math.floor((date.getTime() - yearStart.getTime()) / 864e5) + 1;
  return Math.ceil(diffInDays / 7);
}
function stripFrontmatter(content) {
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
function getOrCreateMap(map, key) {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created = /* @__PURE__ */ new Map();
  map.set(key, created);
  return created;
}
function getOrCreateArray(map, key) {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created = [];
  map.set(key, created);
  return created;
}
async function mapWithConcurrency(items, concurrency, mapper) {
  if (items.length === 0) {
    return [];
  }
  const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: maxWorkers }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

// plugin-settings.ts
var DEFAULT_SETTINGS = {
  filterField: "tags",
  filterValues: "journal",
  filterMatchMode: "any",
  dateField: "created",
  yearsBack: 4,
  showThisYearSection: true,
  previewMaxLines: 4,
  previewMaxChars: 420,
  previewMaxBytes: 262144
};
function normalizeSettings(value) {
  const source = isRecord(value) ? value : {};
  const maybeMode = source.filterMatchMode;
  const filterMatchMode = maybeMode === "all" ? "all" : "any";
  return {
    filterField: normalizeNonEmptyString(source.filterField, DEFAULT_SETTINGS.filterField),
    filterValues: normalizeCsvText(source.filterValues, DEFAULT_SETTINGS.filterValues),
    filterMatchMode,
    dateField: normalizeNonEmptyString(source.dateField, DEFAULT_SETTINGS.dateField),
    yearsBack: clampInt(source.yearsBack, 1, 20, DEFAULT_SETTINGS.yearsBack),
    showThisYearSection: typeof source.showThisYearSection === "boolean" ? source.showThisYearSection : true,
    previewMaxLines: clampInt(source.previewMaxLines, 1, 12, DEFAULT_SETTINGS.previewMaxLines),
    previewMaxChars: clampInt(source.previewMaxChars, 80, 2e3, DEFAULT_SETTINGS.previewMaxChars),
    previewMaxBytes: clampInt(source.previewMaxBytes, 4096, 10485760, DEFAULT_SETTINGS.previewMaxBytes)
  };
}
function parseFilterValues(csv) {
  return csv.split(",").map((token) => token.trim()).filter((token) => token.length > 0);
}
function normalizeFilterToken(field, token) {
  const normalized = token.trim().toLowerCase();
  if (field.trim().toLowerCase() === "tags") {
    return normalized.startsWith("#") ? normalized : `#${normalized}`;
  }
  return normalized;
}
function extractComparableValues(field, value) {
  const fieldName = field.trim().toLowerCase();
  const values = Array.isArray(value) ? value : [value];
  const normalized = [];
  for (const item of values) {
    const converted = toStringValue(item);
    if (!converted) {
      continue;
    }
    normalized.push(normalizeFilterToken(fieldName, converted));
  }
  return normalized;
}
function filterMatches(field, rawValue, filterValuesCsv, mode) {
  const normalizedFilterValues = parseFilterValues(filterValuesCsv).map((value) => normalizeFilterToken(field, value));
  if (normalizedFilterValues.length === 0) {
    return false;
  }
  const candidates = extractComparableValues(field, rawValue);
  if (candidates.length === 0) {
    return false;
  }
  if (mode === "all") {
    return normalizedFilterValues.every((filterValue) => candidates.includes(filterValue));
  }
  return normalizedFilterValues.some((filterValue) => candidates.includes(filterValue));
}
function shouldRebuildIndex(previous, next) {
  return previous.filterField !== next.filterField || previous.filterValues !== next.filterValues || previous.filterMatchMode !== next.filterMatchMode || previous.dateField !== next.dateField;
}
function normalizeNonEmptyString(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}
function normalizeCsvText(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.split(",").map((token) => token.trim()).filter((token) => token.length > 0).join(", ");
  return trimmed.length > 0 ? trimmed : fallback;
}
function clampInt(value, min, max, fallback) {
  const asNumber = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(asNumber)) {
    return fallback;
  }
  const rounded = Math.round(asNumber);
  return Math.max(min, Math.min(max, rounded));
}
function toStringValue(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// main.ts
var VIEW_TYPE_FIVE_YEAR_JOURNAL = "five-year-journal-view";
var JournalQueryService = class {
  constructor(app, getSettings) {
    this.getSettingsRef = getSettings;
    this.index = new JournalIndex({
      getMarkdownFiles: () => app.vault.getMarkdownFiles(),
      isJournalFile: (file) => this.isJournalFile(file, app),
      getCreatedDateParts: (file) => this.getCreatedDateParts(file, app),
      readFile: (file) => app.vault.cachedRead(file),
      getFileSizeBytes: (file) => file.stat?.size ?? null,
      getFilePath: (file) => file.path,
      getFileBasename: (file) => file.basename
    });
  }
  getSettings() {
    return this.getSettingsRef();
  }
  invalidateCaches() {
    this.index.invalidateCaches();
  }
  isJournalFile(file, app) {
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
      settings.filterMatchMode
    );
  }
  getCreatedDateParts(file, app) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) {
      return null;
    }
    const settings = this.getSettingsRef();
    return this.parseCreated(cache.frontmatter[settings.dateField]);
  }
  getSectionEntries(activeDate, targetYear) {
    return this.index.getSectionEntries(activeDate, targetYear);
  }
  async getPreviewSnippet(file) {
    const settings = this.getSettingsRef();
    return this.index.getPreviewSnippet(file, settings.previewMaxLines, settings.previewMaxChars, settings.previewMaxBytes);
  }
  getTags(cache) {
    const tags = /* @__PURE__ */ new Set();
    const maybeTagCaches = [
      ...cache.tags ?? [],
      ...cache.frontmatterTags ?? []
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
  parseCreated(value) {
    if (typeof value === "string") {
      return parseIsoLikeDate(value);
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return {
        year: value.getUTCFullYear(),
        month: value.getUTCMonth() + 1,
        day: value.getUTCDate()
      };
    }
    return null;
  }
};
var FiveYearJournalView = class extends import_obsidian.ItemView {
  constructor(leaf, appRef, journalService) {
    super(leaf);
    this.renderId = 0;
    this.appRef = appRef;
    this.journalService = journalService;
  }
  getViewType() {
    return VIEW_TYPE_FIVE_YEAR_JOURNAL;
  }
  getDisplayText() {
    return "Five-Year Journal";
  }
  getIcon() {
    return "history";
  }
  async onOpen() {
    await this.renderForFile(this.appRef.workspace.getActiveFile());
  }
  async renderForFile(activeFile) {
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
      const settings2 = this.journalService.getSettings();
      container.createEl("p", {
        text: `This note has no valid '${settings2.dateField}' date in frontmatter.`,
        cls: "five-year-journal__message"
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
        cls: "five-year-journal__header"
      });
      const entries = this.journalService.getSectionEntries(activeDate, sectionDefinition.targetYear);
      if (entries.length === 0) {
        section.createEl("p", {
          text: "No entries",
          cls: "five-year-journal__empty"
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
          cls: "five-year-journal__link"
        });
        this.registerDomEvent(link, "click", (event) => {
          event.preventDefault();
          this.appRef.workspace.getLeaf(true).openFile(entry.file);
        });
        return { row, file: entry.file };
      });
      const rows = renderedRows.filter((item) => item !== null);
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
          cls: "five-year-journal__preview"
        });
      }
    }
  }
  buildSections(activeYear, settings) {
    const sections = [];
    const usedYears = /* @__PURE__ */ new Set();
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    if (settings.showThisYearSection && currentYear !== activeYear) {
      sections.push({
        title: "This year",
        targetYear: currentYear
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
        targetYear
      });
      usedYears.add(targetYear);
    }
    return sections;
  }
};
var FiveYearJournalSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.propertyOptions = [];
    this.valueOptionsByProperty = /* @__PURE__ */ new Map();
    this.hasCatalog = false;
    this.plugin = plugin;
    this.draft = { ...plugin.settings };
  }
  display() {
    this.draft = { ...this.plugin.settings };
    if (!this.hasCatalog) {
      this.refreshPropertyCatalog();
    }
    this.renderForm();
  }
  renderForm() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h3", { text: "Filter" });
    containerEl.createEl("p", { text: "Changes apply when you click Save settings." });
    new import_obsidian.Setting(containerEl).setName("Filter property").setDesc("Choose from existing frontmatter properties found in your vault").addDropdown((dropdown) => {
      for (const property of this.getPropertyOptionsWithCurrent(this.draft.filterField)) {
        dropdown.addOption(property, property);
      }
      dropdown.setValue(this.draft.filterField).onChange((value) => {
        this.draft.filterField = value;
        this.renderForm();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Filter values").setDesc("Comma-separated values, with suggestions from existing notes").addText((text) => {
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
    new import_obsidian.Setting(containerEl).setName("Filter match mode").setDesc("Match any value or require all values").addDropdown((dropdown) => {
      dropdown.addOption("any", "Any").addOption("all", "All").setValue(this.draft.filterMatchMode).onChange((value) => {
        this.draft.filterMatchMode = value === "all" ? "all" : "any";
      });
    });
    containerEl.createEl("h3", { text: "Dates and range" });
    new import_obsidian.Setting(containerEl).setName("Date property").setDesc("Choose from existing frontmatter properties found in your vault").addDropdown((dropdown) => {
      for (const property of this.getPropertyOptionsWithCurrent(this.draft.dateField)) {
        dropdown.addOption(property, property);
      }
      dropdown.setValue(this.draft.dateField).onChange((value) => {
        this.draft.dateField = value;
      });
    });
    new import_obsidian.Setting(containerEl).setName("Property catalog").setDesc("Refresh discovered properties and value suggestions").addButton((button) => {
      button.setButtonText("Refresh properties").onClick(() => {
        this.refreshPropertyCatalog();
        this.renderForm();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Years back").setDesc("How many historical year sections to show").addText((text) => {
      text.setPlaceholder("4").setValue(String(this.draft.yearsBack)).onChange((value) => {
        this.draft.yearsBack = Number(value);
      });
    });
    new import_obsidian.Setting(containerEl).setName("Show This year section").setDesc("Show current-year section when active note is from a different year").addToggle((toggle) => {
      toggle.setValue(this.draft.showThisYearSection).onChange((value) => {
        this.draft.showThisYearSection = value;
      });
    });
    containerEl.createEl("h3", { text: "Preview" });
    new import_obsidian.Setting(containerEl).setName("Preview max lines").addText((text) => {
      text.setPlaceholder("4").setValue(String(this.draft.previewMaxLines)).onChange((value) => {
        this.draft.previewMaxLines = Number(value);
      });
    });
    new import_obsidian.Setting(containerEl).setName("Preview max characters").addText((text) => {
      text.setPlaceholder("420").setValue(String(this.draft.previewMaxChars)).onChange((value) => {
        this.draft.previewMaxChars = Number(value);
      });
    });
    new import_obsidian.Setting(containerEl).setName("Preview max bytes").setDesc("Skip preview extraction for files larger than this size in bytes").addText((text) => {
      text.setPlaceholder("262144").setValue(String(this.draft.previewMaxBytes)).onChange((value) => {
        this.draft.previewMaxBytes = Number(value);
      });
    });
    new import_obsidian.Setting(containerEl).setName("Save settings").setDesc("Apply all changes and refresh the view").addButton((button) => {
      button.setButtonText("Save settings").setCta().onClick(async () => {
        await this.plugin.savePluginSettings(this.draft);
        this.display();
      });
    }).addButton((button) => {
      button.setButtonText("Reset defaults").onClick(async () => {
        await this.plugin.savePluginSettings(DEFAULT_SETTINGS);
        this.display();
      });
    });
  }
  refreshPropertyCatalog() {
    const properties = /* @__PURE__ */ new Set(["tags"]);
    const valueSets = /* @__PURE__ */ new Map();
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
  getPropertyOptionsWithCurrent(currentValue) {
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
  getValueSuggestions(propertyName) {
    const byExactName = this.valueOptionsByProperty.get(propertyName);
    if (byExactName) {
      return byExactName;
    }
    return [];
  }
  getTagValues(cache) {
    const tags = /* @__PURE__ */ new Set();
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
};
function getOrCreateSet(map, key) {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created = /* @__PURE__ */ new Set();
  map.set(key, created);
  return created;
}
function normalizeFrontmatterValue(value) {
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) {
      const normalized2 = normalizeFrontmatterPrimitive(item);
      if (normalized2) {
        result.push(normalized2);
      }
    }
    return result;
  }
  const normalized = normalizeFrontmatterPrimitive(value);
  return normalized ? [normalized] : [];
}
function normalizeFrontmatterPrimitive(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}
function logPreviewReadError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.debug("[five-year-journal] Failed to build preview snippet.", message);
}
var FiveYearJournalPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.refreshTimer = null;
  }
  async onload() {
    await this.loadPluginSettings();
    this.journalService = new JournalQueryService(this.app, () => this.settings);
    this.addSettingTab(new FiveYearJournalSettingTab(this.app, this));
    this.registerView(
      VIEW_TYPE_FIVE_YEAR_JOURNAL,
      (leaf) => new FiveYearJournalView(leaf, this.app, this.journalService)
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.refreshView();
      })
    );
    for (const eventName of ["changed", "create", "delete", "rename"]) {
      this.registerEvent(
        this.app.vault.on(eventName, () => {
          this.journalService.invalidateCaches();
          this.scheduleRefresh();
        })
      );
    }
    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
        this.journalService.invalidateCaches();
        this.scheduleRefresh();
      })
    );
    this.app.workspace.onLayoutReady(() => {
      void this.activateView();
    });
  }
  async savePluginSettings(nextSettings) {
    const previous = this.settings;
    const normalizedNext = normalizeSettings(nextSettings);
    this.settings = normalizedNext;
    await this.saveData(normalizedNext);
    if (shouldRebuildIndex(previous, normalizedNext)) {
      this.journalService.invalidateCaches();
    }
    await this.refreshView();
  }
  onunload() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_FIVE_YEAR_JOURNAL);
  }
  async loadPluginSettings() {
    const loaded = await this.loadData();
    this.settings = normalizeSettings(loaded);
  }
  scheduleRefresh() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshView();
    }, 150);
  }
  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_FIVE_YEAR_JOURNAL)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE_FIVE_YEAR_JOURNAL,
        active: false
      });
    }
    await this.refreshView();
  }
  async refreshView() {
    const activeFile = this.app.workspace.getActiveFile();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_FIVE_YEAR_JOURNAL)) {
      const view = leaf.view;
      if (view instanceof FiveYearJournalView) {
        await view.renderForFile(activeFile);
      }
    }
  }
};
