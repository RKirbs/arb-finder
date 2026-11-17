// US bookmakers available through The Odds API (regions us, us2, us_ex).
// Source: https://the-odds-api.com/sports-odds-data/bookmaker-apis.html (checked Nov 2026).
// Deliberately EXCLUDED: offshore books (Bovada, BetOnline, MyBookie, BetUS, LowVig, Betwhale,
// BetAnything) because they are not licensed in any US state, and non-US prediction markets
// (Polymarket international, Limitless) because they are not offered to US users.
// `paid: true` books only return data on a paid API plan.
// `default: true` books are pre-selected. The default set is 8 books, which keeps
// each request at 1 credit per market (the API charges 1 credit per 10 books per market).

export const BOOK_GROUPS = [
  { id: 'us', label: 'State-licensed sportsbooks', note: 'Each book is only legal in states where it holds a license. Only bet where you are physically located and the book is licensed.' },
  { id: 'exchange', label: 'Exchanges & prediction markets', note: 'Fees are not included in the profit shown. Some states dispute sports event contracts, so check each one is available where you are.' },
  { id: 'sweeps', label: 'Sweepstakes / social sportsbooks', note: 'Legal in some states and banned in others. Check your state before using.' },
  { id: 'variant', label: 'State-specific lines', note: 'Only populated when they differ from the main Hard Rock Bet line.' },
];

export const BOOKS = [
  { key: 'draftkings', title: 'DraftKings', group: 'us', default: true },
  { key: 'fanduel', title: 'FanDuel', group: 'us', default: true },
  { key: 'betmgm', title: 'BetMGM', group: 'us', default: true },
  { key: 'espnbet', title: 'theScore Bet', group: 'us', default: true },
  { key: 'betrivers', title: 'BetRivers', group: 'us', default: true },
  { key: 'hardrockbet', title: 'Hard Rock Bet', group: 'us', default: true },
  { key: 'ballybet', title: 'Bally Bet', group: 'us', default: true },
  { key: 'betparx', title: 'betPARX', group: 'us', default: true },
  { key: 'williamhill_us', title: 'Caesars', group: 'us', paid: true },
  { key: 'fanatics', title: 'Fanatics', group: 'us', paid: true },

  { key: 'novig', title: 'Novig', group: 'exchange' },
  { key: 'prophetx', title: 'ProphetX', group: 'exchange' },
  { key: 'kalshi', title: 'Kalshi', group: 'exchange' },
  { key: 'polymarket_us', title: 'Polymarket (US)', group: 'exchange' },
  { key: 'betopenly', title: 'BetOpenly', group: 'exchange' },

  { key: 'fliff', title: 'Fliff', group: 'sweeps' },
  { key: 'rebet', title: 'ReBet', group: 'sweeps', paid: true },
  { key: 'courtside', title: 'Courtside', group: 'sweeps', paid: true },

  { key: 'hardrockbet_az', title: 'Hard Rock Bet (AZ)', group: 'variant' },
  { key: 'hardrockbet_fl', title: 'Hard Rock Bet (FL)', group: 'variant' },
  { key: 'hardrockbet_oh', title: 'Hard Rock Bet (OH)', group: 'variant' },
];

export const BOOK_BY_KEY = Object.fromEntries(BOOKS.map((b) => [b.key, b]));

// Sports pre-selected the first time someone loads the page (only those currently in season are fetched).
export const DEFAULT_SPORTS = [
  'americanfootball_nfl',
  'americanfootball_ncaaf',
  'basketball_nba',
  'basketball_ncaab',
  'icehockey_nhl',
  'baseball_mlb',
];
