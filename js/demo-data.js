// Made-up sample odds in the same shape The Odds API returns, so visitors can see
// how the tool works before getting a key. Times are relative to when the page loads.

function helpers(now) {
  const h = (hours) => new Date(now + hours * 3_600_000).toISOString();
  const ago = (min) => new Date(now - min * 60_000).toISOString();
  const book = (key, title, markets, updatedMinAgo = 2) => ({
    key,
    title,
    last_update: ago(updatedMinAgo),
    markets: markets.map(([mkey, outcomes]) => ({
      key: mkey,
      last_update: ago(updatedMinAgo),
      outcomes: outcomes.map(([name, price, point, description]) => ({
        name,
        price,
        ...(point === undefined ? {} : { point }),
        ...(description === undefined ? {} : { description }),
      })),
    })),
  });
  return { h, ago, book };
}

export function demoEvents(now = Date.now()) {
  const { h, book } = helpers(now);
  return [
    {
      id: 'demo-nba-1',
      sport_key: 'basketball_nba',
      sport_title: 'NBA',
      commence_time: h(3),
      home_team: 'New York Knicks',
      away_team: 'Boston Celtics',
      bookmakers: [
        book('draftkings', 'DraftKings', [
          ['h2h', [['New York Knicks', 1.91], ['Boston Celtics', 1.95]]],
          ['spreads', [['New York Knicks', 1.91, -1.5], ['Boston Celtics', 1.91, 1.5]]],
          ['totals', [['Over', 1.91, 224.5], ['Under', 1.91, 224.5]]],
        ]),
        book('fanduel', 'FanDuel', [
          ['h2h', [['New York Knicks', 2.1], ['Boston Celtics', 1.8]]],
          ['spreads', [['New York Knicks', 1.95, -1.5], ['Boston Celtics', 1.87, 1.5]]],
        ], 4),
        book('betmgm', 'BetMGM', [
          ['h2h', [['New York Knicks', 1.87], ['Boston Celtics', 2.02]]],
          ['totals', [['Over', 1.87, 224.5], ['Under', 1.95, 224.5]]],
        ], 1),
        book('betrivers', 'BetRivers', [
          ['totals', [['Over', 2.05, 224.5], ['Under', 1.8, 224.5]]],
        ], 6),
      ],
    },
    {
      id: 'demo-nfl-1',
      sport_key: 'americanfootball_nfl',
      sport_title: 'NFL',
      commence_time: h(27),
      home_team: 'Kansas City Chiefs',
      away_team: 'Buffalo Bills',
      bookmakers: [
        book('draftkings', 'DraftKings', [
          ['h2h', [['Kansas City Chiefs', 1.65], ['Buffalo Bills', 2.3]]],
          ['spreads', [['Kansas City Chiefs', 1.91, -2.5], ['Buffalo Bills', 1.91, 2.5]]],
          ['totals', [['Over', 1.91, 47.5], ['Under', 1.91, 47.5]]],
        ]),
        book('hardrockbet', 'Hard Rock Bet', [
          ['spreads', [['Kansas City Chiefs', 2.08, -2.5], ['Buffalo Bills', 1.77, 2.5]]],
        ], 3),
        book('espnbet', 'theScore Bet', [
          ['h2h', [['Kansas City Chiefs', 1.67], ['Buffalo Bills', 2.25]]],
          ['spreads', [['Kansas City Chiefs', 1.83, -2.5], ['Buffalo Bills', 2.0, 2.5]]],
          ['totals', [['Over', 1.95, 47.5], ['Under', 1.87, 47.5]]],
        ], 5),
      ],
    },
    {
      id: 'demo-epl-1',
      sport_key: 'soccer_epl',
      sport_title: 'EPL',
      commence_time: h(40),
      home_team: 'Arsenal',
      away_team: 'Chelsea',
      bookmakers: [
        book('draftkings', 'DraftKings', [['h2h', [['Arsenal', 2.1], ['Draw', 3.4], ['Chelsea', 3.6]]]]),
        book('fanduel', 'FanDuel', [['h2h', [['Arsenal', 2.2], ['Draw', 3.3], ['Chelsea', 3.5]]]], 7),
        book('betmgm', 'BetMGM', [['h2h', [['Arsenal', 2.05], ['Draw', 3.75], ['Chelsea', 3.8]]]], 2),
      ],
    },
    {
      id: 'demo-nhl-1',
      sport_key: 'icehockey_nhl',
      sport_title: 'NHL',
      commence_time: h(5),
      home_team: 'Boston Bruins',
      away_team: 'New York Rangers',
      bookmakers: [
        book('draftkings', 'DraftKings', [['h2h', [['Boston Bruins', 1.8], ['New York Rangers', 2.05]]]]),
        book('betrivers', 'BetRivers', [['h2h', [['Boston Bruins', 1.85], ['New York Rangers', 2.0]]]], 9),
      ],
    },
    {
      // Has an "arb" only because one price is 3 hours old: hidden by the default max-age filter.
      id: 'demo-ncaaf-1',
      sport_key: 'americanfootball_ncaaf',
      sport_title: 'NCAAF',
      commence_time: h(50),
      home_team: 'Michigan Wolverines',
      away_team: 'Ohio State Buckeyes',
      bookmakers: [
        book('fanduel', 'FanDuel', [['totals', [['Over', 1.91, 44.5], ['Under', 1.91, 44.5]]]]),
        book('ballybet', 'Bally Bet', [['totals', [['Over', 2.2, 44.5], ['Under', 1.7, 44.5]]]], 180),
      ],
    },
    {
      // Already started: hidden by the default "skip live games" filter.
      id: 'demo-nba-live',
      sport_key: 'basketball_nba',
      sport_title: 'NBA',
      commence_time: h(-0.5),
      home_team: 'Denver Nuggets',
      away_team: 'Los Angeles Lakers',
      bookmakers: [
        book('draftkings', 'DraftKings', [['h2h', [['Denver Nuggets', 1.5], ['Los Angeles Lakers', 2.7]]]]),
        book('fliff', 'Fliff', [['h2h', [['Denver Nuggets', 1.62], ['Los Angeles Lakers', 2.45]]]]),
        book('betparx', 'betPARX', [['h2h', [['Denver Nuggets', 1.45], ['Los Angeles Lakers', 2.9]]]]),
      ],
    },
  ];
}

/** Sample player-prop odds for one NBA game (shape of /v4/sports/{sport}/events/{id}/odds). */
export function demoPropEvents(now = Date.now()) {
  const { h, book } = helpers(now);
  const B = 'Jalen Brunson', T = 'Jayson Tatum', J = 'Josh Hart';
  return [
    {
      id: 'demo-nba-props-1',
      sport_key: 'basketball_nba',
      sport_title: 'NBA',
      commence_time: h(3),
      home_team: 'New York Knicks',
      away_team: 'Boston Celtics',
      bookmakers: [
        book('draftkings', 'DraftKings', [
          ['player_points', [['Over', 1.87, 25.5, B], ['Under', 1.95, 25.5, B], ['Over', 1.91, 27.5, T], ['Under', 1.91, 27.5, T]]],
          ['player_rebounds', [['Over', 1.91, 8.5, T], ['Under', 1.91, 8.5, T], ['Over', 2.2, 9.5, J], ['Under', 1.67, 9.5, J]]],
        ]),
        book('fanduel', 'FanDuel', [
          ['player_points', [['Over', 2.08, 25.5, B], ['Under', 1.77, 25.5, B], ['Over', 1.87, 27.5, T], ['Under', 1.95, 27.5, T]]],
          ['player_rebounds', [['Over', 1.95, 8.5, T], ['Under', 1.87, 8.5, T], ['Over', 1.6, 8.5, J], ['Under', 2.35, 8.5, J]]],
        ], 3),
        book('betmgm', 'BetMGM', [
          ['player_points', [['Over', 1.83, 25.5, B], ['Under', 2.0, 25.5, B]]],
        ], 1),
        book('espnbet', 'theScore Bet', [
          ['player_threes', [['Over', 2.1, 2.5, T], ['Under', 1.74, 2.5, T]]],
        ], 4),
        book('betrivers', 'BetRivers', [
          ['player_threes', [['Over', 1.8, 2.5, T], ['Under', 2.0, 2.5, T]]],
        ], 2),
      ],
    },
  ];
}
