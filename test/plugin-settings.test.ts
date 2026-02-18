import assert from "node:assert/strict";
import test from "node:test";
import {
	DEFAULT_SETTINGS,
	extractComparableValues,
	filterMatches,
	normalizeSettings,
	shouldRebuildIndex,
} from "../plugin-settings.ts";

test("normalizeSettings applies defaults and clamps invalid values", () => {
	const normalized = normalizeSettings({
		filterField: " type ",
		filterValues: " journal, daily , ",
		filterMatchMode: "all",
		dateField: " createdAt ",
		yearsBack: 99,
		showThisYearSection: false,
		previewMaxLines: 0,
		previewMaxChars: 10,
		previewMaxBytes: 10,
	});

	assert.equal(normalized.filterField, "type");
	assert.equal(normalized.filterValues, "journal, daily");
	assert.equal(normalized.filterMatchMode, "all");
	assert.equal(normalized.dateField, "createdAt");
	assert.equal(normalized.yearsBack, 20);
	assert.equal(normalized.showThisYearSection, false);
	assert.equal(normalized.previewMaxLines, 1);
	assert.equal(normalized.previewMaxChars, 80);
	assert.equal(normalized.previewMaxBytes, 4096);
});

test("filterMatches supports tags with and without hash", () => {
	const matches = filterMatches("tags", ["journal", "#daily"], "journal", "any");
	const misses = filterMatches("tags", ["#daily"], "journal", "any");
	assert.equal(matches, true);
	assert.equal(misses, false);
});

test("filterMatches supports any and all modes for arrays", () => {
	const value = ["daily", "reflection"];
	assert.equal(filterMatches("type", value, "daily, reflection", "all"), true);
	assert.equal(filterMatches("type", value, "daily, missing", "all"), false);
	assert.equal(filterMatches("type", value, "missing, reflection", "any"), true);
});

test("extractComparableValues handles primitive frontmatter values", () => {
	assert.deepEqual(extractComparableValues("priority", 2), ["2"]);
	assert.deepEqual(extractComparableValues("done", true), ["true"]);
	assert.deepEqual(extractComparableValues("type", ["Daily", "Reflection"]), ["daily", "reflection"]);
});

test("shouldRebuildIndex triggers only for index-relevant setting changes", () => {
	const base = normalizeSettings(DEFAULT_SETTINGS);
	assert.equal(shouldRebuildIndex(base, { ...base, previewMaxLines: 8 }), false);
	assert.equal(shouldRebuildIndex(base, { ...base, yearsBack: 8 }), false);
	assert.equal(shouldRebuildIndex(base, { ...base, previewMaxBytes: 1024 }), false);
	assert.equal(shouldRebuildIndex(base, { ...base, filterField: "type" }), true);
	assert.equal(shouldRebuildIndex(base, { ...base, filterValues: "daily" }), true);
	assert.equal(shouldRebuildIndex(base, { ...base, filterMatchMode: "all" }), true);
	assert.equal(shouldRebuildIndex(base, { ...base, dateField: "createdAt" }), true);
});
