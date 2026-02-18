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
  JournalQueryService: () => JournalQueryService,
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
  async getPreviewSnippet(file, maxLines = 4, maxChars = 420) {
    const cacheKey = `${this.deps.getFilePath(file)}:${maxLines}:${maxChars}`;
    if (this.previewCache.has(cacheKey)) {
      return this.previewCache.get(cacheKey) ?? null;
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

// main.ts
var VIEW_TYPE_FIVE_YEAR_JOURNAL = "five-year-journal-view";
var JournalQueryService = class {
  constructor(app) {
    this.app = app;
    this.index = new JournalIndex({
      getMarkdownFiles: () => this.app.vault.getMarkdownFiles(),
      isJournalFile: (file) => this.isJournalFile(file),
      getCreatedDateParts: (file) => this.getCreatedDateParts(file),
      readFile: (file) => this.app.vault.cachedRead(file),
      getFilePath: (file) => file.path,
      getFileBasename: (file) => file.basename
    });
  }
  invalidateCaches() {
    this.index.invalidateCaches();
  }
  isJournalFile(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) {
      return false;
    }
    return this.getTags(cache).has("#journal");
  }
  getCreatedDateParts(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) {
      return null;
    }
    return this.parseCreated(cache.frontmatter.created);
  }
  getSectionEntries(activeDate, targetYear) {
    return this.index.getSectionEntries(activeDate, targetYear);
  }
  async getPreviewSnippet(file, maxLines = 4, maxChars = 420) {
    return this.index.getPreviewSnippet(file, maxLines, maxChars);
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
    this.appRef = appRef;
    this.journalService = journalService;
    this.renderId = 0;
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
    if (!this.journalService.isJournalFile(activeFile)) {
      return;
    }
    const activeDate = this.journalService.getCreatedDateParts(activeFile);
    if (!activeDate) {
      container.createEl("p", {
        text: "This journal note has no valid 'created' date in frontmatter.",
        cls: "five-year-journal__message"
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
        } catch {
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
  buildSections(activeYear) {
    const sections = [];
    const usedYears = /* @__PURE__ */ new Set();
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    if (currentYear !== activeYear) {
      sections.push({
        title: "This year",
        targetYear: currentYear
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
        targetYear
      });
      usedYears.add(targetYear);
    }
    return sections;
  }
};
var FiveYearJournalPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.refreshTimer = null;
  }
  async onload() {
    this.journalService = new JournalQueryService(this.app);
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
  onunload() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_FIVE_YEAR_JOURNAL);
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
function normalizeTag(tag) {
  const trimmed = tag.trim();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}
