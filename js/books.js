// US bookmakers available through The Odds API (regions us, us2, us_ex).
// Source: https://the-odds-api.com/sports-odds-data/bookmaker-apis.html (checked Nov 2026).
// `paid: true` books only return data on a paid API plan.
// `default: true` books are pre-selected. The default set is 9 books, which keeps
// each request at 1 credit per market (the API charges 1 credit per 10 books per market).

export const BOOK_GROUPS = [
  { id: 'us', label: 'US sportsbooks' },
  { id: 'exchange', label: 'Exchanges & prediction markets', note: 'Exchange commissions/fees are not included in the profit shown.' },
  { id: 'offshore', label: 'Offshore books', note: 'Not licensed by US state regulators.' },
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
  { key: 'fliff', title: 'Fliff', group: 'us', default: true },
  { key: 'williamhill_us', title: 'Caesars', group: 'us', paid: true },
  { key: 'fanatics', title: 'Fanatics', group: 'us', paid: true },
  { key: 'rebet', title: 'ReBet', group: 'us', paid: true },
  { key: 'courtside', title: 'Courtside', group: 'us', paid: true },

  { key: 'novig', title: 'Novig', group: 'exchange' },
  { key: 'prophetx', title: 'ProphetX', group: 'exchange' },
  { key: 'kalshi', title: 'Kalshi', group: 'exchange' },
  { key: 'polymarket_us', title: 'Polymarket (US)', group: 'exchange' },
  { key: 'betopenly', title: 'BetOpenly', group: 'exchange' },
  { key: 'polymarket', title: 'Polymarket (intl)', group: 'exchange' },
  { key: 'limitless', title: 'Limitless Exchange', group: 'exchange' },

  { key: 'betonlineag', title: 'BetOnline.ag', group: 'offshore' },
  { key: 'bovada', title: 'Bovada', group: 'offshore' },
  { key: 'lowvig', title: 'LowVig.ag', group: 'offshore' },
  { key: 'mybookieag', title: 'MyBookie.ag', group: 'offshore' },
  { key: 'betus', title: 'BetUS', group: 'offshore' },
  { key: 'betwhale', title: 'Betwhale', group: 'offshore' },
  { key: 'betanysports', title: 'BetAnything', group: 'offshore' },

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
