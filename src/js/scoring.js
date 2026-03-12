// src/js/scoring.js
// ------------------------------------------------------------
// Calculates each game's importance score using configurable weights.
// This avoids hardcoded sorting rules and keeps behavior easy to tune.
// ------------------------------------------------------------

import { CONFIG } from "./config.js";
import { getScoreMargin, hasRank, normalizeKey, toNumber } from "./utils.js";

/**
 * Add importance score metadata to each game.
 */
export function scoreGames(games) {
  return games.map((game) => {
    const result = calculateImportanceScore(game);

    return {
      ...game,
      importanceScore: result.total,
      importanceFlags: result.flags,
      importanceBreakdown: result.components,
    };
  });
}

/**
 * Sort games from highest to lowest importance score.
 */
export function sortGamesByImportance(scoredGames) {
  return [...scoredGames].sort((a, b) => {
    if (b.importanceScore !== a.importanceScore) {
      return b.importanceScore - a.importanceScore;
    }

    const aStart = toNumber(a.startTimeEpoch, Number.MAX_SAFE_INTEGER);
    const bStart = toNumber(b.startTimeEpoch, Number.MAX_SAFE_INTEGER);

    if (aStart !== bStart) {
      return aStart - bStart;
    }

    const aMatchup = `${a.awayTeam.name} ${a.homeTeam.name}`;
    const bMatchup = `${b.awayTeam.name} ${b.homeTeam.name}`;
    return aMatchup.localeCompare(bMatchup);
  });
}

/**
 * Compute one final score by combining base weights and bonus rules.
 */
export function calculateImportanceScore(game) {
  let total = 0;
  const components = [];

  const flags = {
    isRankedGame: false,
    bothTeamsRanked: false,
    isCloseGame: false,
    isCloseLateGame: false,
    hasPreferredTeam: false,
    hasPreferredConference: false,
    isPreferredGame: false,
  };

  const statusWeight = getStatusWeight(game.status);
  addComponent("status", statusWeight);

  const teamWeight = getTeamPreferenceWeight(game);
  addComponent("preferredTeam", teamWeight);
  flags.hasPreferredTeam = teamWeight > 0;

  const conferenceWeight = getConferencePreferenceWeight(game);
  addComponent("preferredConference", conferenceWeight);
  flags.hasPreferredConference = conferenceWeight > 0;

  const rankStrengthWeight = getRankStrengthBonus(game);
  addComponent("rankStrength", rankStrengthWeight);

  const liveProgressWeight = getLiveProgressWeight(game);
  addComponent("liveProgress", liveProgressWeight);

  const recentFinalHoldWeight = getRecentFinalHoldBonus(game);
  addComponent("recentFinalHold", recentFinalHoldWeight);

  const bonusRules = [
    {
      key: "rankedGame",
      isActive: () => isRankedGame(game),
      value: () => CONFIG.BONUS_WEIGHTS.rankedGame,
      flag: "isRankedGame",
    },
    {
      key: "bothTeamsRanked",
      isActive: () => bothTeamsRanked(game),
      value: () => CONFIG.BONUS_WEIGHTS.bothTeamsRanked,
      flag: "bothTeamsRanked",
    },
    {
      key: "closeGame",
      isActive: () => isCloseGame(game),
      value: () => CONFIG.BONUS_WEIGHTS.closeGame,
      flag: "isCloseGame",
    },
    {
      key: "closeLateGame",
      isActive: () => isCloseLateGame(game),
      value: () => CONFIG.BONUS_WEIGHTS.closeLateGame,
      flag: "isCloseLateGame",
    },
    {
      key: "upcomingRankedNearTipoff",
      isActive: () => isUpcomingRankedNearTipoffGame(game),
      value: () => CONFIG.BONUS_WEIGHTS.upcomingRankedNearTipoff,
    },
  ];

  bonusRules.forEach((rule) => {
    if (rule.isActive()) {
      const value = rule.value();
      addComponent(rule.key, value);
      flags[rule.flag] = true;
    }
  });

  const penaltyRules = [
    {
      key: "finalGamePenalty",
      isActive: () => game.status === "FINAL" && !isInFinalHoldWindow(game),
      value: () => CONFIG.PENALTY_WEIGHTS.finalGame,
    },
    {
      key: "liveBlowoutPenalty",
      isActive: () => isLiveBlowout(game),
      value: () => CONFIG.PENALTY_WEIGHTS.liveBlowout,
    },
    {
      key: "liveLowInterestPenalty",
      isActive: () => isLowInterestLiveGame(game),
      value: () => CONFIG.PENALTY_WEIGHTS.liveLowInterest,
    },
    {
      key: "upcomingTooEarlyPenalty",
      isActive: () => isUpcomingTooEarly(game),
      value: () => CONFIG.PENALTY_WEIGHTS.upcomingTooEarly,
    },
  ];

  penaltyRules.forEach((rule) => {
    if (rule.isActive()) {
      addComponent(rule.key, -Math.abs(rule.value()));
    }
  });

  flags.isPreferredGame = flags.hasPreferredTeam || flags.hasPreferredConference;

  return { total, components, flags };

  function addComponent(label, value) {
    if (!Number.isFinite(value) || value === 0) {
      return;
    }

    total += value;
    components.push({ label, value });
  }
}

function getStatusWeight(status) {
  return CONFIG.STATUS_WEIGHTS[status] ?? CONFIG.STATUS_WEIGHTS.UNKNOWN;
}

/**
 * Keep final games visible for a short time after they end.
 * Bonus fades linearly from maxBonus to 0 over holdMinutes.
 */
function getRecentFinalHoldBonus(game) {
  const finalHoldConfig = CONFIG.FINAL_HOLD;

  if (!finalHoldConfig?.enabled || game.status !== "FINAL") {
    return 0;
  }

  const remainingFraction = getFinalHoldRemainingFraction(game, finalHoldConfig);
  if (remainingFraction <= 0) {
    return 0;
  }

  const maxBonus = toNumber(finalHoldConfig.maxBonus, 0);
  if (!Number.isFinite(maxBonus) || maxBonus <= 0) {
    return 0;
  }

  return Math.round(maxBonus * remainingFraction);
}

function isInFinalHoldWindow(game) {
  const finalHoldConfig = CONFIG.FINAL_HOLD;

  if (!finalHoldConfig?.enabled || game.status !== "FINAL") {
    return false;
  }

  return getFinalHoldRemainingFraction(game, finalHoldConfig) > 0;
}

function getFinalHoldRemainingFraction(game, finalHoldConfig) {
  const holdMinutes = toNumber(finalHoldConfig.holdMinutes, 0);
  if (!Number.isFinite(holdMinutes) || holdMinutes <= 0) {
    return 0;
  }

  const finalSeenEpoch = toNumber(game.finalSeenEpoch, null);
  if (!Number.isFinite(finalSeenEpoch)) {
    return 0;
  }

  const holdSeconds = holdMinutes * 60;
  const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000) - finalSeenEpoch);

  if (elapsedSeconds >= holdSeconds) {
    return 0;
  }

  return 1 - elapsedSeconds / holdSeconds;
}

function getTeamPreferenceWeight(game) {
  const awayWeight = getSingleTeamWeight(game.awayTeam);
  const homeWeight = getSingleTeamWeight(game.homeTeam);
  return awayWeight + homeWeight;
}

function getSingleTeamWeight(team) {
  const teamWeights = CONFIG.TEAM_WEIGHTS;
  const keysToCheck = [normalizeKey(team?.name), normalizeKey(team?.shortName)];

  for (const key of keysToCheck) {
    if (key && Number.isFinite(teamWeights[key])) {
      return teamWeights[key];
    }
  }

  return 0;
}

function getConferencePreferenceWeight(game) {
  const awayWeight = getSingleConferenceWeight(game.awayTeam?.conference);
  const homeWeight = getSingleConferenceWeight(game.homeTeam?.conference);

  // Use only the stronger conference match for this game.
  // Example: Big Ten (260) vs SEC (140) => 260, not 400.
  return Math.max(awayWeight, homeWeight);
}

function getSingleConferenceWeight(conference) {
  if (!conference) {
    return 0;
  }

  const weightMap = CONFIG.CONFERENCE_WEIGHTS;
  const key = normalizeConferenceKey(conference);
  return Number.isFinite(weightMap[key]) ? weightMap[key] : 0;
}

function normalizeConferenceKey(conference) {
  const compactKey = normalizeKey(conference).replace(/\s+/g, "-");

  const aliases = {
    bigten: "big-ten",
    "big-ten": "big-ten",
    "big-10": "big-ten",
    b1g: "big-ten",
    "big-12": "big-12",
    big12: "big-12",
    "big-east": "big-east",
    bigeast: "big-east",
  };

  return aliases[compactKey] ?? compactKey;
}

function isRankedGame(game) {
  return hasRank(game.awayTeam) || hasRank(game.homeTeam);
}

function bothTeamsRanked(game) {
  return hasRank(game.awayTeam) && hasRank(game.homeTeam);
}

function isCloseGame(game) {
  if (game.status !== "LIVE") {
    return false;
  }

  const margin = getScoreMargin(game);
  if (!Number.isFinite(margin)) {
    return false;
  }

  return margin <= CONFIG.CLOSE_GAME_RULES.closeMargin;
}

function isCloseLateGame(game) {
  if (game.status !== "LIVE") {
    return false;
  }

  const margin = getScoreMargin(game);
  if (!Number.isFinite(margin)) {
    return false;
  }

  const isClose = margin <= CONFIG.CLOSE_GAME_RULES.closeMargin;
  const inLateGameState = isLatePeriod(game.statusDetail);

  return isClose && inLateGameState;
}

function isUpcomingRankedNearTipoffGame(game) {
  if (game.status !== "UPCOMING") {
    return false;
  }

  return isRankedGame(game) && isNearTipoff(game);
}

function isUpcomingTooEarly(game) {
  if (game.status !== "UPCOMING") {
    return false;
  }

  return !isNearTipoff(game);
}

function isNearTipoff(game) {
  const startEpoch = toNumber(game.startTimeEpoch, null);

  if (!Number.isFinite(startEpoch)) {
    return false;
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const secondsUntilTipoff = startEpoch - nowEpoch;
  const windowSeconds = CONFIG.UPCOMING_RULES.nearTipoffMinutes * 60;

  return secondsUntilTipoff >= 0 && secondsUntilTipoff <= windowSeconds;
}

function isLiveBlowout(game) {
  if (game.status !== "LIVE") {
    return false;
  }

  const margin = getScoreMargin(game);
  if (!Number.isFinite(margin)) {
    return false;
  }

  return margin >= CONFIG.BLOWOUT_RULES.blowoutMargin;
}

function isLowInterestLiveGame(game) {
  if (game.status !== "LIVE") {
    return false;
  }

  const ranked = isRankedGame(game);
  const close = isCloseGame(game);
  const preferredTeam = hasPreferredTeamGame(game);
  const preferredConference = hasPreferredConferenceGame(game);

  return !ranked && !close && !preferredTeam && !preferredConference;
}

function isLatePeriod(statusDetail) {
  if (!statusDetail) {
    return false;
  }

  const detail = String(statusDetail).toLowerCase();

  return CONFIG.CLOSE_GAME_RULES.latePeriodKeywords.some((keyword) =>
    detail.includes(keyword.toLowerCase())
  );
}

/**
 * Small "game is further along" boost for LIVE games.
 * This acts like a tie-break bonus when other factors are similar.
 */
function getLiveProgressWeight(game) {
  const progressConfig = CONFIG.PROGRESS_BOOST;

  if (!progressConfig?.enabled || game.status !== "LIVE") {
    return 0;
  }

  const periodType = getPeriodType(game.statusDetail);
  if (periodType === "UNKNOWN") {
    return 0;
  }

  let bonus = 0;

  if (periodType === "SECOND_HALF") {
    bonus += progressConfig.secondHalfBonus;
  } else if (periodType === "OVERTIME") {
    bonus += progressConfig.overtimeBonus;
  }

  const periodSeconds = getPeriodDurationSeconds(periodType, progressConfig);
  const clockSeconds = parseClockToSeconds(game.clock);

  if (periodSeconds > 0 && Number.isFinite(clockSeconds)) {
    const elapsedFraction = clamp((periodSeconds - clockSeconds) / periodSeconds, 0, 1);
    bonus += Math.round(elapsedFraction * progressConfig.maxClockProgressBonus);
  }

  return Math.max(0, Math.round(bonus));
}

function getRankStrengthBonus(game) {
  const rankConfig = CONFIG.RANK_STRENGTH;

  if (!rankConfig?.enabled) {
    return 0;
  }

  const awayBonus = getSingleTeamRankStrength(game.awayTeam?.rank, rankConfig);
  const homeBonus = getSingleTeamRankStrength(game.homeTeam?.rank, rankConfig);
  return awayBonus + homeBonus;
}

function getSingleTeamRankStrength(rank, rankConfig) {
  if (!Number.isInteger(rank) || rank <= 0) {
    return 0;
  }

  const bestRank = rankConfig.bestRank;
  const pointsPerSpot = rankConfig.pointsPerSpot;

  if (!Number.isFinite(bestRank) || !Number.isFinite(pointsPerSpot)) {
    return 0;
  }

  if (rank > bestRank) {
    return 0;
  }

  return (bestRank + 1 - rank) * pointsPerSpot;
}

function hasPreferredTeamGame(game) {
  return getTeamPreferenceWeight(game) > 0;
}

function hasPreferredConferenceGame(game) {
  return getConferencePreferenceWeight(game) > 0;
}

function getPeriodType(statusDetail) {
  const detail = String(statusDetail ?? "").toLowerCase();

  if (detail.includes("ot") || detail.includes("overtime")) {
    return "OVERTIME";
  }

  if (detail.includes("2nd") || detail.includes("second half")) {
    return "SECOND_HALF";
  }

  if (detail.includes("1st") || detail.includes("first half")) {
    return "FIRST_HALF";
  }

  return "UNKNOWN";
}

function getPeriodDurationSeconds(periodType, progressConfig) {
  if (periodType === "FIRST_HALF") {
    return progressConfig.firstHalfMinutes * 60;
  }

  if (periodType === "SECOND_HALF") {
    return progressConfig.secondHalfMinutes * 60;
  }

  if (periodType === "OVERTIME") {
    return progressConfig.overtimeMinutes * 60;
  }

  return 0;
}

function parseClockToSeconds(clockText) {
  const clock = String(clockText ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);

  if (!match) {
    return null;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return minutes * 60 + seconds;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
