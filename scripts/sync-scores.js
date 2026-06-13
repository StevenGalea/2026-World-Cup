#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const SCORES_FILE = path.join(__dirname, '../scores.json');

// Map of actual match results to your scoring system
// Group Stage: Win=3, Draw=1, Loss=0
// Knockout: Win=points based on round, Loss=0
const SCORING = {
  'GS1': { win: 3, draw: 1, loss: 0 }, // Group Stage Match 1
  'GS2': { win: 3, draw: 1, loss: 0 }, // Group Stage Match 2
  'GS3': { win: 3, draw: 1, loss: 0 }, // Group Stage Match 3
  'Rd32': { win: 3, loss: 0 },         // Round of 32
  'Rd16': { win: 3, loss: 0 },         // Round of 16
  'QF': { win: 3, loss: 0 },           // Quarter Final
  'SF': { win: 3, loss: 0 },           // Semi Final
  '3rd': { win: 2, loss: 0 },          // 3rd Place Match
  'Final': { win: 8, loss: 0 },        // World Cup Final
};

// Map FIFA tournament stage names to your round keys
const STAGE_MAP = {
  'GROUP_STAGE': { regex: /^(GS1|GS2|GS3)$/, matchNumber: null }, // Will determine based on match order
  'LAST_32': 'Rd32',
  'LAST_16': 'Rd16',
  'QUARTER_FINALS': 'QF',
  'SEMI_FINALS': 'SF',
  'PLAYOFF_FOR_THIRD': '3rd',
  'FINAL': 'Final',
};

async function fetchLiveMatches() {
  try {
    if (!API_KEY) {
      console.warn('⚠️  FOOTBALL_DATA_API_KEY not set. Skipping live score sync.');
      console.warn('   Set it in GitHub Secrets: Settings → Secrets and variables → Actions');
      return null;
    }

    console.log('🌐 Fetching live World Cup 2026 matches...');
    
    const response = await axios.get(
      'https://api.football-data.org/v4/competitions/467/matches',
      {
        headers: { 'X-Auth-Token': API_KEY },
        timeout: 10000,
      }
    );

    return response.data.matches || [];
  } catch (error) {
    console.error('❌ Error fetching matches:', error.message);
    return null;
  }
}

function getTeamNameFromAPI(apiTeamName) {
  // Map API team names to your team names
  const nameMap = {
    'Spain': 'Spain',
    'France': 'France',
    'England': 'England',
    'Portugal': 'Portugal',
    'Argentina': 'Argentina',
    'Brazil': 'Brazil',
    'Germany': 'Germany',
    'Netherlands': 'Netherlands',
    'Norway': 'Norway',
    'Belgium': 'Belgium',
    'Colombia': 'Colombia',
    'Japan': 'Japan',
    'Morocco': 'Morocco',
    'Mexico': 'Mexico',
    'USA': 'USA',
    'United States': 'USA',
    'Uruguay': 'Uruguay',
    'Switzerland': 'Switzerland',
    'Turkey': 'Turkiye',
    'Turkiye': 'Turkiye',
    'Ecuador': 'Ecuador',
    'Croatia': 'Croatia',
    'Senegal': 'Senegal',
    'Sweden': 'Sweden',
    'Austria': 'Austria',
    'Côte d\'Ivoire': 'Cote d Ivoire',
    'Ivory Coast': 'Cote d Ivoire',
    'Paraguay': 'Paraguay',
    'Canada': 'Canada',
    'Scotland': 'Scotland',
    'Bosnia and Herzegovina': 'Bosnia',
    'Bosnia': 'Bosnia',
    'Czech Republic': 'Czechia',
    'Czechia': 'Czechia',
    'Egypt': 'Egypt',
    'South Korea': 'Korea',
    'Korea Republic': 'Korea',
    'Australia': 'Australia',
    'Algeria': 'Algeria',
    'Ghana': 'Ghana',
    'Iran': 'Iran',
    'Tunisia': 'Tunisia',
    'DR Congo': 'Congo DR',
    'Congo': 'Congo DR',
    'Iraq': 'Iraq',
    'New Zealand': 'New Zealand',
    'Panama': 'Panama',
    'Qatar': 'Qatar',
    'Saudi Arabia': 'Saudi Arabia',
    'South Africa': 'South Africa',
    'Uzbekistan': 'Uzbekistan',
    'Cabo Verde': 'Cabo Verde',
    'Cape Verde': 'Cabo Verde',
    'Jordan': 'Jordan',
    'Curaçao': 'Curacao',
    'Curacao': 'Curacao',
    'Haiti': 'Haiti',
  };

  return nameMap[apiTeamName] || apiTeamName;
}

function determineRound(match) {
  // Map FIFA stage to your round key
  const stage = match.stage;
  
  if (stage === 'GROUP_STAGE') {
    // For group stage, determine which match (GS1, GS2, or GS3) based on utcDate
    // Simple heuristic: earliest matches = GS1, etc.
    // In reality, you'd want to track match numbers per group
    // For now, we'll use a simple approach based on days elapsed
    const matchDate = new Date(match.utcDate);
    const tournamentStart = new Date('2026-06-12'); // Tournament starts June 12
    const daysElapsed = Math.floor((matchDate - tournamentStart) / (24 * 60 * 60 * 1000));
    
    if (daysElapsed < 3) return 'GS1';
    if (daysElapsed < 9) return 'GS2';
    return 'GS3';
  }

  return STAGE_MAP[stage] || null;
}

function updateScoresFromMatch(scores, match) {
  const homeTeam = getTeamNameFromAPI(match.homeTeam.name);
  const awayTeam = getTeamNameFromAPI(match.awayTeam.name);
  const round = determineRound(match);

  if (!round) {
    console.log(`⚠️  Unknown stage: ${match.stage}`);
    return;
  }

  // Only update if match is finished
  if (match.status !== 'FINISHED') {
    if (match.status === 'IN_PLAY' || match.status === 'PAUSED') {
      console.log(`🔴 LIVE: ${homeTeam} vs ${awayTeam} (${round})`);
    }
    return;
  }

  const homeGoals = match.score.fullTime.home;
  const awayGoals = match.score.fullTime.away;

  // Ensure team entries exist
  if (!scores[homeTeam]) scores[homeTeam] = {};
  if (!scores[awayTeam]) scores[awayTeam] = {};

  // Skip if already recorded (don't overwrite manually entered data)
  if (scores[homeTeam][round] !== undefined && scores[homeTeam][round] !== 0) {
    return;
  }
  if (scores[awayTeam][round] !== undefined && scores[awayTeam][round] !== 0) {
    return;
  }

  // Calculate points
  if (homeGoals > awayGoals) {
    scores[homeTeam][round] = SCORING[round].win;
    scores[awayTeam][round] = SCORING[round].loss;
    console.log(`✅ ${homeTeam} ${homeGoals}-${awayGoals} ${awayTeam} (${round})`);
  } else if (awayGoals > homeGoals) {
    scores[homeTeam][round] = SCORING[round].loss;
    scores[awayTeam][round] = SCORING[round].win;
    console.log(`✅ ${homeTeam} ${homeGoals}-${awayGoals} ${awayTeam} (${round})`);
  } else {
    scores[homeTeam][round] = SCORING[round].draw;
    scores[awayTeam][round] = SCORING[round].draw;
    console.log(`✅ ${homeTeam} ${homeGoals}-${awayGoals} ${awayTeam} (${round}) - Draw`);
  }
}

async function main() {
  console.log('🚀 World Cup Score Sync Started\n');

  // Read current scores
  let scoresData;
  try {
    const content = fs.readFileSync(SCORES_FILE, 'utf8');
    scoresData = JSON.parse(content);
  } catch (error) {
    console.error('❌ Error reading scores.json:', error.message);
    process.exit(1);
  }

  // Fetch live matches
  const matches = await fetchLiveMatches();
  if (!matches) {
    console.log('⏭️  No data available. Using existing scores.');
    process.exit(0);
  }

  console.log(`📊 Processing ${matches.length} matches...\n`);

  // Update scores from each match
  matches.forEach((match) => {
    updateScoresFromMatch(scoresData.scores, match);
  });

  // Write updated scores
  fs.writeFileSync(SCORES_FILE, JSON.stringify(scoresData, null, 2) + '\n');
  console.log('\n✅ Scores updated successfully!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
