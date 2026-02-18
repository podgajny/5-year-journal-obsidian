export type DateParts = {
	year: number;
	month: number;
	day: number;
};

export type JournalEntry<TFile> = {
	file: TFile;
	dateParts: DateParts;
};

type CoreDeps<TFile> = {
	getMarkdownFiles: () => TFile[];
	isJournalFile: (file: TFile) => boolean;
	getCreatedDateParts: (file: TFile) => DateParts | null;
	readFile: (file: TFile) => Promise<string>;
	getFilePath: (file: TFile) => string;
	getFileBasename: (file: TFile) => string;
};

export class JournalIndex<TFile> {
	private readonly deps: CoreDeps<TFile>;
	private isIndexDirty = true;
	private readonly entriesByYearWeek = new Map<number, Map<number, JournalEntry<TFile>[]>>();
	private readonly previewCache = new Map<string, string | null>();

	constructor(deps: CoreDeps<TFile>) {
		this.deps = deps;
	}

	invalidateCaches(): void {
		this.isIndexDirty = true;
		this.entriesByYearWeek.clear();
		this.previewCache.clear();
	}

	getSectionEntries(activeDate: DateParts, targetYear: number): JournalEntry<TFile>[] {
		this.ensureIndex();
		const activeWeek = getIsoWeekNumber(activeDate);
		const yearMap = this.entriesByYearWeek.get(targetYear);
		if (!yearMap) {
			return [];
		}

		return [...(yearMap.get(activeWeek) ?? [])];
	}

	async getPreviewSnippet(file: TFile, maxLines = 4, maxChars = 420): Promise<string | null> {
		const cacheKey = `${this.deps.getFilePath(file)}:${maxLines}:${maxChars}`;
		if (this.previewCache.has(cacheKey)) {
			return this.previewCache.get(cacheKey) ?? null;
		}

		const content = await this.deps.readFile(file);
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
			this.previewCache.set(cacheKey, null);
			return null;
		}

		const preview = previewLines.join("\n");
		this.previewCache.set(cacheKey, preview);
		return preview;
	}

	private ensureIndex(): void {
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
					const aKey = a.dateParts.year * 10000 + a.dateParts.month * 100 + a.dateParts.day;
					const bKey = b.dateParts.year * 10000 + b.dateParts.month * 100 + b.dateParts.day;

					if (bKey !== aKey) {
						return bKey - aKey;
					}

					return this.deps.getFileBasename(a.file).localeCompare(this.deps.getFileBasename(b.file));
				});
			}
		}

		this.isIndexDirty = false;
	}
}

export function parseIsoLikeDate(value: string): DateParts | null {
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

export function getIsoWeekNumber(dateParts: DateParts): number {
	const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
	date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const diffInDays = Math.floor((date.getTime() - yearStart.getTime()) / 86400000) + 1;
	return Math.ceil(diffInDays / 7);
}

export function stripFrontmatter(content: string): string {
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

function getOrCreateMap<K, V>(map: Map<K, Map<number, V[]>>, key: K): Map<number, V[]> {
	const existing = map.get(key);
	if (existing) {
		return existing;
	}

	const created = new Map<number, V[]>();
	map.set(key, created);
	return created;
}

function getOrCreateArray<K, V>(map: Map<K, V[]>, key: K): V[] {
	const existing = map.get(key);
	if (existing) {
		return existing;
	}

	const created: V[] = [];
	map.set(key, created);
	return created;
}

export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) {
		return [];
	}

	const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
	const results: R[] = new Array(items.length);
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
