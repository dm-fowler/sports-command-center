// src/js/rooting.js
// ------------------------------------------------------------
// Bracket rooting helpers.
// Adds per-team "root for this team" dots based on:
// 1) game round
// 2) your bracket picks for that round
// ------------------------------------------------------------

import { CONFIG } from "./config.js";
import { normalizeKey } from "./utils.js";

const DEFAULT_DOT_COLORS = [
  "#00d1a6",
  "#ffb84d",
  "#ff6b6b",
  "#66b3ff",
  "#c98bff",
  "#ffd166",
];

/**
 * Annotate games with bracket rooting metadata.
 * Returns:
 * - games: original games with `rootingDots` and `rootingRoundKey`
 * - legendItems: bracket key items for UI legend
 */
export function annotateGamesWithBracketRooting(games) {
  if (!Array.isArray(games) || games.length === 0) {
    return {
      games: [],
      legendItems: [],
      enabled: false,
    };
  }

  const rootingConfig = CONFIG.BRACKET_ROOTING;
  const marchMadnessMode = Boolean(CONFIG.GAME_FILTERS?.marchMadnessOnly);
  const rootingEnabled = Boolean(rootingConfig?.enabled) || marchMadnessMode;

  if (!rootingEnabled) {
    return {
      games: games.map((game) => ({
        ...game,
        rootingDots: { away: [], home: [] },
        rootingRoundKey: null,
      })),
      legendItems: [],
      enabled: false,
    };
  }

  const normalizedBrackets = buildNormalizedBrackets(rootingConfig?.brackets);

  const annotatedGames = games.map((game) => {
    const roundKey = resolveRoundKey(game?.tournamentRound, rootingConfig?.roundAliases);

    if (!roundKey) {
      return {
        ...game,
        rootingDots: { away: [], home: [] },
        rootingRoundKey: null,
      };
    }

    const awayDots = getBracketDotsForTeam({
      team: game?.awayTeam,
      roundKey,
      brackets: normalizedBrackets,
    });

    const homeDots = getBracketDotsForTeam({
      team: game?.homeTeam,
      roundKey,
      brackets: normalizedBrackets,
    });

    return {
      ...game,
      rootingDots: {
        away: awayDots,
        home: homeDots,
      },
      rootingRoundKey: roundKey,
    };
  });

  return {
    games: annotatedGames,
    legendItems: normalizedBrackets.map((bracket) => ({
      id: bracket.id,
      name: bracket.name,
      color: bracket.color,
    })),
    enabled: true,
  };
}

function buildNormalizedBrackets(brackets) {
  const source = Array.isArray(brackets) ? brackets : [];
  const normalized = [];

  source.forEach((bracket, index) => {
    if (!bracket || typeof bracket !== "object") {
      return;
    }

    const id = normalizeBracketId(bracket.id, index);
    const name = String(bracket.name ?? `Bracket ${index + 1}`).trim() || `Bracket ${index + 1}`;
    const color = normalizeColor(bracket.color, index);
    const picksByRound = normalizePicksByRound(bracket.picksByRound);

    normalized.push({
      id,
      name,
      color,
      picksByRound,
    });
  });

  return normalized;
}

function normalizeBracketId(value, index) {
  const normalized = normalizeKey(String(value ?? "").replace(/-/g, " "));
  const slug = normalized.replace(/\s+/g, "-");
  return slug || `bracket-${index + 1}`;
}

function normalizeColor(colorValue, index) {
  const fallback = DEFAULT_DOT_COLORS[index % DEFAULT_DOT_COLORS.length];
  const color = String(colorValue ?? "").trim();

  if (!color) {
    return fallback;
  }

  // Accept common CSS color strings.
  return color;
}

function normalizePicksByRound(rawPicksByRound) {
  const normalized = new Map();

  if (!rawPicksByRound || typeof rawPicksByRound !== "object") {
    return normalized;
  }

  Object.entries(rawPicksByRound).forEach(([rawRoundKey, rawTeamList]) => {
    const roundKey = normalizeRoundKey(rawRoundKey);

    if (!roundKey) {
      return;
    }

    const teamKeys = Array.isArray(rawTeamList)
      ? rawTeamList
          .map((teamName) => normalizeTeamInputKey(teamName))
          .filter(Boolean)
      : [];

    normalized.set(roundKey, new Set(teamKeys));
  });

  return normalized;
}

function resolveRoundKey(roundText, roundAliases) {
  const baseRoundKey = normalizeRoundKey(roundText);
  if (!baseRoundKey) {
    return null;
  }

  const aliasMap = buildRoundAliasMap(roundAliases);
  return aliasMap.get(baseRoundKey) ?? baseRoundKey;
}

function buildRoundAliasMap(roundAliases) {
  const aliasMap = new Map();
  const source = roundAliases && typeof roundAliases === "object" ? roundAliases : {};

  Object.entries(source).forEach(([rawAlias, rawCanonical]) => {
    const aliasKey = normalizeRoundKey(rawAlias);
    const canonicalKey = normalizeRoundKey(rawCanonical);

    if (!aliasKey || !canonicalKey) {
      return;
    }

    aliasMap.set(aliasKey, canonicalKey);
  });

  return aliasMap;
}

function normalizeRoundKey(value) {
  const text = normalizeKey(String(value ?? ""));

  if (!text) {
    return "";
  }

  // Keep round keys human-friendly but stable.
  return text.replace(/\s+/g, "-");
}

function getBracketDotsForTeam({ team, roundKey, brackets }) {
  if (!team || !roundKey || !Array.isArray(brackets) || brackets.length === 0) {
    return [];
  }

  const teamKeys = getTeamLookupKeys(team);

  if (teamKeys.length === 0) {
    return [];
  }

  return brackets
    .filter((bracket) => bracketIncludesTeamForRound(bracket, roundKey, teamKeys))
    .map((bracket) => ({
      id: bracket.id,
      name: bracket.name,
      color: bracket.color,
    }));
}

function bracketIncludesTeamForRound(bracket, roundKey, teamKeys) {
  const pickedTeamSet = bracket?.picksByRound?.get(roundKey);

  if (!(pickedTeamSet instanceof Set) || pickedTeamSet.size === 0) {
    return false;
  }

  return teamKeys.some((teamKey) => pickedTeamSet.has(teamKey));
}

function getTeamLookupKeys(team) {
  const values = [
    team?.name,
    team?.shortName,
    String(team?.seo ?? "").replace(/-/g, " "),
  ];

  const keys = values
    .map((value) => normalizeTeamInputKey(value))
    .filter(Boolean);

  return Array.from(new Set(keys));
}

function normalizeTeamInputKey(value) {
  const base = normalizeKey(String(value ?? ""));

  if (!base) {
    return "";
  }

  // Allow "St." and "State" inputs to match each other.
  return base
    .replace(/^\d+\s+/, "")
    .replace(/\bst\b/g, "state")
    .replace(/\s+/g, " ")
    .trim();
}
