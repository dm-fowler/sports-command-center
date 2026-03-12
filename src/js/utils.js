// src/js/utils.js
// ------------------------------------------------------------
// Shared helper functions used across modules.
// These stay small and reusable.
// ------------------------------------------------------------

/**
 * Return trimmed text when possible, otherwise a fallback.
 */
export function safeText(value, fallback = null) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  return fallback;
}

/**
 * Convert a value to a number when possible.
 */
export function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Create a simple normalized key for comparisons.
 */
export function normalizeKey(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build short initials for placeholder team logos.
 */
export function getTeamInitials(teamName) {
  const normalizedName = safeText(teamName, "TEAM");
  const words = normalizedName.split(" ").filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

/**
 * Format a score value for display.
 */
export function formatScore(score) {
  return Number.isFinite(score) ? String(score) : "--";
}

/**
 * Check if a team has a valid ranking number.
 */
export function hasRank(team) {
  return Number.isInteger(team?.rank) && team.rank > 0;
}

/**
 * Build a local time string for the dashboard header.
 */
export function formatCurrentDateTime(date) {
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format an elapsed time for "Last Updated".
 */
export function formatTimeOnly(date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Return score margin if both scores exist.
 */
export function getScoreMargin(game) {
  const awayScore = game?.awayTeam?.score;
  const homeScore = game?.homeTeam?.score;

  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return null;
  }

  return Math.abs(awayScore - homeScore);
}

/**
 * Convert text to a URL-friendly slug.
 */
export function toSlug(value) {
  const normalized = normalizeKey(value);
  return normalized.replace(/\s+/g, "-");
}

/**
 * Build the NCAA logo URL for a school slug.
 */
export function buildNcaaLogoUrl(schoolSlug, baseUrl = "https://ncaa-api.henrygd.me/logo") {
  const slug = safeText(schoolSlug, null);
  if (!slug) {
    return null;
  }

  return `${baseUrl}/${slug}.svg`;
}

/**
 * Format epoch time in a specific timezone with a short label.
 */
export function formatEpochTimeWithZone(epochSeconds, timeZone, label = "") {
  const epoch = toNumber(epochSeconds, null);

  if (!Number.isFinite(epoch)) {
    return null;
  }

  const date = new Date(epoch * 1000);
  const formatted = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });

  const zoneLabel = safeText(label, null);
  return zoneLabel ? `${formatted} ${zoneLabel}` : formatted;
}
