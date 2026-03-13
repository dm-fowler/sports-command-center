// src/js/render.js
// ------------------------------------------------------------
// Responsible for all DOM rendering.
// This version updates cards in place to reduce refresh flicker.
// ------------------------------------------------------------

import { CONFIG } from "./config.js";
import {
  formatEpochTimeWithZone,
  formatCurrentDateTime,
  formatScore,
  formatTimeOnly,
  getTeamInitials,
  hasRank,
  safeText,
} from "./utils.js";

const tickerChannels = {
  scores: {
    items: [],
    index: 0,
    timerId: null,
  },
  upcoming: {
    items: [],
    index: 0,
    timerId: null,
  },
};

function getElements() {
  return {
    gamesGrid: document.getElementById("gamesGrid"),
    appMessage: document.getElementById("appMessage"),
    tickerBar: document.getElementById("tickerBar"),
    tickerScoresText: document.getElementById("tickerScoresText"),
    tickerScoresCount: document.getElementById("tickerScoresCount"),
    tickerUpcomingText: document.getElementById("tickerUpcomingText"),
    tickerUpcomingCount: document.getElementById("tickerUpcomingCount"),
    currentTime: document.getElementById("currentTime"),
    lastUpdated: document.getElementById("lastUpdated"),
    refreshIntervalLabel: document.getElementById("refreshIntervalLabel"),
  };
}

/**
 * Render all game cards in the main grid.
 * We reuse existing cards by game id so the UI feels stable.
 */
export function renderGames(games) {
  const { gamesGrid } = getElements();

  if (!gamesGrid) {
    return;
  }

  if (!Array.isArray(games) || games.length === 0) {
    const emptyState = document.createElement("article");
    emptyState.className = "empty-state";
    emptyState.textContent = CONFIG.UI_TEXT.empty;
    gamesGrid.replaceChildren(emptyState);
    return;
  }

  const existingCardMap = getExistingCardMap(gamesGrid);
  const desiredCards = [];

  games.forEach((game) => {
    const existingCard = existingCardMap.get(game.id);

    if (existingCard) {
      updateGameCard(existingCard, game);
      desiredCards.push(existingCard);
      existingCardMap.delete(game.id);
      return;
    }

    desiredCards.push(createGameCard(game));
  });

  // Remove cards for games that no longer exist.
  existingCardMap.forEach((card) => card.remove());

  applyCardOrder(gamesGrid, desiredCards);
}

/**
 * Show loading, info, or error messages at the top of the dashboard.
 */
export function showMessage(message, type = "info") {
  const { appMessage } = getElements();

  if (!appMessage) {
    return;
  }

  appMessage.textContent = message;
  appMessage.className = `app-message app-message--${type}`;
}

/**
 * Hide the message area.
 */
export function clearMessage() {
  const { appMessage } = getElements();

  if (!appMessage) {
    return;
  }

  appMessage.textContent = "";
  appMessage.className = "app-message app-message--hidden";
}

/**
 * Update the header clock every second.
 */
export function updateCurrentTime(date = new Date()) {
  const { currentTime } = getElements();

  if (!currentTime) {
    return;
  }

  currentTime.textContent = formatCurrentDateTime(date);
}

/**
 * Update the "last refresh" timestamp.
 */
export function updateLastUpdated(date = new Date()) {
  const { lastUpdated } = getElements();

  if (!lastUpdated) {
    return;
  }

  lastUpdated.textContent = formatTimeOnly(date);
}

/**
 * Show refresh interval from config.
 */
export function updateRefreshIntervalLabel(intervalMs) {
  const { refreshIntervalLabel } = getElements();

  if (!refreshIntervalLabel) {
    return;
  }

  const seconds = Math.round(intervalMs / 1000);
  refreshIntervalLabel.textContent = `${seconds}s`;
}

/**
 * Render ESPN-style ticker for games that are not visible on cards.
 */
export function renderTicker(hiddenGames, options = {}) {
  const {
    tickerBar,
    tickerScoresText,
    tickerScoresCount,
    tickerUpcomingText,
    tickerUpcomingCount,
  } = getElements();

  if (
    !tickerBar ||
    !tickerScoresText ||
    !tickerScoresCount ||
    !tickerUpcomingText ||
    !tickerUpcomingCount
  ) {
    return;
  }

  if (!CONFIG.TICKER?.enabled || options.forceHidden) {
    tickerBar.classList.add("ticker--hidden");
    stopTickerCycle();
    return;
  }

  tickerBar.classList.remove("ticker--hidden");

  if (!Array.isArray(hiddenGames) || hiddenGames.length === 0) {
    stopTickerCycle();

    setTickerLaneMessage(
      "scores",
      "All top-priority games are currently visible on screen.",
      "",
      false
    );
    setTickerLaneMessage(
      "upcoming",
      "Ticker resumes automatically when additional games are hidden.",
      "",
      false
    );
    return;
  }

  const hiddenScoreGames = hiddenGames.filter((game) => game.status !== "UPCOMING");
  const hiddenUpcomingGames = hiddenGames.filter((game) => game.status === "UPCOMING");

  updateTickerLane({
    lane: "scores",
    games: hiddenScoreGames,
    emptyMessage: "No hidden live/final games right now.",
  });

  updateTickerLane({
    lane: "upcoming",
    games: hiddenUpcomingGames,
    emptyMessage: "No hidden upcoming games right now.",
  });
}

/**
 * Stop ticker interval timer (used on page unload).
 */
export function stopTickerCycle() {
  stopTickerLaneCycle("scores");
  stopTickerLaneCycle("upcoming");
}

function updateTickerLane({ lane, games, emptyMessage }) {
  const channel = tickerChannels[lane];
  const mappedItems = Array.isArray(games) ? games.map(mapTickerGame) : [];

  channel.items = mappedItems;
  channel.index = 0;

  if (channel.items.length === 0) {
    stopTickerLaneCycle(lane);
    setTickerLaneMessage(lane, emptyMessage, "", false);
    return;
  }

  renderTickerLaneItem(lane, channel.items[channel.index], channel.index, channel.items.length);
  restartTickerLaneCycle(lane);
}

function restartTickerLaneCycle(lane) {
  const channel = tickerChannels[lane];
  stopTickerLaneCycle(lane);

  if (!channel || channel.items.length <= 1) {
    return;
  }

  channel.timerId = window.setInterval(() => {
    channel.index = (channel.index + 1) % channel.items.length;
    renderTickerLaneItem(lane, channel.items[channel.index], channel.index, channel.items.length);
  }, CONFIG.TICKER.cycleIntervalMs);
}

function stopTickerLaneCycle(lane) {
  const channel = tickerChannels[lane];

  if (!channel?.timerId) {
    return;
  }

  clearInterval(channel.timerId);
  channel.timerId = null;
}

function renderTickerLaneItem(lane, item, index, total) {
  const { textElement, countElement } = getTickerLaneElements(lane);

  if (!textElement || !countElement || !item) {
    return;
  }

  textElement.replaceChildren();
  textElement.appendChild(
    createTickerSegment(item.statusLabel, "ticker-segment ticker-segment--status", [
      `ticker-status--${item.statusKey}`,
    ])
  );
  textElement.appendChild(createTickerSeparator());
  textElement.appendChild(
    createTickerSegment(item.matchup, "ticker-segment ticker-segment--matchup")
  );
  textElement.appendChild(createTickerSeparator());
  textElement.appendChild(
    createTickerSegment(item.detail, "ticker-segment ticker-segment--detail")
  );

  if (item.network) {
    textElement.appendChild(createTickerSeparator());
    textElement.appendChild(
      createTickerSegment(item.network, "ticker-segment ticker-segment--network")
    );
  }

  if (item.tournament) {
    textElement.appendChild(createTickerSeparator());
    textElement.appendChild(
      createTickerSegment(item.tournament, "ticker-segment ticker-segment--tournament")
    );
  }

  countElement.textContent = `${index + 1}/${total}`;
}

function setTickerLaneMessage(lane, message, count = "", useMutedStyle = true) {
  const { textElement, countElement } = getTickerLaneElements(lane);

  if (!textElement || !countElement) {
    return;
  }

  textElement.replaceChildren();
  const messageClass = useMutedStyle
    ? "ticker-segment ticker-segment--message"
    : "ticker-segment ticker-segment--matchup";
  textElement.appendChild(createTickerSegment(message, messageClass));
  countElement.textContent = count;
}

function getTickerLaneElements(lane) {
  const elements = getElements();

  if (lane === "scores") {
    return {
      textElement: elements.tickerScoresText,
      countElement: elements.tickerScoresCount,
    };
  }

  return {
    textElement: elements.tickerUpcomingText,
    countElement: elements.tickerUpcomingCount,
  };
}

function createGameCard(game) {
  const card = document.createElement("article");
  card.className = "game-card";
  card.dataset.gameId = game.id;

  const cardHeader = createCardHeader();
  const teamsContainer = document.createElement("div");
  teamsContainer.className = "teams";

  const awayTeam = createTeamRow();
  const homeTeam = createTeamRow();

  teamsContainer.appendChild(awayTeam.row);
  teamsContainer.appendChild(homeTeam.row);

  const cardFooter = document.createElement("footer");
  cardFooter.className = "game-card__footer";

  const footerMeta = createFooterMeta();
  cardFooter.appendChild(footerMeta.root);

  card.appendChild(cardHeader.root);
  card.appendChild(teamsContainer);
  card.appendChild(cardFooter);

  // Store references so future updates are fast and readable.
  card._refs = {
    header: cardHeader,
    awayTeam,
    homeTeam,
    footerMeta,
  };

  updateGameCard(card, game);

  return card;
}

function updateGameCard(card, game) {
  card.dataset.gameId = game.id;

  const refs = card._refs;
  refs.header.timeMain.textContent = getTopTimeLabel(game);
  refs.header.statusBadge.textContent = safeText(game.status, "UNKNOWN");
  refs.header.statusBadge.className = `status-chip status-chip--${safeText(
    game.status,
    "UNKNOWN"
  ).toLowerCase()}`;
  refs.footerMeta.network.textContent = safeText(game.network, "Network TBD");
  refs.footerMeta.tournament.textContent = buildTournamentText(game);

  updateTeamRow(refs.awayTeam, game.awayTeam, game.status);
  updateTeamRow(refs.homeTeam, game.homeTeam, game.status);

  if (game.importanceFlags?.isCloseLateGame) {
    card.classList.add("game-card--close-late");
  } else {
    card.classList.remove("game-card--close-late");
  }

  if (game.uiMeta?.isBottomRowRotatorSlot) {
    card.classList.add("game-card--rotating-bottom-row");
  } else {
    card.classList.remove("game-card--rotating-bottom-row");
    card.classList.remove("game-card--rotating-fade-in");
    card.classList.remove("game-card--rotating-fade-out");
  }

  if (game.uiMeta?.fadeInBottomRow) {
    card.classList.add("game-card--rotating-fade-in");
    card.classList.remove("game-card--rotating-fade-out");
  } else {
    card.classList.remove("game-card--rotating-fade-in");
  }
}

function createCardHeader() {
  const root = document.createElement("header");
  root.className = "game-card__header";

  const time = document.createElement("div");
  time.className = "game-card__time";

  const timeMain = document.createElement("p");
  timeMain.className = "time-main";
  time.appendChild(timeMain);

  const statusBadge = document.createElement("span");
  statusBadge.className = "status-chip status-chip--unknown";

  root.appendChild(time);
  root.appendChild(statusBadge);

  return {
    root,
    timeMain,
    statusBadge,
  };
}

function createFooterMeta() {
  const root = document.createElement("div");
  root.className = "game-card__footer-meta";

  const tournament = document.createElement("p");
  tournament.className = "tournament";

  const network = document.createElement("p");
  network.className = "network";

  root.appendChild(tournament);
  root.appendChild(network);

  return {
    root,
    network,
    tournament,
  };
}

function createTeamRow() {
  const row = document.createElement("div");
  row.className = "team-row";

  const logo = document.createElement("div");
  logo.className = "team-logo";

  const logoImage = document.createElement("img");
  logoImage.className = "team-logo__image";
  logoImage.alt = "";
  logoImage.decoding = "async";
  logoImage.loading = "eager";

  const logoFallback = document.createElement("span");
  logoFallback.className = "team-logo__fallback";

  logoImage.addEventListener("load", () => {
    logo.classList.add("team-logo--loaded");
    logoImage.dataset.failedSrc = "";
  });

  logoImage.addEventListener("error", () => {
    const candidates = parseLogoCandidates(logoImage.dataset.candidates);
    const currentIndex = Number(logoImage.dataset.logoIndex || "0");
    const nextIndex = currentIndex + 1;

    if (nextIndex < candidates.length) {
      const nextLogoUrl = candidates[nextIndex];
      logo.classList.remove("team-logo--loaded");
      logoImage.dataset.logoIndex = String(nextIndex);
      logoImage.dataset.requestedSrc = nextLogoUrl;
      logoImage.src = nextLogoUrl;
      return;
    }

    logo.classList.remove("team-logo--loaded");
    logoImage.dataset.failedSrc = logoImage.dataset.requestedSrc || "";
  });

  logo.appendChild(logoImage);
  logo.appendChild(logoFallback);

  const details = document.createElement("div");
  details.className = "team-details";

  const name = document.createElement("p");
  name.className = "team-name";

  const info = document.createElement("p");
  info.className = "team-info";

  details.appendChild(name);
  details.appendChild(info);

  const score = document.createElement("p");
  score.className = "team-score";

  row.appendChild(logo);
  row.appendChild(details);
  row.appendChild(score);

  return {
    row,
    logo,
    logoImage,
    logoFallback,
    name,
    info,
    score,
  };
}

function updateTeamRow(teamRowRefs, team, gameStatus) {
  updateTeamLogo(teamRowRefs, team);
  teamRowRefs.logoFallback.textContent = getTeamInitials(team.name);
  teamRowRefs.name.textContent = hasRank(team) ? `#${team.rank} ${team.name}` : team.name;
  const teamInfo = buildTeamInfoLine(team);
  teamRowRefs.info.textContent = teamInfo;

  if (teamInfo) {
    teamRowRefs.info.classList.remove("team-info--hidden");
  } else {
    teamRowRefs.info.classList.add("team-info--hidden");
  }

  // Hide pregame scores for UPCOMING games so cards show matchup + tipoff cleanly.
  if (gameStatus === "UPCOMING") {
    teamRowRefs.score.classList.add("team-score--hidden");
    teamRowRefs.score.textContent = formatScore(team.score);
    return;
  }

  teamRowRefs.score.classList.remove("team-score--hidden");
  teamRowRefs.score.textContent = formatScore(team.score);
}

function updateTeamLogo(teamRowRefs, team) {
  const logoImage = teamRowRefs.logoImage;
  const logoContainer = teamRowRefs.logo;
  const logoCandidates = getTeamLogoCandidates(team);
  const logoKey = logoCandidates.join("|");

  if (logoImage.dataset.logoKey !== logoKey) {
    logoContainer.classList.remove("team-logo--loaded");
    logoImage.dataset.logoKey = logoKey;
    logoImage.dataset.candidates = JSON.stringify(logoCandidates);
    logoImage.dataset.logoIndex = "0";
    logoImage.dataset.requestedSrc = "";
    logoImage.dataset.failedSrc = "";
  }

  const currentIndex = Number(logoImage.dataset.logoIndex || "0");
  const safeIndex =
    Number.isInteger(currentIndex) && currentIndex >= 0 ? currentIndex : 0;
  const desiredLogoUrl = logoCandidates[safeIndex] ?? null;

  if (!desiredLogoUrl) {
    logoContainer.classList.remove("team-logo--loaded");
    logoImage.dataset.requestedSrc = "";
    logoImage.removeAttribute("src");
    return;
  }

  if (logoImage.dataset.failedSrc === desiredLogoUrl) {
    logoContainer.classList.remove("team-logo--loaded");
    return;
  }

  if (logoImage.dataset.requestedSrc !== desiredLogoUrl) {
    logoContainer.classList.remove("team-logo--loaded");
    logoImage.dataset.requestedSrc = desiredLogoUrl;
    logoImage.alt = `${team.name} logo`;
    logoImage.src = desiredLogoUrl;
  }
}

function getTeamLogoCandidates(team) {
  const candidates = [];

  const pushCandidate = (value) => {
    const text = safeText(value, null);
    if (!text) {
      return;
    }

    if (!candidates.includes(text)) {
      candidates.push(text);
    }
  };

  if (Array.isArray(team?.logoUrls)) {
    team.logoUrls.forEach(pushCandidate);
  }

  pushCandidate(team?.logoUrl);
  return candidates;
}

function parseLogoCandidates(rawValue) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function getExistingCardMap(gamesGrid) {
  const map = new Map();
  const cards = gamesGrid.querySelectorAll(".game-card[data-game-id]");

  cards.forEach((card) => {
    const gameId = card.dataset.gameId;
    if (gameId) {
      map.set(gameId, card);
    }
  });

  return map;
}

function applyCardOrder(gamesGrid, orderedCards) {
  const desiredSet = new Set(orderedCards);

  // Remove nodes that are not part of the desired game cards (e.g., empty state).
  Array.from(gamesGrid.children).forEach((child) => {
    if (!desiredSet.has(child)) {
      child.remove();
    }
  });

  let currentNode = gamesGrid.firstElementChild;

  orderedCards.forEach((card) => {
    if (card === currentNode) {
      currentNode = currentNode.nextElementSibling;
      return;
    }

    gamesGrid.insertBefore(card, currentNode);
  });
}

function buildTeamInfoLine(team) {
  return safeText(team.record, "");
}

function buildTournamentText(game) {
  const parts = [];

  if (game.tournamentRound) {
    parts.push(game.tournamentRound);
  }

  if (game.region) {
    parts.push(game.region);
  }

  return parts.length > 0 ? parts.join(" - ") : "Tournament details pending";
}

function getTopTimeLabel(game) {
  if (game.status === "LIVE") {
    const clock = safeText(game.clock, "LIVE");
    const period = safeText(game.statusDetail, "IN PROGRESS").toUpperCase();
    return `${clock} - ${period}`;
  }

  if (game.status === "UPCOMING") {
    const startTime =
      formatEpochTimeWithZone(
        game.startTimeEpoch,
        CONFIG.DISPLAY.TIME_ZONE,
        CONFIG.DISPLAY.TIME_LABEL
      ) || safeText(game.startTime, "START TIME TBD");
    return `${startTime} - TIPOFF`;
  }

  const finalText = safeText(game.statusDetail, "FINAL").toUpperCase();
  return `${finalText} - COMPLETE`;
}

function mapTickerGame(game) {
  const away = safeText(game.awayTeam?.shortName, game.awayTeam?.name ?? "Away");
  const home = safeText(game.homeTeam?.shortName, game.homeTeam?.name ?? "Home");
  const network = safeText(game.network, null);
  const tournament = getTickerTournamentText(game);
  const statusKey = safeText(game.status, "UNKNOWN").toLowerCase();
  const statusLabel = safeText(game.status, "UNKNOWN");

  if (game.status === "LIVE") {
    const clock = safeText(game.clock, "LIVE");
    const period = safeText(game.statusDetail, "In Progress");
    const awayScore = formatScore(game.awayTeam?.score);
    const homeScore = formatScore(game.homeTeam?.score);
    return {
      statusKey,
      statusLabel,
      matchup: `${away} ${awayScore} - ${homeScore} ${home}`,
      detail: `${clock} ${period}`.trim(),
      network,
      tournament,
    };
  }

  if (game.status === "UPCOMING") {
    const start =
      formatEpochTimeWithZone(
        game.startTimeEpoch,
        CONFIG.DISPLAY.TIME_ZONE,
        CONFIG.DISPLAY.TIME_LABEL
      ) || safeText(game.startTime, "Start time TBD");
    return {
      statusKey,
      statusLabel,
      matchup: `${away} vs ${home}`,
      detail: `${start} Tipoff`.trim(),
      network,
      tournament,
    };
  }

  const awayScore = formatScore(game.awayTeam?.score);
  const homeScore = formatScore(game.homeTeam?.score);
  const finalDetail = safeText(game.statusDetail, "Final");

  return {
    statusKey,
    statusLabel,
    matchup: `${away} ${awayScore} - ${homeScore} ${home}`,
    detail: finalDetail,
    network,
    tournament,
  };
}

function getTickerTournamentText(game) {
  const hasRound = Boolean(game.tournamentRound);
  const hasRegion = Boolean(game.region);

  if (!hasRound && !hasRegion) {
    return null;
  }

  return buildTournamentText(game);
}

function createTickerSegment(text, baseClass, extraClasses = []) {
  const segment = document.createElement("span");
  segment.className = [baseClass, ...extraClasses].join(" ");
  segment.textContent = safeText(text, "");
  return segment;
}

function createTickerSeparator() {
  const separator = document.createElement("span");
  separator.className = "ticker-separator";
  separator.textContent = "|";
  return separator;
}
