// Player prop markets from The Odds API (over/under markets only: yes/no props like
// "anytime TD" are usually only offered on the Yes side at US books, so they can't be arbed).
// Source: https://the-odds-api.com/sports-odds-data/betting-markets.html (checked Nov 2026).
// `d: true` = selected by default (kept small because every market costs credits per game).

const FOOTBALL = [
  ['player_pass_yds', 'Pass yds', true],
  ['player_rush_yds', 'Rush yds', true],
  ['player_reception_yds', 'Receiving yds', true],
  ['player_receptions', 'Receptions', true],
  ['player_pass_tds', 'Pass TDs'],
  ['player_pass_completions', 'Completions'],
  ['player_pass_attempts', 'Pass attempts'],
  ['player_pass_interceptions', 'Interceptions'],
  ['player_rush_attempts', 'Rush attempts'],
  ['player_rush_reception_yds', 'Rush + rec yds'],
  ['player_pass_rush_yds', 'Pass + rush yds'],
  ['player_reception_longest', 'Longest reception'],
  ['player_rush_longest', 'Longest rush'],
  ['player_pass_longest_completion', 'Longest completion'],
  ['player_tds', 'Touchdowns'],
  ['player_sacks', 'Sacks'],
  ['player_solo_tackles', 'Solo tackles'],
  ['player_tackles_assists', 'Tackles + assists'],
  ['player_field_goals', 'Field goals'],
  ['player_kicking_points', 'Kicking points'],
  ['player_pats', 'PATs'],
];

const BASKETBALL = [
  ['player_points', 'Points', true],
  ['player_rebounds', 'Rebounds', true],
  ['player_assists', 'Assists', true],
  ['player_threes', '3-pointers', true],
  ['player_points_rebounds_assists', 'Pts + reb + ast'],
  ['player_points_rebounds', 'Pts + reb'],
  ['player_points_assists', 'Pts + ast'],
  ['player_rebounds_assists', 'Reb + ast'],
  ['player_blocks', 'Blocks'],
  ['player_steals', 'Steals'],
  ['player_blocks_steals', 'Blocks + steals'],
  ['player_turnovers', 'Turnovers'],
  ['player_field_goals', 'Field goals made'],
  ['player_frees_made', 'Free throws made'],
  ['player_points_q1', '1st-quarter points'],
];

const HOCKEY = [
  ['player_shots_on_goal', 'Shots on goal', true],
  ['player_points', 'Points', true],
  ['player_total_saves', 'Goalie saves', true],
  ['player_assists', 'Assists'],
  ['player_goals', 'Goals'],
  ['player_blocked_shots', 'Blocked shots'],
  ['player_power_play_points', 'Power-play points'],
];

const BASEBALL = [
  ['pitcher_strikeouts', 'Pitcher strikeouts', true],
  ['batter_hits', 'Hits', true],
  ['batter_total_bases', 'Total bases', true],
  ['pitcher_outs', 'Pitcher outs'],
  ['pitcher_hits_allowed', 'Hits allowed'],
  ['pitcher_earned_runs', 'Earned runs'],
  ['pitcher_walks', 'Walks allowed'],
  ['batter_hits_runs_rbis', 'Hits + runs + RBIs'],
  ['batter_rbis', 'RBIs'],
  ['batter_runs_scored', 'Runs scored'],
  ['batter_home_runs', 'Home runs'],
  ['batter_strikeouts', 'Batter strikeouts'],
  ['batter_walks', 'Batter walks'],
  ['batter_singles', 'Singles'],
  ['batter_doubles', 'Doubles'],
  ['batter_stolen_bases', 'Stolen bases'],
];

const toList = (rows) => rows.map(([key, label, d]) => ({ key, label, default: !!d }));

export const PROP_SPORTS = [
  { key: 'americanfootball_nfl', title: 'NFL', markets: toList(FOOTBALL) },
  { key: 'americanfootball_ncaaf', title: 'NCAAF', markets: toList(FOOTBALL) },
  { key: 'basketball_nba', title: 'NBA', markets: toList(BASKETBALL) },
  { key: 'basketball_ncaab', title: 'NCAAB', markets: toList(BASKETBALL) },
  { key: 'basketball_wnba', title: 'WNBA', markets: toList(BASKETBALL) },
  { key: 'icehockey_nhl', title: 'NHL', markets: toList(HOCKEY) },
  { key: 'baseball_mlb', title: 'MLB', markets: toList(BASEBALL) },
];

export const PROP_SPORT_BY_KEY = Object.fromEntries(PROP_SPORTS.map((s) => [s.key, s]));

/** True for any player/batter/pitcher market key. */
export const isPropMarket = (key) => /^(player|batter|pitcher)_/.test(key);

/** Human label for a prop market. Same key can mean different things per sport (e.g. player_field_goals). */
export function propLabel(key, sportKey) {
  const m = PROP_SPORT_BY_KEY[sportKey]?.markets.find((x) => x.key === key);
  return m ? m.label : key.replace(/^(player|batter|pitcher)_/, '').replace(/_/g, ' ');
}
