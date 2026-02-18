import assert from "node:assert/strict";
import test from "node:test";
import {
	getIsoWeekNumber,
	JournalIndex,
	mapWithConcurrency,
	parseIsoLikeDate,
	stripFrontmatter,
	type DateParts,
} from "../journal-core.ts";

type MockFile = {
	path: string;
	basename: string;
};

function pad2(value: number): string {
	return String(value).padStart(2, "0");
}

function formatDate(parts: DateParts): string {
	return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function findDateWithIsoWeek(year: number, week: number): DateParts {
	for (let month = 1; month <= 12; month += 1) {
		for (let day = 1; day <= 31; day += 1) {
			const candidate = new Date(Date.UTC(year, month - 1, day));
			if (
				candidate.getUTCFullYear() !== year ||
				candidate.getUTCMonth() + 1 !== month ||
				candidate.getUTCDate() !== day
			) {
				continue;
			}

			const parts: DateParts = { year, month, day };
			if (getIsoWeekNumber(parts) === week) {
				return parts;
			}
		}
	}

	throw new Error(`No date found for year=${year}, week=${week}`);
}

function createFixture() {
	const activeDate: DateParts = { year: 2026, month: 1, day: 9 };
	const activeWeek = getIsoWeekNumber(activeDate);
	const matchingDate = findDateWithIsoWeek(2025, activeWeek);
	const nonMatchingDate: DateParts = { year: 2025, month: 3, day: 15 };

	const files: MockFile[] = [
		{ path: "journal-match.md", basename: "journal-match" },
		{ path: "journal-non-match.md", basename: "journal-non-match" },
		{ path: "not-journal.md", basename: "not-journal" },
	];

	let listCalls = 0;
	let readCalls = 0;

	const metadata = new Map<string, { isJournal: boolean; created: DateParts }>([
		["journal-match.md", { isJournal: true, created: matchingDate }],
		["journal-non-match.md", { isJournal: true, created: nonMatchingDate }],
		["not-journal.md", { isJournal: false, created: matchingDate }],
	]);

	const contents = new Map<string, string>([
		["journal-match.md", `---\ncreated: ${formatDate(matchingDate)}\n---\nFirst line\nSecond line`],
		["journal-non-match.md", `---\ncreated: ${formatDate(nonMatchingDate)}\n---\nIgnored`],
		["not-journal.md", "Ignored"],
	]);
	const sizes = new Map<string, number>([
		["journal-match.md", 64],
		["journal-non-match.md", 64],
		["not-journal.md", 64],
	]);

	const index = new JournalIndex<MockFile>({
		getMarkdownFiles: () => {
			listCalls += 1;
			return files;
		},
		isJournalFile: (file) => metadata.get(file.path)?.isJournal ?? false,
		getCreatedDateParts: (file) => metadata.get(file.path)?.created ?? null,
			readFile: async (file) => {
				readCalls += 1;
				return contents.get(file.path) ?? "";
			},
			getFileSizeBytes: (file) => sizes.get(file.path) ?? null,
			getFilePath: (file) => file.path,
			getFileBasename: (file) => file.basename,
		});

	return {
		activeDate,
		files,
		getListCalls: () => listCalls,
		getReadCalls: () => readCalls,
		setFileSize: (filePath: string, size: number) => sizes.set(filePath, size),
		index,
	};
}

test("parseIsoLikeDate accepts valid ISO-like values", () => {
	assert.deepEqual(parseIsoLikeDate("2026-01-09"), { year: 2026, month: 1, day: 9 });
	assert.deepEqual(parseIsoLikeDate("2026-01-09T12:30:00Z"), { year: 2026, month: 1, day: 9 });
});

test("parseIsoLikeDate rejects invalid values", () => {
	assert.equal(parseIsoLikeDate("2026/01/09"), null);
	assert.equal(parseIsoLikeDate("2026-02-30"), null);
	assert.equal(parseIsoLikeDate("hello"), null);
});

test("stripFrontmatter removes leading frontmatter and keeps body", () => {
	const content = "---\ntitle: Test\ncreated: 2026-01-09\n---\nLine 1\nLine 2";
	assert.equal(stripFrontmatter(content), "Line 1\nLine 2");
});

test("JournalIndex rebuilds lazily and only after invalidation", () => {
	const fixture = createFixture();
	const { activeDate, getListCalls, index } = fixture;

	const first = index.getSectionEntries(activeDate, 2025);
	assert.equal(first.length, 1);
	assert.equal(first[0].file.path, "journal-match.md");
	assert.equal(getListCalls(), 1);

	const second = index.getSectionEntries(activeDate, 2025);
	assert.equal(second.length, 1);
	assert.equal(getListCalls(), 1);

	index.invalidateCaches();
	const third = index.getSectionEntries(activeDate, 2025);
	assert.equal(third.length, 1);
	assert.equal(getListCalls(), 2);
});

test("JournalIndex caches preview reads", async () => {
	const fixture = createFixture();
	const { files, getReadCalls, index } = fixture;

	const first = await index.getPreviewSnippet(files[0]);
	const second = await index.getPreviewSnippet(files[0]);

	assert.equal(first, "First line\nSecond line");
	assert.equal(second, first);
	assert.equal(getReadCalls(), 1);
});

test("JournalIndex skips preview read when file is above size limit", async () => {
	const fixture = createFixture();
	const { files, getReadCalls, index, setFileSize } = fixture;
	setFileSize(files[0].path, 5000);

	const preview = await index.getPreviewSnippet(files[0], 4, 420, 1024);
	assert.equal(preview, null);
	assert.equal(getReadCalls(), 0);
});

test("mapWithConcurrency keeps output order", async () => {
	const values = [4, 3, 2, 1];
	const results = await mapWithConcurrency(values, 2, async (value) => {
		await new Promise((resolve) => setTimeout(resolve, value * 5));
		return value * 10;
	});

	assert.deepEqual(results, [40, 30, 20, 10]);
});
