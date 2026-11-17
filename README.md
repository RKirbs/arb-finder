# Arb Finder

A free sports-betting arbitrage finder for US sportsbooks. It's a static website (plain HTML, CSS and JavaScript) with no server, no build step and no hosting cost.

## Where the odds come from

[The Odds API](https://the-odds-api.com/) has a **free plan with 500 credits a month** and allows calls straight from the browser. Each visitor pastes their **own** free key. The key is stored in their browser's localStorage and only sent to `api.the-odds-api.com`.

Why each visitor brings their own key:
- It costs you $0 however many people use the site. One shared free key would run out after a few dozen searches.
- You never hold or redistribute the odds data yourself. Each user pulls it under their own account.
- No backend means there's nothing to secure, scale or keep running.

Scraping the sportsbooks directly would also be free, but it breaks their terms of service, they block it aggressively, and it would break every week.

### Books covered (free plan)
DraftKings, FanDuel, BetMGM, theScore Bet, BetRivers, Hard Rock Bet, Bally Bet, betPARX, Fliff, plus exchanges and prediction markets (Novig, ProphetX, Kalshi, Polymarket US, BetOpenly) and offshore books (BetOnline, Bovada, LowVig, MyBookie, BetUS, …).
Caesars, Fanatics, ReBet and Courtside need a paid Odds API plan. They appear in the list tagged "paid plan".

### Player props
The **Player props** tab scans over/under props (points, yards, strikeouts…) using the per-event endpoint `/v4/sports/{sport}/events/{id}/odds`. Listing games is free; each game costs `props × ceil(books / 10)` credits, so 5 NBA games × 4 props = 20 credits per scan. Props work on the free plan, but a paid plan (from $30/month for 20,000 credits) suits regular prop scanning. The UI and guide explain this.

### Cover bets
Under game-line results, **Cover bets** lists the lowest-margin "normal" straight bets at each selected book (favourite or Over on popular sports), with the expected cost per $10. It uses data that's already loaded, so it costs no credits. It's there to help users mix recreational action in with arbs. The guide's "Avoid getting limited" section covers the full strategy and the things never to do (beards, multiple accounts, VPNs).

### Credit cost
Each search costs about `sports × markets × ceil(books / 10)` credits. With the defaults (9 books, 3 markets) that's 3 credits per sport, so 6 sports cost 18 credits and a free key covers roughly 25 full searches a month. The site shows the estimate before each search and the real balance (from the API's response headers) afterwards. Loading the sports list is free.

## For users

`guide.html` is the user-facing guide, linked from the Finder's header. It covers how arbitrage works, getting and entering a free Odds API key, reading results, placing bets safely, every setting, credit budgeting, risks, and an FAQ. New visitors without a key see a 4-step setup card in the Finder too.

## Run locally

ES modules need to be served over http, not opened as a file:

```sh
cd "Arbitrage Finder Project"
python3 -m http.server 8000
# open http://localhost:8000          (add ?demo=1 to show sample data)
# open http://localhost:8000/test/    (math tests; should say 22/22 passed)
```

## Put it online (free)

Any static host works. The easiest options:

**Netlify Drop (no account setup, ~1 minute)**
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page.
3. You get a public URL right away. You can rename the site in Site settings.

**GitHub Pages**
1. Create a public repo and push this folder's contents to it.
2. Repo → Settings → Pages → Source: *Deploy from a branch* → `main` / root.
3. The site goes live at `https://<your-username>.github.io/<repo>/`.

**Cloudflare Pages:** connect the repo, or upload the folder directly. Leave the build command empty and set the output directory to `/`.

## Files

| File | What it does |
|---|---|
| `index.html` | The Finder: page layout and disclaimers |
| `guide.html` | Full user guide: how it works, free API key setup, FAQ |
| `styles.css` | Styling, with automatic light and dark themes |
| `js/arb.js` | The arbitrage math (pure functions, no DOM) |
| `js/app.js` | UI, API calls, and settings persistence |
| `js/props.js` | Player prop markets per sport, with labels and defaults |
| `js/books.js` | Sportsbook list and default sports. Edit this when books are added or removed |
| `js/demo-data.js` | Made-up sample odds for the "sample data" button |
| `test/index.html` | Browser test suite for `arb.js` |

## How the math works

For each game and market, the finder groups the outcomes that together cover every possible result:
- **Moneyline**: both teams, plus the Draw for 3-way soccer markets
- **Spread**: Team A −x paired with Team B +x (only exact opposite numbers)
- **Total**: Over x paired with Under x (same number)

It then takes the best decimal price on each side across the selected books. If `Σ 1/price < 1`, there's an arb, with ROI `1/Σ − 1`. The stakes are `bankroll × (1/price) / Σ` for each leg, so every outcome pays the same. When stakes are rounded, the profit shown is the worst case after rounding.

Filters that cut down false positives:
- **Ignore odds older than…** drops prices The Odds API hasn't seen recently (uses the market-level `last_update`).
- **Skip games already started**: live odds move faster than this data refreshes.
- Edges over 10% get a warning, because they're nearly always stale lines or pricing errors a book will void.

## Things to know before sharing publicly

- Keep the 21+ / 1-800-GAMBLER notice and the "not betting advice" text in the footer.
- Read The Odds API's terms of service. Bring-your-own-key keeps you clear of redistribution issues, but don't switch to one shared key on a public site without checking their terms.
- Not affiliated with any sportsbook. Don't use sportsbook logos.
