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

## Google sign-in (Supabase)

Players sign in with Google through [Supabase Auth](https://supabase.com/docs/guides/auth/social-login/auth-google). After they sign in, the table greets them by first name with their Google profile picture. Each account keeps its own bankroll in that browser.

- `config.js` holds the Supabase project URL and the **anon public key**. The anon key is meant to be used in browsers, so it's fine to commit.
- `auth.js` handles the login screen, the Google redirect, the greeting, and signing out.

Supabase dashboard setup:

1. **Authentication → Sign In / Providers → Google:** enabled, with your Google OAuth client ID and secret.
2. **Authentication → URL Configuration:** set **Site URL** to your Netlify URL. Under **Redirect URLs**, add your Netlify URL and `http://localhost:8000` for local testing.
3. In Google Cloud Console, the OAuth client's **Authorized redirect URI** must be `https://fvyvsrvaaoaxrbutlubw.supabase.co/auth/v1/callback`.

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
