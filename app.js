/*
 * Blackjack powered by the Deck of Cards API (https://deckofcardsapi.com/).
 *
 * API endpoints used:
 *   GET /api/deck/new/shuffle/?deck_count=6   -> create a shuffled 6-deck shoe
 *   GET /api/deck/{id}/draw/?count=N          -> draw N cards
 *   GET /api/deck/{id}/shuffle/               -> return all cards to the shoe and reshuffle
 */

const API = "https://deckofcardsapi.com/api/deck";
const DECK_COUNT = 6;
const RESHUFFLE_AT = 78; // reshuffle when ~1.5 decks remain (the "cut card")
const STARTING_BANKROLL = 1000;
const CARD_BACK = "https://deckofcardsapi.com/static/img/back.png";
let storageKey = "blackjack.bankroll"; // made per-user once someone signs in

const state = {
  deckId: null,
  remaining: 0,
  bankroll: loadBankroll(),
  bet: 0,
  dealer: [],
  hands: [], // [{ cards, bet, done, doubled, fromSplit, result, payout }]
  active: 0,
  phase: "betting", // betting | player | dealer | over
  busy: false,
};

const $ = (id) => document.getElementById(id);
const el = {
  bankroll: $("bankroll"),
  bet: $("bet"),
  remaining: $("remaining"),
  dealerCards: $("dealer-cards"),
  dealerScore: $("dealer-score"),
  hands: $("player-hands"),
  message: $("message"),
  betting: $("betting"),
  actions: $("actions"),
  deal: $("deal"),
  clearBet: $("clear-bet"),
  hit: $("hit"),
  stand: $("stand"),
  double: $("double"),
  split: $("split"),
  reset: $("reset"),
  chips: document.querySelectorAll("[data-chip]"),
};

/* ---------- Storage ---------- */

function loadBankroll() {
  try {
    const saved = Number(localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved > 0 ? saved : STARTING_BANKROLL;
  } catch {
    return STARTING_BANKROLL;
  }
}

function saveBankroll() {
  try {
    localStorage.setItem(storageKey, String(state.bankroll));
  } catch {
    /* storage unavailable (private mode etc.) - play continues without saving */
  }
}

/* ---------- Deck of Cards API ---------- */

async function api(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`Deck API error (${res.status})`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Deck API request failed");
  if ("remaining" in data) state.remaining = data.remaining;
  return data;
}

async function newShoe() {
  const data = await api(`new/shuffle/?deck_count=${DECK_COUNT}`);
  state.deckId = data.deck_id;
}

async function reshuffleShoe() {
  await api(`${state.deckId}/shuffle/`);
}

async function draw(count = 1) {
  if (!state.deckId) await newShoe();
  let data;
  try {
    data = await api(`${state.deckId}/draw/?count=${count}`);
  } catch (err) {
    // Decks expire after two weeks of inactivity; start a fresh shoe and retry once.
    await newShoe();
    data = await api(`${state.deckId}/draw/?count=${count}`);
  }
  if (data.cards.length < count) {
    // Shoe ran dry mid-hand: reshuffle the discards back in and draw the rest.
    await reshuffleShoe();
    const more = await api(`${state.deckId}/draw/?count=${count - data.cards.length}`);
    data.cards.push(...more.cards);
  }
  return data.cards;
}

/* ---------- Blackjack rules ---------- */

function cardValue(card) {
  if (card.value === "ACE") return 11;
  if (["KING", "QUEEN", "JACK"].includes(card.value)) return 10;
  return Number(card.value);
}

function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.value === "ACE") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

const isBlackjack = (cards) => cards.length === 2 && handTotal(cards).total === 21;
const isBust = (cards) => handTotal(cards).total > 21;

/* ---------- Game flow ---------- */

function addChip(amount) {
  if (state.phase !== "betting" && state.phase !== "over") return;
  if (state.phase === "over") startBetting();
  if (state.bet + amount > state.bankroll) {
    setMessage("Not enough in your bankroll for that chip.");
    return;
  }
  state.bet += amount;
  setMessage("Place your bet, then press Deal.");
  render();
}

function clearBet() {
  state.bet = 0;
  render();
}

function startBetting() {
  state.phase = "betting";
  state.dealer = [];
  state.hands = [];
  state.active = 0;
}

async function deal() {
  if (state.bet <= 0 || state.bet > state.bankroll || state.busy) return;
  if (state.phase === "over") startBetting();

  await run(async () => {
    if (state.remaining < RESHUFFLE_AT) {
      setMessage("Shuffling the shoe…");
      await reshuffleShoe();
    }

    state.bankroll -= state.bet;
    state.hands = [{ cards: [], bet: state.bet, done: false, doubled: false, fromSplit: false }];
    state.active = 0;
    state.dealer = [];
    state.phase = "player";
    setMessage("");

    let cards;
    try {
      cards = await draw(4);
    } catch (err) {
      // Nothing was dealt, so give the bet back.
      state.bankroll += state.bet;
      startBetting();
      throw err;
    }
    const [p1, d1, p2, d2] = cards;
    state.hands[0].cards.push(p1, p2);
    state.dealer.push(d1, d2);

    const playerBJ = isBlackjack(state.hands[0].cards);
    const dealerBJ = isBlackjack(state.dealer);
    if (playerBJ || dealerBJ) {
      state.hands[0].done = true;
      finishRound();
    } else {
      setMessage("Your move.");
    }
  });
}

async function hit() {
  const hand = currentHand();
  if (!hand) return;
  await run(async () => {
    const [card] = await draw(1);
    hand.cards.push(card);
    const { total } = handTotal(hand.cards);
    if (total >= 21) {
      hand.done = true;
      await advance();
    }
  });
}

async function stand() {
  const hand = currentHand();
  if (!hand) return;
  hand.done = true;
  await run(advance);
}

async function doubleDown() {
  const hand = currentHand();
  if (!canDouble(hand)) return;
  await run(async () => {
    state.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    const [card] = await draw(1);
    hand.cards.push(card);
    hand.done = true;
    await advance();
  });
}

async function split() {
  const hand = currentHand();
  if (!canSplit(hand)) return;
  await run(async () => {
    state.bankroll -= hand.bet;
    const second = { cards: [hand.cards.pop()], bet: hand.bet, done: false, doubled: false, fromSplit: true };
    hand.fromSplit = true;
    state.hands.splice(state.active + 1, 0, second);

    const [c1, c2] = await draw(2);
    hand.cards.push(c1);
    second.cards.push(c2);

    // Split aces get one card each and no further action.
    if (hand.cards[0].value === "ACE") {
      hand.done = true;
      second.done = true;
    }
    if (handTotal(hand.cards).total === 21) hand.done = true;
    if (handTotal(second.cards).total === 21) second.done = true;
    await advance();
  });
}

/** Move to the next unfinished hand, or let the dealer play when all hands are done. */
async function advance() {
  const next = state.hands.findIndex((h) => !h.done);
  if (next !== -1) {
    state.active = next;
    setMessage(state.hands.length > 1 ? `Playing hand ${next + 1}.` : "Your move.");
    return;
  }

  state.phase = "dealer";
  render();

  const anyAlive = state.hands.some((h) => !isBust(h.cards));
  if (anyAlive) {
    // Dealer hits until 17, and stands on soft 17.
    while (handTotal(state.dealer).total < 17) {
      await pause(450);
      const [card] = await draw(1);
      state.dealer.push(card);
      render();
    }
  }
  finishRound();
}

function finishRound() {
  state.phase = "over";
  const dealer = handTotal(state.dealer).total;
  const dealerBJ = isBlackjack(state.dealer);
  let net = 0;

  for (const hand of state.hands) {
    const player = handTotal(hand.cards).total;
    // A two-card 21 after a split counts as 21, not a natural blackjack.
    const playerBJ = isBlackjack(hand.cards) && !hand.fromSplit;
    let payout = 0;
    let result;

    if (player > 21) result = "Bust";
    else if (playerBJ && dealerBJ) { result = "Push"; payout = hand.bet; }
    else if (playerBJ) { result = "Blackjack!"; payout = hand.bet * 2.5; }
    else if (dealerBJ) result = "Dealer blackjack";
    else if (dealer > 21) { result = "Win"; payout = hand.bet * 2; }
    else if (player > dealer) { result = "Win"; payout = hand.bet * 2; }
    else if (player === dealer) { result = "Push"; payout = hand.bet; }
    else result = "Lose";

    hand.result = result;
    hand.payout = payout;
    state.bankroll += payout;
    net += payout - hand.bet;
  }

  state.bankroll = Math.round(state.bankroll * 100) / 100;
  saveBankroll();

  if (state.bet > state.bankroll) state.bet = 0;

  let msg;
  if (net > 0) msg = `You win ${money(net)}!`;
  else if (net < 0) msg = `You lose ${money(-net)}.`;
  else msg = "Push.";
  if (state.bankroll <= 0) msg += " You're out of chips. Reset your bankroll to keep playing.";
  else msg += " Place a bet to play again.";
  setMessage(msg);
}

function resetBankroll() {
  if (state.busy) return;
  state.bankroll = STARTING_BANKROLL;
  state.bet = 0;
  saveBankroll();
  startBetting();
  setMessage("Bankroll reset. Place your bet.");
  render();
}

/* ---------- Helpers ---------- */

function currentHand() {
  if (state.phase !== "player" || state.busy) return null;
  return state.hands[state.active];
}

function canDouble(hand) {
  return !!hand && hand.cards.length === 2 && state.bankroll >= hand.bet;
}

function canSplit(hand) {
  return (
    !!hand &&
    state.hands.length < 4 &&
    hand.cards.length === 2 &&
    cardValue(hand.cards[0]) === cardValue(hand.cards[1]) &&
    state.bankroll >= hand.bet
  );
}

/** Run an async action with the controls locked, reporting API failures. */
async function run(fn) {
  state.busy = true;
  render();
  try {
    await fn();
  } catch (err) {
    console.error(err);
    setMessage("Couldn't reach the card dealer. Check your connection and try again.");
  } finally {
    state.busy = false;
    render();
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function money(n) {
  const digits = Number.isInteger(n) ? 0 : 2;
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function setMessage(text) {
  el.message.textContent = text;
}

/* ---------- Rendering ---------- */

/**
 * Render a row of cards, reusing the <img> elements already on screen so only
 * newly dealt cards play the deal animation.
 */
function renderCards(container, cards, isHidden = () => false) {
  cards.forEach((card, i) => {
    const hidden = isHidden(i);
    const src = hidden ? CARD_BACK : card.image;
    let img = container.children[i];
    if (!img || img.dataset.code !== card.code) {
      img = cardImg(card, hidden);
      if (container.children[i]) container.replaceChild(img, container.children[i]);
      else container.append(img);
    } else if (img.getAttribute("src") !== src) {
      img.src = src;
      img.alt = hidden ? "Face-down card" : cardName(card);
    }
  });
  while (container.children.length > cards.length) container.lastChild.remove();
}

const cardName = (card) => `${card.value} of ${card.suit}`.toLowerCase();

function cardImg(card, hidden = false) {
  const img = document.createElement("img");
  img.src = hidden ? CARD_BACK : card.image;
  img.alt = hidden ? "Face-down card" : cardName(card);
  img.dataset.code = card.code;
  return img;
}

function renderDealer() {
  const hideHole = state.phase === "player";
  renderCards(el.dealerCards, state.dealer, (i) => hideHole && i === 1);

  if (state.dealer.length === 0) el.dealerScore.textContent = "";
  else if (hideHole) el.dealerScore.textContent = handTotal([state.dealer[0]]).total;
  else el.dealerScore.textContent = scoreLabel(state.dealer);
}

function scoreLabel(cards) {
  const { total, soft } = handTotal(cards);
  return soft && total < 21 ? `soft ${total}` : String(total);
}

function renderHands() {
  // Keep one wrapper per hand so existing cards aren't re-created (and re-animated).
  while (el.hands.children.length > state.hands.length) el.hands.lastChild.remove();

  state.hands.forEach((hand, i) => {
    let wrap = el.hands.children[i];
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "hand";
      const info = document.createElement("div");
      info.className = "hand-info";
      const cards = document.createElement("div");
      cards.className = "cards";
      wrap.append(info, cards);
      el.hands.append(wrap);
    }
    const [info, cards] = wrap.children;
    wrap.classList.toggle("active", state.phase === "player" && i === state.active && state.hands.length > 1);

    const score = document.createElement("span");
    score.className = "score";
    score.textContent = scoreLabel(hand.cards);
    const bet = document.createElement("span");
    bet.textContent = `Bet ${money(hand.bet)}${hand.doubled ? " (doubled)" : ""}`;
    info.replaceChildren(score, bet);

    if (hand.result) {
      const res = document.createElement("span");
      res.className = "hand-result " + (hand.payout > hand.bet ? "win" : hand.payout < hand.bet ? "lose" : "");
      res.textContent = hand.result;
      info.append(res);
    }

    renderCards(cards, hand.cards);
  });
}

function render() {
  el.bankroll.textContent = money(state.bankroll);
  el.bet.textContent = money(state.bet);
  el.remaining.textContent = state.deckId ? `${state.remaining} cards` : "–";

  renderDealer();
  renderHands();

  const betting = state.phase === "betting" || state.phase === "over";
  el.betting.classList.toggle("hidden", !betting);
  el.actions.classList.toggle("hidden", betting);

  const ready = !!state.deckId && !state.busy;
  el.chips.forEach((chip) => {
    chip.disabled = !ready || state.bet + Number(chip.dataset.chip) > state.bankroll;
  });
  el.deal.disabled = !ready || state.bet <= 0 || state.bet > state.bankroll;
  el.clearBet.disabled = !ready || state.bet === 0;

  const hand = state.phase === "player" && !state.busy ? state.hands[state.active] : null;
  el.hit.disabled = !hand;
  el.stand.disabled = !hand;
  el.double.disabled = !canDouble(hand);
  el.split.disabled = !canSplit(hand);
  el.reset.disabled = state.busy;
}

/* ---------- Wire up ---------- */

el.chips.forEach((chip) => chip.addEventListener("click", () => addChip(Number(chip.dataset.chip))));
el.clearBet.addEventListener("click", clearBet);
el.deal.addEventListener("click", deal);
el.hit.addEventListener("click", hit);
el.stand.addEventListener("click", stand);
el.double.addEventListener("click", doubleDown);
el.split.addEventListener("click", split);
el.reset.addEventListener("click", resetBankroll);

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select")) return;
  if (document.getElementById("tab-play").classList.contains("hidden")) return;
  const key = e.key.toLowerCase();
  if (key === "h") hit();
  else if (key === "s") stand();
  else if (key === "d") (state.phase === "player" ? doubleDown() : deal());
  else if (key === "p") split();
});

/**
 * Called by auth.js once a player is signed in. Each Google account keeps its
 * own bankroll in this browser.
 */
window.startBlackjack = async function startBlackjack(userId) {
  const key = `blackjack.bankroll.${userId}`;
  if (key === storageKey && state.deckId) return; // already running for this player
  storageKey = key;
  state.bankroll = loadBankroll();
  state.bet = 0;
  startBetting();
  render();
  if (state.deckId) {
    setMessage("Place your bet, then press Deal.");
    return;
  }
  await run(async () => {
    await newShoe();
    setMessage("Place your bet, then press Deal.");
  });
};
