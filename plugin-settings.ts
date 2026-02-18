export type FilterMatchMode = "any" | "all";

export type FiveYearJournalSettings = {
	filterField: string;
	filterValues: string;
	filterMatchMode: FilterMatchMode;
	dateField: string;
	yearsBack: number;
	showThisYearSection: boolean;
	previewMaxLines: number;
	previewMaxChars: number;
};

export const DEFAULT_SETTINGS: FiveYearJournalSettings = {
	filterField: "tags",
	filterValues: "journal",
	filterMatchMode: "any",
	dateField: "created",
	yearsBack: 4,
	showThisYearSection: true,
	previewMaxLines: 4,
	previewMaxChars: 420,
};

export function normalizeSettings(value: unknown): FiveYearJournalSettings {
	const source = isRecord(value) ? value : {};
	const maybeMode = source.filterMatchMode;
	const filterMatchMode: FilterMatchMode = maybeMode === "all" ? "all" : "any";

	return {
		filterField: normalizeNonEmptyString(source.filterField, DEFAULT_SETTINGS.filterField),
		filterValues: normalizeCsvText(source.filterValues, DEFAULT_SETTINGS.filterValues),
		filterMatchMode,
		dateField: normalizeNonEmptyString(source.dateField, DEFAULT_SETTINGS.dateField),
		yearsBack: clampInt(source.yearsBack, 1, 20, DEFAULT_SETTINGS.yearsBack),
		showThisYearSection: typeof source.showThisYearSection === "boolean" ? source.showThisYearSection : true,
		previewMaxLines: clampInt(source.previewMaxLines, 1, 12, DEFAULT_SETTINGS.previewMaxLines),
		previewMaxChars: clampInt(source.previewMaxChars, 80, 2000, DEFAULT_SETTINGS.previewMaxChars),
	};
}

export function parseFilterValues(csv: string): string[] {
	return csv
		.split(",")
		.map((token) => token.trim())
		.filter((token) => token.length > 0);
}

export function normalizeFilterToken(field: string, token: string): string {
	const normalized = token.trim().toLowerCase();
	if (field.trim().toLowerCase() === "tags") {
		return normalized.startsWith("#") ? normalized : `#${normalized}`;
	}

	return normalized;
}

export function extractComparableValues(field: string, value: unknown): string[] {
	const fieldName = field.trim().toLowerCase();
	const values = Array.isArray(value) ? value : [value];
	const normalized: string[] = [];

	for (const item of values) {
		const converted = toStringValue(item);
		if (!converted) {
			continue;
		}

		normalized.push(normalizeFilterToken(fieldName, converted));
	}

	return normalized;
}

export function filterMatches(
	field: string,
	rawValue: unknown,
	filterValuesCsv: string,
	mode: FilterMatchMode,
): boolean {
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

export function shouldRebuildIndex(
	previous: FiveYearJournalSettings,
	next: FiveYearJournalSettings,
): boolean {
	return (
		previous.filterField !== next.filterField ||
		previous.filterValues !== next.filterValues ||
		previous.filterMatchMode !== next.filterMatchMode ||
		previous.dateField !== next.dateField
	);
}

function normalizeNonEmptyString(value: unknown, fallback: string): string {
	if (typeof value !== "string") {
		return fallback;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeCsvText(value: unknown, fallback: string): string {
	if (typeof value !== "string") {
		return fallback;
	}

	const trimmed = value
		.split(",")
		.map((token) => token.trim())
		.filter((token) => token.length > 0)
		.join(", ");

	return trimmed.length > 0 ? trimmed : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	const asNumber = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(asNumber)) {
		return fallback;
	}

	const rounded = Math.round(asNumber);
	return Math.max(min, Math.min(max, rounded));
}

function toStringValue(value: unknown): string | null {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		const trimmed = String(value).trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
