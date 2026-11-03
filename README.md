# Blackjack

A browser blackjack game built with plain HTML, CSS, and JavaScript. It uses the free [Deck of Cards API](https://deckofcardsapi.com/) for shuffling, dealing, and card images.

## How to play

- Click chips to place a bet, then press **Deal**.
- **Hit** (H), **Stand** (S), **Double** (D), **Split** (P).
- Your bankroll starts at $1,000 and is saved in your browser.

### House rules

- 6-deck shoe, reshuffled when about 1.5 decks remain
- Dealer stands on soft 17
- Blackjack pays 3:2
- Double on any first two cards, including after a split
- Split up to 4 hands; split aces get one card each

## How it uses the Deck of Cards API

| Endpoint | Used for |
| --- | --- |
| `GET /api/deck/new/shuffle/?deck_count=6` | Create a shuffled 6-deck shoe when the page loads |
| `GET /api/deck/{deck_id}/draw/?count=N` | Deal cards |
| `GET /api/deck/{deck_id}/shuffle/` | Put all cards back in the shoe and reshuffle |

Card faces come from each card's `image` URL, and the face-down card uses `https://deckofcardsapi.com/static/img/back.png`.

## Run locally

There's no build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to Netlify

`netlify.toml` tells Netlify to publish the repository root with no build command. You can:

- **Connect the repo:** In Netlify, choose *Add new site → Import an existing project*, pick this GitHub repo and the `main` branch, and deploy. The settings are read from `netlify.toml`.
- **Drag and drop:** Drag the folder that holds `index.html`, `style.css`, and `app.js` onto https://app.netlify.com/drop.
