// src/js/app.js
// ------------------------------------------------------------
// App entry point.
// Orchestrates data loading, scoring, sorting, rendering, and refresh.
// ------------------------------------------------------------

import { fetchTodaysGames } from "./api.js";
import { CONFIG, loadConfigOverridesFromServer } from "./config.js";
import {
  clearMessage,
  renderGames,
  renderTicker,
  showMessage,
  stopTickerCycle,
  updateCurrentTime,
  updateLastUpdated,
  updateRefreshIntervalLabel,
} from "./render.js";
import { scoreGames, sortGamesByImportance } from "./scoring.js";

let isRefreshing = false;
let refreshIntervalId = null;
let clockIntervalId = null;
let resizeDebounceId = null;
let hasRenderedOnce = false;
let lastCardsSignature = "";
let lastTickerSignature = "";
let latestSortedGames = [];
let visibleGameLimit = getMaxVisibleGames();
const finalSeenEpochByGameId = new Map();

/**
 * Load fresh game data and update the dashboard.
 */
async function refreshDashboard() {
  // Avoid overlapping requests if a previous refresh is still in-flight.
  if (isRefreshing) {
    return;
  }

  isRefreshing = true;
  const isFirstLoad = !hasRenderedOnce;

  try {
    // Show loading only on first load so periodic refreshes feel smooth.
    if (isFirstLoad) {
      showMessage(CONFIG.UI_TEXT.loading, "info");
    }

    const games = await fetchTodaysGames();
    const gamesWithFinalTiming = annotateFinalTiming(games);
    const scoredGames = scoreGames(gamesWithFinalTiming);
    const sortedGames = sortGamesByImportance(scoredGames);
    maybeLogScoringSnapshot(sortedGames);
    latestSortedGames = sortedGames;
    renderFromSortedGames(sortedGames);

    clearMessage();
    updateLastUpdated(new Date());
    hasRenderedOnce = true;
  } catch (error) {
    console.error("Dashboard refresh failed:", error);
    showMessage(CONFIG.UI_TEXT.fetchError, "error");
  } finally {
    isRefreshing = false;
  }
}

/**
 * Start repeating timers for clock and API refresh.
 */
function startTimers() {
  const hasCurrentTimeElement = Boolean(document.getElementById("currentTime"));
  const hasRefreshLabelElement = Boolean(document.getElementById("refreshIntervalLabel"));

  if (hasRefreshLabelElement) {
    updateRefreshIntervalLabel(CONFIG.API.REFRESH_INTERVAL_MS);
  }

  if (hasCurrentTimeElement) {
    updateCurrentTime(new Date());
    clockIntervalId = window.setInterval(() => {
      updateCurrentTime(new Date());
    }, CONFIG.CLOCK_INTERVAL_MS);
  }

  refreshIntervalId = window.setInterval(() => {
    refreshDashboard();
  }, CONFIG.API.REFRESH_INTERVAL_MS);
}

/**
 * Cleanup timers if the page is unloaded.
 */
function stopTimers() {
  if (clockIntervalId) {
    clearInterval(clockIntervalId);
    clockIntervalId = null;
  }

  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }

  stopTickerCycle();

  if (resizeDebounceId) {
    clearTimeout(resizeDebounceId);
    resizeDebounceId = null;
  }
}

/**
 * Build a compact fingerprint of visible game state.
 * If this value is unchanged, we can keep existing DOM as-is.
 */
function buildRenderSignature(games) {
  return games
    .map((game) => {
      return [
        game.id,
        game.status,
        game.statusDetail ?? "",
        game.clock ?? "",
        game.startTime ?? "",
        game.awayTeam?.score ?? "",
        game.homeTeam?.score ?? "",
      ].join("|");
    })
    .join(";");
}

/**
 * Keep only the top games that fit on TV without scrolling.
 */
function getVisibleGames(sortedGames) {
  const tvLayout = CONFIG.TV_LAYOUT;

  if (!tvLayout?.enabled) {
    return sortedGames;
  }

  return sortedGames.slice(0, visibleGameLimit);
}

function getHiddenGames(sortedGames, visibleCount) {
  return sortedGames.slice(visibleCount);
}

/**
 * Push TV layout values into CSS variables.
 */
function applyTvLayoutCssVariables() {
  const tvLayout = CONFIG.TV_LAYOUT;

  if (!tvLayout?.enabled) {
    return;
  }

  const maxVisibleGames = getMaxVisibleGames();
  const gap = getPositiveNumber(tvLayout.gapPx, 10);
  const outerPadding = getPositiveNumber(tvLayout.outerPaddingPx, gap);
  const tickerHeight = CONFIG.TICKER?.enabled
    ? getPositiveNumber(tvLayout.tickerHeightPx, 46)
    : 0;
  const targetCardAspectRatio = getPositiveNumber(tvLayout.targetCardAspectRatio, 1.4);

  const availableWidth = Math.max(320, window.innerWidth - outerPadding * 2);
  const availableHeight = Math.max(
    240,
    window.innerHeight - outerPadding * 2 - tickerHeight - gap
  );

  const gridLayout = tvLayout.autoGridFromMaxVisible
    ? calculateAutoGridLayout({
        maxVisibleGames,
        availableWidth,
        availableHeight,
        gap,
        targetCardAspectRatio,
      })
    : calculateManualGridLayout({
        columns: getPositiveInteger(tvLayout.columns, 4),
        rows: getPositiveInteger(tvLayout.rows, 3),
        availableWidth,
        availableHeight,
        gap,
      });

  const gridCapacity = gridLayout.columns * gridLayout.rows;
  visibleGameLimit = tvLayout.autoGridFromMaxVisible
    ? maxVisibleGames
    : gridCapacity;

  const root = document.documentElement;
  root.style.setProperty("--tv-columns", String(gridLayout.columns));
  root.style.setProperty("--tv-rows", String(gridLayout.rows));
  root.style.setProperty("--tv-gap", `${gap}px`);
  root.style.setProperty("--tv-card-width", `${gridLayout.cardWidth}px`);
  root.style.setProperty("--tv-card-height", `${gridLayout.cardHeight}px`);
  root.style.setProperty("--ticker-height", `${tickerHeight}px`);
}

async function startApp() {
  await loadConfigOverridesFromServer();
  applyTvLayoutCssVariables();
  window.addEventListener("resize", handleResize);
  startTimers();
  await refreshDashboard();
}

function handleResize() {
  if (resizeDebounceId) {
    clearTimeout(resizeDebounceId);
  }

  resizeDebounceId = window.setTimeout(() => {
    applyTvLayoutCssVariables();

    // Re-render current data using new card dimensions/slot count.
    if (latestSortedGames.length > 0) {
      lastCardsSignature = "";
      lastTickerSignature = "";
      renderFromSortedGames(latestSortedGames);
    }
  }, 120);
}

function renderFromSortedGames(sortedGames) {
  const visibleGames = getVisibleGames(sortedGames);
  const hiddenGames = getHiddenGames(sortedGames, visibleGames.length);
  const nextCardsSignature = buildRenderSignature(visibleGames);
  const nextTickerSignature = buildRenderSignature(hiddenGames);

  if (nextCardsSignature !== lastCardsSignature) {
    renderGames(visibleGames);
    lastCardsSignature = nextCardsSignature;
  }

  if (nextTickerSignature !== lastTickerSignature) {
    renderTicker(hiddenGames);
    lastTickerSignature = nextTickerSignature;
  }
}

function maybeLogScoringSnapshot(sortedGames) {
  const debugConfig = CONFIG.SCORING_DEBUG;

  if (!debugConfig?.enabled) {
    return;
  }

  const topN = getPositiveInteger(debugConfig.topGamesToLog, 12);
  const rows = sortedGames.slice(0, topN).map((game, index) => {
    const matchup = `${game.awayTeam?.shortName ?? game.awayTeam?.name} @ ${
      game.homeTeam?.shortName ?? game.homeTeam?.name
    }`;

    const breakdown = Array.isArray(game.importanceBreakdown)
      ? game.importanceBreakdown.map((item) => `${item.label}:${item.value}`).join(" + ")
      : "";

    return {
      rank: index + 1,
      score: game.importanceScore,
      status: game.status,
      matchup,
      breakdown,
    };
  });

  console.table(rows);
}

/**
 * Track when each game first becomes FINAL.
 * Scoring uses this to keep newly final games visible for a short time.
 */
function annotateFinalTiming(games) {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const seenIds = new Set();

  const enrichedGames = games.map((game) => {
    const gameId = String(game.id ?? "");

    if (!gameId) {
      return game;
    }

    seenIds.add(gameId);

    if (game.status === "FINAL") {
      if (!finalSeenEpochByGameId.has(gameId)) {
        finalSeenEpochByGameId.set(gameId, nowEpoch);
      }

      return {
        ...game,
        finalSeenEpoch: finalSeenEpochByGameId.get(gameId),
      };
    }

    finalSeenEpochByGameId.delete(gameId);
    return {
      ...game,
      finalSeenEpoch: null,
    };
  });

  // Cleanup ids that disappeared from the feed.
  Array.from(finalSeenEpochByGameId.keys()).forEach((gameId) => {
    if (!seenIds.has(gameId)) {
      finalSeenEpochByGameId.delete(gameId);
    }
  });

  return enrichedGames;
}

function getMaxVisibleGames() {
  return getPositiveInteger(CONFIG.TV_LAYOUT?.maxVisibleGames, 12);
}

function calculateAutoGridLayout({
  maxVisibleGames,
  availableWidth,
  availableHeight,
  gap,
  targetCardAspectRatio,
}) {
  let bestLayout = null;

  for (let columns = 1; columns <= maxVisibleGames; columns += 1) {
    const rows = Math.ceil(maxVisibleGames / columns);
    const cardWidth = (availableWidth - gap * (columns - 1)) / columns;
    const cardHeight = (availableHeight - gap * (rows - 1)) / rows;

    if (!Number.isFinite(cardWidth) || !Number.isFinite(cardHeight)) {
      continue;
    }

    if (cardWidth <= 0 || cardHeight <= 0) {
      continue;
    }

    const aspectRatio = cardWidth / cardHeight;
    const aspectPenalty = Math.abs(Math.log(aspectRatio / targetCardAspectRatio));
    const area = cardWidth * cardHeight;
    const score = area / (1 + aspectPenalty * 8);

    if (!bestLayout || score > bestLayout.score) {
      bestLayout = {
        columns,
        rows,
        cardWidth,
        cardHeight,
        score,
      };
    }
  }

  if (!bestLayout) {
    return {
      columns: 1,
      rows: maxVisibleGames,
      cardWidth: Math.max(120, availableWidth),
      cardHeight: Math.max(80, availableHeight / Math.max(1, maxVisibleGames)),
    };
  }

  return {
    columns: bestLayout.columns,
    rows: bestLayout.rows,
    cardWidth: Math.max(120, Math.floor(bestLayout.cardWidth)),
    cardHeight: Math.max(80, Math.floor(bestLayout.cardHeight)),
  };
}

function calculateManualGridLayout({
  columns,
  rows,
  availableWidth,
  availableHeight,
  gap,
}) {
  const cardWidth = (availableWidth - gap * (columns - 1)) / columns;
  const cardHeight = (availableHeight - gap * (rows - 1)) / rows;

  return {
    columns,
    rows,
    cardWidth: Math.max(120, Math.floor(cardWidth)),
    cardHeight: Math.max(80, Math.floor(cardHeight)),
  };
}

function getPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function getPositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

document.addEventListener("DOMContentLoaded", () => {
  startApp();
});

window.addEventListener("beforeunload", () => {
  window.removeEventListener("resize", handleResize);
  stopTimers();
});
