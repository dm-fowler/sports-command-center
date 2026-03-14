// src/js/api.js
// ------------------------------------------------------------
// Handles all NCAA API communication and data normalization.
// The rest of the app should only use normalized game objects.
// ------------------------------------------------------------

import { CONFIG, getLocalServerBaseUrl } from "./config.js";
import { buildNcaaLogoUrl, normalizeKey, safeText, toNumber, toSlug } from "./utils.js";

const LOCAL_LOGO_MATCH_LIMIT = 4;
const LOCAL_LOGO_MIN_SCORE = 38;
const RANKINGS_CACHE_TTL_MS = 10 * 60 * 1000;
const STANDINGS_CACHE_TTL_MS = 10 * 60 * 1000;
const NCAA_DIRECT_BASE_URL = "https://ncaa-api.henrygd.me";

let localLogoCatalogCache = null;
let localLogoCatalogPromise = null;
const localLogoLookupCache = new Map();
let rankingsMapCache = null;
let rankingsLoadedAt = 0;
let rankingsMapPromise = null;
let standingsMapCache = null;
let standingsLoadedAt = 0;
let standingsMapPromise = null;

/**
 * Fetch today's Division I men's basketball games.
 */
export async function fetchTodaysGames() {
  // Example resolved URL:
  // http://localhost:3000/api/scoreboard/basketball-men/d1
  try {
    const [rawData, localLogoCatalog, rankingsMap, standingsMap] = await Promise.all([
      fetchScoreboardData(),
      loadLocalLogoCatalog(),
      loadRankingsMap(),
      loadStandingsMap(),
    ]);

    return normalizeScoreboardResponse(rawData, localLogoCatalog, rankingsMap, standingsMap);
  } catch (error) {
    throw new Error(error.message || "Unknown API error.");
  }
}

/**
 * Normalize the full API response into an array of clean game objects.
 */
function normalizeScoreboardResponse(rawData, localLogoCatalog, rankingsMap, standingsMap) {
  const rawGames = Array.isArray(rawData?.games) ? rawData.games : [];

  return rawGames
    .map((rawGameWrapper) =>
      normalizeGame(
        rawGameWrapper?.game ?? rawGameWrapper,
        localLogoCatalog,
        rankingsMap,
        standingsMap
      )
    )
    .filter(Boolean);
}

/**
 * Normalize one game object so other files do not depend on raw API shape.
 */
function normalizeGame(rawGame, localLogoCatalog, rankingsMap, standingsMap) {
  if (!rawGame || !rawGame.gameID) {
    return null;
  }

  const status = normalizeStatus(rawGame.gameState);
  const statusDetail =
    safeText(rawGame.finalMessage, null) || safeText(rawGame.currentPeriod, null);

  return {
    id: String(rawGame.gameID),
    status,
    statusDetail,
    clock: status === "LIVE" ? safeText(rawGame.contestClock, null) : null,
    startTime: safeText(rawGame.startTime, null),
    startTimeEpoch: toNumber(rawGame.startTimeEpoch, null),
    network: safeText(rawGame.network, null),
    tournamentRound: safeText(rawGame.bracketRound, null),
    region: safeText(rawGame.bracketRegion, null),
    awayTeam: normalizeTeam(rawGame.away, localLogoCatalog, rankingsMap, standingsMap),
    homeTeam: normalizeTeam(rawGame.home, localLogoCatalog, rankingsMap, standingsMap),
  };
}

/**
 * Normalize a team object into stable fields used by the UI and scoring.
 */
function normalizeTeam(rawTeam, localLogoCatalog, rankingsMap, standingsMap) {
  const names = rawTeam?.names ?? {};
  const logoSlugs = buildLogoSlugCandidates(names);
  const seo = logoSlugs[0] ?? null;
  const branding = CONFIG.TEAM_BRANDING ?? {};
  const logoBaseUrl = branding.LOGO_BASE_URL;
  const useRealLogos = branding.USE_REAL_LOGOS !== false;
  const useLocalLogos = branding.LOCAL_LOGOS_ENABLED !== false;
  const preferLocalLogos = branding.PREFER_LOCAL_LOGOS !== false;

  const remoteLogoUrls = useRealLogos
    ? logoSlugs.map((slug) => buildNcaaLogoUrl(slug, logoBaseUrl)).filter(Boolean)
    : [];
  const localLogoOverrideUrl = useLocalLogos
    ? resolveLocalLogoOverrideUrl(names, localLogoCatalog)
    : null;
  const matchedLocalLogoUrls = useLocalLogos
    ? resolveLocalLogoUrls(names, localLogoCatalog)
    : [];
  const localLogoUrls = mergeUniqueUrls(
    localLogoOverrideUrl ? [localLogoOverrideUrl] : [],
    matchedLocalLogoUrls
  );
  const logoUrls = preferLocalLogos
    ? mergeUniqueUrls(localLogoUrls, remoteLogoUrls)
    : mergeUniqueUrls(remoteLogoUrls, localLogoUrls);
  const logoUrl = logoUrls[0] ?? null;

  return {
    name: safeText(names.short, null) || safeText(names.full, "Unknown Team"),
    shortName: safeText(names.char6, null) || safeText(names.short, "TEAM"),
    seo,
    logoUrl,
    logoUrls,
    rank: parseTeamRank(rawTeam, names, rankingsMap),
    conference: normalizeConference(rawTeam?.conferences),
    score: parseScore(rawTeam?.score),
    record: parseTeamRecord(rawTeam, names, rankingsMap, standingsMap),
  };
}

async function fetchScoreboardData() {
  const endpoint = `${CONFIG.API.BASE_URL}/scoreboard/${CONFIG.API.SPORT}/${CONFIG.API.DIVISION_PATH}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, CONFIG.API.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The NCAA API request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadRankingsMap() {
  const now = Date.now();
  const cacheIsFresh = rankingsMapCache && now - rankingsLoadedAt < RANKINGS_CACHE_TTL_MS;

  if (cacheIsFresh) {
    return rankingsMapCache;
  }

  if (rankingsMapPromise) {
    return rankingsMapPromise;
  }

  const rankingsPath = `/rankings/${CONFIG.API.SPORT}/${CONFIG.API.DIVISION_PATH}`;
  const rankingsUrls = [
    `${CONFIG.API.BASE_URL}${rankingsPath}`,
    `${NCAA_DIRECT_BASE_URL}${rankingsPath}`,
  ];

  rankingsMapPromise = fetchJsonFromCandidateUrls(rankingsUrls, "Rankings")
    .then((payload) => {
      const rankingsData = Array.isArray(payload?.data) ? payload.data : [];
      rankingsMapCache = buildRankingsMap(rankingsData);
      rankingsLoadedAt = Date.now();
      return rankingsMapCache;
    })
    .catch((error) => {
      console.warn("Rankings endpoint unavailable. Using scoreboard-only rank values.", error.message);
      rankingsMapCache = rankingsMapCache ?? new Map();
      return rankingsMapCache;
    })
    .finally(() => {
      rankingsMapPromise = null;
    });

  return rankingsMapPromise;
}

function buildRankingsMap(rankingsData) {
  const map = new Map();

  rankingsData.forEach((entry) => {
    const rankValue = parseRank(entry?.RANK);
    const schoolWithVotes = safeText(entry?.["SCHOOL (1ST PLACE VOTES)"], null);

    if (!rankValue || !schoolWithVotes) {
      return;
    }

    const schoolName = schoolWithVotes.replace(/\s*\(\d+\)\s*$/, "").trim();
    const keys = buildNameLookupKeys(schoolName);
    keys.forEach((key) => {
      if (!map.has(key)) {
        map.set(key, {
          rank: rankValue,
          record: extractRecordText(entry?.RECORD),
        });
      }
    });
  });

  return map;
}

function normalizeRankingNameKey(value) {
  const base = normalizeKey(value)
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!base) {
    return "";
  }

  return base;
}

function buildNameLookupKeys(value) {
  const base = normalizeRankingNameKey(value);

  if (!base) {
    return [];
  }

  const keys = new Set([base]);
  keys.add(normalizeRankingNameKey(base.replace(/\bst\b/g, "state")));

  const aliasKeys = [
    [/\buconn\b/g, "connecticut"],
    [/\bconnecticut\b/g, "uconn"],
    [/\bole miss\b/g, "mississippi"],
    [/\bflorida st\b/g, "florida state"],
    [/\bnc state\b/g, "north carolina state"],
    [/\blsu\b/g, "louisiana state"],
  ];

  aliasKeys.forEach(([pattern, replacement]) => {
    const variant = normalizeRankingNameKey(base.replace(pattern, replacement));
    if (variant) {
      keys.add(variant);
    }
  });

  return Array.from(keys).filter(Boolean);
}

function parseTeamRank(rawTeam, names, rankingsMap) {
  const directRank = parseRank(rawTeam?.rank);
  if (directRank) {
    return directRank;
  }

  if (!(rankingsMap instanceof Map) || rankingsMap.size === 0) {
    return null;
  }

  const candidates = buildRankingNameCandidates(names);

  for (const candidate of candidates) {
    const entry = rankingsMap.get(candidate);
    const rank = toNumber(entry?.rank, null);
    if (Number.isInteger(rank) && rank > 0) {
      return rank;
    }
  }

  return null;
}

function parseTeamRecord(rawTeam, names, rankingsMap, standingsMap) {
  const scoreboardRecord = extractRecordText(rawTeam?.description);
  if (scoreboardRecord) {
    return scoreboardRecord;
  }

  const candidates = buildRankingNameCandidates(names);

  if (standingsMap instanceof Map && standingsMap.size > 0) {
    for (const candidate of candidates) {
      const record = standingsMap.get(candidate);
      if (record) {
        return record;
      }
    }
  }

  if (rankingsMap instanceof Map && rankingsMap.size > 0) {
    for (const candidate of candidates) {
      const record = extractRecordText(rankingsMap.get(candidate)?.record);
      if (record) {
        return record;
      }
    }
  }

  return null;
}

async function loadStandingsMap() {
  const now = Date.now();
  const cacheIsFresh = standingsMapCache && now - standingsLoadedAt < STANDINGS_CACHE_TTL_MS;

  if (cacheIsFresh) {
    return standingsMapCache;
  }

  if (standingsMapPromise) {
    return standingsMapPromise;
  }

  const standingsPath = `/standings/${CONFIG.API.SPORT}/${CONFIG.API.DIVISION_PATH}`;
  const standingsUrls = [
    `${CONFIG.API.BASE_URL}${standingsPath}`,
    `${NCAA_DIRECT_BASE_URL}${standingsPath}`,
  ];

  standingsMapPromise = fetchJsonFromCandidateUrls(standingsUrls, "Standings")
    .then((payload) => {
      standingsMapCache = buildStandingsMap(payload?.data);
      standingsLoadedAt = Date.now();
      return standingsMapCache;
    })
    .catch((error) => {
      console.warn("Standings endpoint unavailable. Records may be missing.", error.message);
      standingsMapCache = standingsMapCache ?? new Map();
      return standingsMapCache;
    })
    .finally(() => {
      standingsMapPromise = null;
    });

  return standingsMapPromise;
}

function buildStandingsMap(standingsData) {
  const map = new Map();
  const conferences = Array.isArray(standingsData) ? standingsData : [];

  conferences.forEach((conference) => {
    const teams = Array.isArray(conference?.standings) ? conference.standings : [];

    teams.forEach((teamRow) => {
      const school = safeText(teamRow?.School, null);
      const wins = safeText(teamRow?.["Overall W"], null);
      const losses = safeText(teamRow?.["Overall L"], null);

      if (!school || !wins || !losses) {
        return;
      }

      const record = `${wins}-${losses}`;
      const keys = getStandingsNameKeys(school);
      keys.forEach((key) => {
        if (!map.has(key)) {
          map.set(key, record);
        }
      });
    });
  });

  return map;
}

function getStandingsNameKeys(name) {
  return buildNameLookupKeys(name);
}

function extractRecordText(value) {
  const text = safeText(value, null);
  if (!text) {
    return null;
  }

  const match = /(\d+)\s*-\s*(\d+)/.exec(text);
  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}`;
}

function buildRankingNameCandidates(names) {
  const rawCandidates = [
    safeText(names?.short, null),
    safeText(names?.full, null),
    safeText(names?.seo, null),
    safeText(names?.char6, null),
  ];

  const normalized = [];

  rawCandidates.forEach((candidate) => {
    const baseKeys = buildNameLookupKeys(candidate);

    if (baseKeys.length === 0) {
      return;
    }

    baseKeys.forEach((key) => {
      if (!normalized.includes(key)) {
        normalized.push(key);
      }
    });

    if (!candidate) {
      return;
    }

    const noParentheses = String(candidate).replace(/\s*\(.*?\)\s*/g, " ");
    buildNameLookupKeys(noParentheses).forEach((key) => {
      if (!normalized.includes(key)) {
        normalized.push(key);
      }
    });
  });

  return normalized;
}

async function fetchJsonFromCandidateUrls(urls, label) {
  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`${label} request failed (${response.status})`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`${label} request failed`);
}

function buildLogoSlugCandidates(names) {
  const candidates = [];

  const addCandidate = (value) => {
    const slug = toSlug(value);

    if (!slug) {
      return;
    }

    if (!candidates.includes(slug)) {
      candidates.push(slug);
    }
  };

  const shortName = safeText(names?.short, null);
  const fullName = safeText(names?.full, null);
  const seo = safeText(names?.seo, null);

  addCandidate(seo);
  addCandidate(shortName);
  addCandidate(fullName);

  // Extra fallbacks for names with state abbreviations in parentheses.
  if (shortName) {
    addCandidate(shortName.replace(/\s*\(.*?\)\s*/g, " "));
    addCandidate(shortName.replace(/[.'&]/g, " "));
  }

  if (fullName) {
    addCandidate(fullName.replace(/\s*\(.*?\)\s*/g, " "));
    addCandidate(fullName.replace(/[.'&]/g, " "));
  }

  return candidates;
}

async function loadLocalLogoCatalog() {
  const branding = CONFIG.TEAM_BRANDING ?? {};
  const useLocalLogos = branding.LOCAL_LOGOS_ENABLED !== false;

  if (!useLocalLogos) {
    return [];
  }

  if (Array.isArray(localLogoCatalogCache)) {
    return localLogoCatalogCache;
  }

  if (localLogoCatalogPromise) {
    return localLogoCatalogPromise;
  }

  const baseUrl = getLocalServerBaseUrl().replace(/\/$/, "");
  const catalogUrl = safeText(branding.LOCAL_LOGO_CATALOG_URL, null) || `${baseUrl}/logos/catalog`;

  localLogoCatalogPromise = fetch(catalogUrl, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Logo catalog request failed (${response.status})`);
      }

      const payload = await response.json();
      const logoEntries = Array.isArray(payload?.logos) ? payload.logos : [];

      localLogoCatalogCache = logoEntries
        .map((entry) => {
          const url = safeText(entry?.url, null);
          const words = normalizeLogoWords(entry?.words ?? entry?.baseName);

          if (!url || !words) {
            return null;
          }

          return {
            url,
            words,
            compact: words.replace(/\s+/g, ""),
            tokens: words.split(" ").filter(Boolean),
          };
        })
        .filter(Boolean);

      // Catalog changed, reset team match cache.
      localLogoLookupCache.clear();
      return localLogoCatalogCache;
    })
    .catch((error) => {
      console.warn("Local logo catalog unavailable. Using remote logo fallback.", error.message);
      localLogoCatalogCache = [];
      return localLogoCatalogCache;
    })
    .finally(() => {
      localLogoCatalogPromise = null;
    });

  return localLogoCatalogPromise;
}

function resolveLocalLogoUrls(names, localLogoCatalog) {
  if (!Array.isArray(localLogoCatalog) || localLogoCatalog.length === 0) {
    return [];
  }

  const candidates = buildLocalLogoNameCandidates(names);

  if (candidates.length === 0) {
    return [];
  }

  const cacheKey = candidates.map((candidate) => candidate.compact).join("|");

  if (localLogoLookupCache.has(cacheKey)) {
    return localLogoLookupCache.get(cacheKey);
  }

  const scoredLogos = localLogoCatalog
    .map((logoEntry) => {
      const bestScore = candidates.reduce((highest, candidate) => {
        return Math.max(highest, scoreLocalLogoMatch(candidate, logoEntry));
      }, 0);

      return {
        score: bestScore,
        url: logoEntry.url,
      };
    })
    .filter((entry) => entry.score >= LOCAL_LOGO_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const matchedUrls = scoredLogos.slice(0, LOCAL_LOGO_MATCH_LIMIT).map((entry) => entry.url);
  localLogoLookupCache.set(cacheKey, matchedUrls);
  return matchedUrls;
}

function resolveLocalLogoOverrideUrl(names, localLogoCatalog) {
  const overrideMap = CONFIG.TEAM_BRANDING?.LOCAL_LOGO_OVERRIDES;

  if (!overrideMap || typeof overrideMap !== "object") {
    return null;
  }

  const keysToCheck = buildLocalLogoNameCandidates(names)
    .map((candidate) => normalizeOverrideKey(candidate.words))
    .filter(Boolean);

  for (const key of keysToCheck) {
    const overrideValue = safeText(overrideMap[key], null);

    if (!overrideValue) {
      continue;
    }

    const overrideUrl = resolveOverrideValueToLogoUrl(overrideValue, localLogoCatalog);

    if (overrideUrl) {
      return overrideUrl;
    }
  }

  return null;
}

function resolveOverrideValueToLogoUrl(overrideValue, localLogoCatalog) {
  const value = String(overrideValue).trim();

  if (!value) {
    return null;
  }

  if (value.startsWith("/")) {
    return value;
  }

  const normalizedInput = value.toLowerCase();
  const normalizedWithoutExt = normalizedInput.endsWith(".svg")
    ? normalizedInput.slice(0, -4)
    : normalizedInput;

  const match = localLogoCatalog.find((entry) => {
    const fileName = String(entry?.url ?? "")
      .split("/")
      .pop();
    const decodedFileName = decodeURIComponent(fileName || "").toLowerCase();
    const decodedBaseName = decodedFileName.endsWith(".svg")
      ? decodedFileName.slice(0, -4)
      : decodedFileName;

    return decodedFileName === normalizedInput || decodedBaseName === normalizedWithoutExt;
  });

  return match?.url ?? null;
}

function buildLocalLogoNameCandidates(names) {
  const candidates = [];

  const addCandidate = (value) => {
    const words = normalizeLogoWords(value);

    if (!words) {
      return;
    }

    const compact = words.replace(/\s+/g, "");
    const tokens = words
      .split(" ")
      .filter(Boolean)
      .filter((token) => !isLogoStopWord(token));

    if (tokens.length === 0) {
      return;
    }

    if (!candidates.some((candidate) => candidate.compact === compact)) {
      candidates.push({ words, compact, tokens });
    }
  };

  const addStateExpandedCandidate = (value) => {
    const words = normalizeLogoWords(value);

    if (!words) {
      return;
    }

    // Covers common scoreboard abbreviations like "Iowa St." / "Ohio St."
    // by trying a "state" version in addition to the original phrase.
    const expanded = words.replace(/\bst\b/g, "state");
    if (expanded !== words) {
      addCandidate(expanded);
    }
  };

  const shortName = safeText(names?.short, null);
  const fullName = safeText(names?.full, null);
  const seo = safeText(names?.seo, null);
  const char6 = safeText(names?.char6, null);

  addCandidate(seo);
  addCandidate(shortName);
  addCandidate(fullName);
  addCandidate(char6);
  addStateExpandedCandidate(shortName);
  addStateExpandedCandidate(fullName);

  if (shortName) {
    addCandidate(shortName.replace(/\s*\(.*?\)\s*/g, " "));
    addStateExpandedCandidate(shortName.replace(/\s*\(.*?\)\s*/g, " "));
  }

  if (fullName) {
    addCandidate(fullName.replace(/\s*\(.*?\)\s*/g, " "));
    addStateExpandedCandidate(fullName.replace(/\s*\(.*?\)\s*/g, " "));
  }

  return candidates;
}

function scoreLocalLogoMatch(candidate, logoEntry) {
  if (!candidate?.compact || !logoEntry?.compact) {
    return 0;
  }

  if (candidate.compact === logoEntry.compact) {
    return 100;
  }

  if (logoEntry.compact.startsWith(candidate.compact)) {
    const lengthGap = Math.abs(logoEntry.compact.length - candidate.compact.length);

    // Strong prefix match only when candidate is reasonably specific.
    if (candidate.tokens.length >= 2 || lengthGap <= 3) {
      return Math.max(74, 90 - lengthGap);
    }
  }

  if (candidate.words === logoEntry.words) {
    return 96;
  }

  const overlap = getTokenOverlapCount(candidate.tokens, logoEntry.tokens);
  const denominator = Math.max(candidate.tokens.length, logoEntry.tokens.length, 1);
  let score = Math.round((overlap / denominator) * 70);

  // Avoid generic one-token files ("Ohio", "Iowa") winning over specific teams.
  if (logoEntry.tokens.length === 1 && candidate.tokens.length > 1 && overlap === 1) {
    score = Math.min(score, 22);
  }

  if (overlap >= 2) {
    score += 12;
  }

  if (logoEntry.words.includes(candidate.words)) {
    score += 10;
  } else if (candidate.words.includes(logoEntry.words)) {
    score += 8;
  }

  return score;
}

function getTokenOverlapCount(aTokens, bTokens) {
  const setB = new Set(bTokens);
  let overlap = 0;

  aTokens.forEach((token) => {
    if (setB.has(token)) {
      overlap += 1;
    }
  });

  return overlap;
}

function normalizeLogoWords(value) {
  const text = safeText(value, null);

  if (!text) {
    return null;
  }

  return text
    .toLowerCase()
    .replace(/[_'.’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeOverrideKey(value) {
  const words = normalizeLogoWords(value);

  if (!words) {
    return null;
  }

  return words.replace(/\s+/g, "-");
}

function isLogoStopWord(token) {
  return (
    token === "the" ||
    token === "university" ||
    token === "college" ||
    token === "of" ||
    token === "at"
  );
}

function mergeUniqueUrls(...urlLists) {
  const merged = [];

  urlLists.forEach((urlList) => {
    if (!Array.isArray(urlList)) {
      return;
    }

    urlList.forEach((url) => {
      const safeUrl = safeText(url, null);

      if (!safeUrl || merged.includes(safeUrl)) {
        return;
      }

      merged.push(safeUrl);
    });
  });

  return merged;
}

/**
 * Convert raw status values to consistent labels for the app.
 */
function normalizeStatus(rawState) {
  const state = safeText(rawState, "").toLowerCase();

  if (state === "live") {
    return "LIVE";
  }

  if (state === "pre") {
    return "UPCOMING";
  }

  if (state === "final") {
    return "FINAL";
  }

  return "UNKNOWN";
}

/**
 * Parse ranking string into a number, or null when missing.
 */
function parseRank(rawRank) {
  const rank = toNumber(rawRank, null);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

/**
 * Parse score string into a number, or null when missing.
 */
function parseScore(rawScore) {
  const score = toNumber(rawScore, null);
  return Number.isInteger(score) ? score : null;
}

/**
 * Normalize conference from API conference objects.
 */
function normalizeConference(conferences) {
  if (!Array.isArray(conferences) || conferences.length === 0) {
    return null;
  }

  const firstConference = conferences[0] ?? {};
  const conferenceName = safeText(firstConference.conferenceName, null);
  const conferenceSeo = safeText(firstConference.conferenceSeo, null);

  if (conferenceName) {
    return conferenceName;
  }

  if (conferenceSeo) {
    return CONFIG.CONFERENCE_NAME_MAP[conferenceSeo] ?? conferenceSeo;
  }

  return null;
}
