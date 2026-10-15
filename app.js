import { CONFIG } from "./config.js";
import { OnlineGame } from "./online.js";
import { LocalGame } from "./local-game.js";

const $ = (selector) => document.querySelector(selector);
const online = new OnlineGame(CONFIG);
const HOME_KEY = "liarsDice.room";
const NAME_KEY = "liarsDice.name";
const faceNames = ["", "ones", "twos", "threes", "fours", "fives", "sixes"];
const dieClasses = ["", "one", "two", "three", "four", "five", "six"];
let mode = null;
let local = null;
let state = null;
let busy = false;
let handVisible = false;
let pollTimer = null;
let pollRunning = false;
let sessionGeneration = 0;
let lastRenderKey = "";
let bidContext = "";
let draftBid = { quantity: 1, face: 2 };
let messageTimer = null;
let captchaToken = null;
let captchaWidget = null;
let tableUnavailable = false;

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* A game still works without saved preferences. */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Storage may be blocked by the browser. */
    }
  },
};

function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}
function nameOf(id) {
  return state?.players.find((player) => player.id === id)?.name || "A player";
}
function playerOf(id) {
  return state?.players.find((player) => player.id === id);
}
function die(value, extra = "") {
  const safe = Number(value);
  if (!Number.isInteger(safe) || safe < 1 || safe > 6) return "";
  return `<span class="die die-${dieClasses[safe]} ${safe === 1 ? "wild" : ""} ${extra}" role="img" aria-label="${safe}${safe === 1 ? ", wild" : ""}">${'<i aria-hidden="true"></i>'.repeat(safe)}</span>`;
}
function message(text, error = false) {
  clearTimeout(messageTimer);
  const box = $("#message-box");
  box.textContent = text;
  box.classList.toggle("error", error);
  box.hidden = false;
  messageTimer = setTimeout(
    () => {
      box.hidden = true;
    },
    error ? 10000 : 5000,
  );
}
function terminalTableError(error) {
  return /That table does not exist or has expired|Join this table first\./i.test(
    error?.message || "",
  );
}
function setConnectionProblem(problem, terminal = false) {
  tableUnavailable = problem && terminal;
  $("#connection-banner").hidden = !problem;
  $("#home-button").hidden = !tableUnavailable;
  $("#retry-button").hidden = tableUnavailable;
}
function setBusy(value) {
  busy = value;
  document
    .querySelectorAll(
      ".entry-form input, .entry-form button, .entry-tabs button, #resume-button, #local-form input, #local-form select, #local-form button",
    )
    .forEach((element) => {
      element.disabled = value;
    });
  if (value) {
    document
      .querySelectorAll(
        "#game-view [data-action], #game-view #bid-form button, #game-view #bid-form input",
      )
      .forEach((element) => {
        element.disabled = true;
      });
  } else if (state) renderGame(true);
}
function isOurTurn() {
  return state?.phase === "playing" && state.turnId === state.youId;
}
function isHost() {
  return mode === "local" || state?.hostId === state?.youId;
}
function legalBid(quantity, face) {
  return (
    Number.isInteger(quantity) &&
    Number.isInteger(face) &&
    quantity >= 1 &&
    quantity <= state.totalDice &&
    face >= 2 &&
    face <= 6 &&
    (!state.bid ||
      quantity > state.bid.quantity ||
      (quantity === state.bid.quantity && face > state.bid.face))
  );
}
function nextBid() {
  if (!state.bid) return { quantity: 1, face: 2 };
  if (state.bid.face < 6)
    return { quantity: state.bid.quantity, face: state.bid.face + 1 };
  return {
    quantity: Math.min(state.totalDice, state.bid.quantity + 1),
    face: 2,
  };
}

function switchEntry(tab) {
  for (const name of ["create", "join"]) {
    const selected = tab === name;
    $(`#${name}-tab`).setAttribute("aria-selected", String(selected));
    $(`#${name}-tab`).tabIndex = selected ? 0 : -1;
    $(`#${name}-panel`).hidden = !selected;
  }
}
function buildLocalNames() {
  const count = Number($("#local-count").value);
  const existing = [...document.querySelectorAll(".local-player-name")].map(
    (input) => input.value,
  );
  $("#local-names").innerHTML = Array.from(
    { length: count },
    (_, index) =>
      `<label for="local-name-${index}">Player ${index + 1}<input class="local-player-name" id="local-name-${index}" maxlength="20" autocomplete="off" value="${escapeHTML(existing[index] || `Player ${index + 1}`)}" required></label>`,
  ).join("");
}
function updateResume() {
  const code = storage.get(HOME_KEY);
  $("#resume-button").hidden = !code || !online.configured;
  $("#resume-button").textContent = code
    ? `Return to table ${code}`
    : "Return to your table";
}
function cleanCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

async function enterOnline(action, code = null, name = "") {
  if (busy) return;
  if (!online.configured) {
    message(
      "Online play needs the database settings in config.js. See README.md to connect your free Supabase project.",
      true,
    );
    return;
  }
  const generation = ++sessionGeneration;
  setBusy(true);
  try {
    await online.connect(captchaToken || undefined);
    const snapshot = await online.request(
      action,
      code,
      action === "get" ? {} : { name: name.trim() },
    );
    if (generation !== sessionGeneration) return;
    mode = "online";
    local = null;
    handVisible = false;
    if (name.trim()) storage.set(NAME_KEY, name.trim());
    storage.set(HOME_KEY, snapshot.code);
    acceptSnapshot(snapshot, true);
    setConnectionProblem(false);
    schedulePoll();
    window.scrollTo({ top: 0, behavior: "instant" });
  } catch (error) {
    if (generation !== sessionGeneration) return;
    message(
      error.message || "Could not open this table. Please try again.",
      true,
    );
    if (
      action === "get" &&
      terminalTableError(error) &&
      storage.get(HOME_KEY) === code
    ) {
      storage.remove(HOME_KEY);
      updateResume();
    }
    if (captchaWidget !== null && window.turnstile) {
      captchaToken = null;
      window.turnstile.reset(captchaWidget);
    }
  } finally {
    if (generation === sessionGeneration) setBusy(false);
  }
}

function renderRoster() {
  const host = isHost();
  const players = state.players;
  return `<aside class="panel roster-panel"><div class="roster-title"><h2>At the table</h2><span class="count-tag">${players.length} / 10</span></div><ol class="player-list">${players
    .map((player) => {
      const current = state.phase === "playing" && state.turnId === player.id;
      const out = player.diceCount === 0;
      const self = mode === "online" && player.id === state.youId;
      let role = current
        ? "Bidding now"
        : out
          ? "Out this game"
          : player.id === state.hostId
            ? "Host"
            : state.phase === "lobby"
              ? "Ready to play"
              : "In the game";
      if (self) role += " · You";
      const removable =
        mode === "online" && host && state.removableIds?.includes(player.id);
      return `<li class="player-row ${current ? "current" : ""} ${out ? "out" : ""}"><span class="player-avatar" aria-hidden="true">${escapeHTML([...player.name][0]?.toUpperCase() || "?")}</span><div class="player-details"><div class="player-name">${escapeHTML(player.name)}</div><div class="player-role">${role}</div></div>${state.phase !== "lobby" ? `<span class="player-dice">${player.diceCount} ${player.diceCount === 1 ? "die" : "dice"}</span>` : ""}${removable ? `<button class="remove-button" data-action="remove" data-player="${escapeHTML(player.id)}" aria-label="Remove ${escapeHTML(player.name)}">Remove</button>` : ""}</li>`;
    })
    .join(
      "",
    )}</ol>${state.phase === "lobby" && players.length < 10 ? '<div class="empty-seat"><span aria-hidden="true">+</span> Room for your friends</div>' : ""}<p class="roster-footnote">${mode === "online" ? "One player per device or browser profile. Reopen this page in the same browser to reconnect." : "Pass the device after each turn. Keep your dice hidden from the other players."}</p>${state.canClaimHost && mode === "online" ? '<button class="button secondary compact claim-host" data-action="claim_host">Become host</button>' : ""}${mode === "online" && host && state.phase !== "lobby" ? '<p class="roster-footnote">Absent players become removable after 90 seconds. Removing a player who still has dice restarts the current round.</p>' : ""}</aside>`;
}
function renderTopbar() {
  return `<div class="game-topbar"><div class="table-label"><div><div class="eyebrow">${mode === "online" ? "PRIVATE TABLE" : "ONE DEVICE, EVERYONE PLAYS"}</div><h1>${mode === "online" ? escapeHTML(state.code) : "Pass & play"}</h1><div class="table-meta">${mode === "online" ? `<span class="status-dot"></span> Playing as <strong>${escapeHTML(nameOf(state.youId))}</strong>` : '<span class="local-mode-tag">LOCAL GAME</span>'}</div></div></div><div class="button-row">${mode === "online" ? '<button class="button secondary compact" data-action="copy">Copy invite <span aria-hidden="true">↗</span></button>' : ""}<button class="button secondary compact" data-action="leave">${mode === "local" ? "End game" : "Leave table"}</button></div></div>`;
}
function renderLobby() {
  const enoughPlayers = state.players.length >= 2;
  return `<div class="lobby-layout"><section class="panel lobby-main"><div class="eyebrow"><span class="status-dot"></span> THE TABLE IS OPEN</div><h2>Good company.<br>Questionable honesty.</h2><p class="muted">${mode === "online" ? "Send your friends the invite link or this room code. The host can start when everyone has joined." : "Everyone’s here. Start the game, then pass the device to the first player."}</p>${mode === "online" ? `<div class="lobby-code" aria-label="Room code ${escapeHTML(state.code)}">${escapeHTML(state.code)}</div>` : '<div style="height:24px"></div>'}${isHost() ? `<button class="button primary" data-action="start" ${!enoughPlayers || busy ? "disabled" : ""}>${enoughPlayers ? "Roll the dice" : "Waiting for a friend"} <span aria-hidden="true">→</span></button><p class="action-help">${enoughPlayers ? `${state.players.length} players · Five dice each · Ones are wild` : "You need at least two players to begin."}</p>` : `<p class="notice">Waiting for ${escapeHTML(nameOf(state.hostId))} to start the game.</p>`}</section>${renderRoster()}</div>`;
}
function renderHand() {
  const dice = state.dice || [];
  if (!dice.length)
    return '<section class="panel hand-panel"><h2>You’re watching the table.</h2><p class="muted">You’re out of dice this game. Stay for the next one.</p></section>';
  return `<section class="panel hand-panel"><div class="hand-header"><div><h2>${mode === "local" ? `${escapeHTML(nameOf(state.youId))}’s dice` : "Your dice"}</h2><p>Only you can see this hand.</p></div><button class="button secondary compact" data-action="toggle-hand" aria-pressed="${handVisible}">${handVisible ? "Hide dice" : "Show dice"}</button></div><div class="dice-hand" aria-label="${handVisible ? "Your hand" : "Your dice are hidden"}">${handVisible ? dice.map((value) => die(value)).join("") : dice.map(() => '<span class="die hidden-die" aria-hidden="true">?</span>').join("")}</div><p class="hand-hint">${handVisible ? "Amber ones are wild. They count toward every bid." : "Make sure no one is looking before revealing your hand."}</p></section>`;
}
function renderActions() {
  if (!isOurTurn())
    return `<section class="panel waiting-panel"><span class="waiting-icon" aria-hidden="true">◷</span><div><h2>${escapeHTML(nameOf(state.turnId))} is up.</h2><p class="muted">${playerOf(state.youId)?.diceCount === 0 ? "You can follow the rest of the game from here." : "Keep your dice close. Your turn is coming."}</p></div></section>`;
  const noRaise =
    state.bid && state.bid.quantity === state.totalDice && state.bid.face === 6;
  return `<section class="panel action-panel"><h2>Your move.</h2><p class="muted">${state.bid ? "Raise the bid, or call their bluff." : "Start the bidding. Count dice across the whole table."}</p><form id="bid-form"><div class="bid-controls"><div><label class="field-label" for="bid-quantity">QUANTITY</label><div class="quantity-control"><button type="button" data-step="-1" aria-label="Decrease quantity">−</button><input id="bid-quantity" type="number" inputmode="numeric" min="1" max="${state.totalDice}" value="${draftBid.quantity}" required><button type="button" data-step="1" aria-label="Increase quantity">+</button></div></div><div><span class="field-label" id="face-label">DICE FACE</span><div class="face-options" role="group" aria-labelledby="face-label">${[2, 3, 4, 5, 6].map((face) => `<button type="button" class="face-choice" data-face="${face}" aria-label="${faceNames[face]}" aria-pressed="${draftBid.face === face}">${face}</button>`).join("")}</div></div></div><div class="action-buttons"><button id="place-bid" type="submit" class="button primary" ${busy || !legalBid(draftBid.quantity, draftBid.face) ? "disabled" : ""}>Bid ${draftBid.quantity} ${faceNames[draftBid.face]}</button><button type="button" class="button danger" data-action="challenge" ${!state.bid || busy ? "disabled" : ""}>Call Liar!</button></div><p id="bid-help" class="action-help">${noRaise ? "This is the highest possible bid. Call Liar! to reveal the dice." : state.bid ? "Bid more dice with any face, or the same number with a higher face." : "Your bid means “at least this many” among everyone’s dice."}</p></form></section>`;
}
function renderPlaying() {
  const bid = state.bid;
  return `<div class="play-layout"><div class="game-main"><section class="table-board" aria-label="Current round"><div class="board-metadata"><span>ROUND ${state.round}</span><span>${state.totalDice} DICE IN PLAY</span></div><div class="turn-marker ${isOurTurn() ? "your-turn" : ""}">${isOurTurn() ? "YOUR TURN" : `${escapeHTML(nameOf(state.turnId))}’S TURN`}</div>${bid ? `<p class="bid-label">THE CURRENT BID</p><div class="bid-display" aria-label="${bid.quantity} ${faceNames[bid.face]}"><span class="bid-number">${bid.quantity}</span><span class="bid-cross" aria-hidden="true">×</span>${die(bid.face)}</div><p class="board-footnote">${escapeHTML(nameOf(bid.playerId))} says there are at least ${bid.quantity} ${faceNames[bid.face]}. Ones count.</p>` : '<h2 class="bid-empty">Make them believe it.</h2><p class="board-footnote">No bids yet. Every one is wild.</p>'}</section>${renderHand()}${renderActions()}</div>${renderRoster()}</div>`;
}
function renderRevealDetails() {
  const reveal = state.reveal;
  if (!reveal) return "";
  const loser = playerOf(reveal.loserId);
  return `<section class="panel reveal-intro"><div class="eyebrow">ROUND ${state.round} · THE DICE ARE OUT</div><h2>${reveal.truthful ? "The bid holds up." : "Bluff called."}</h2><p><strong>${escapeHTML(nameOf(reveal.challengerId))}</strong> challenged <strong>${escapeHTML(nameOf(reveal.bidderId))}</strong>. ${escapeHTML(nameOf(reveal.loserId))} loses a die${loser?.diceCount === 0 ? " and is out of the game" : ""}.</p><div class="result-count"><div><strong>${reveal.quantity}</strong><span>${faceNames[reveal.face]} were bid</span></div><div><strong>${reveal.matches}</strong><span>matched, including wild ones</span></div></div><div class="reveal-hands">${reveal.hands.map((hand) => `<div class="revealed-player"><h3>${escapeHTML(nameOf(hand.playerId))}${hand.playerId === reveal.loserId ? " · −1 die" : ""}</h3><div class="reveal-dice">${hand.dice.map((value) => die(value, value === 1 || value === reveal.face ? "match" : "")).join("")}</div></div>`).join("")}</div><p class="reveal-legend">Highlighted dice match the bid. These are the rolls before the die was lost.</p>${state.phase === "reveal" ? `<button class="button primary full-width" style="margin-top:22px" data-action="next">Next round <span aria-hidden="true">→</span></button><p class="action-help">${escapeHTML(nameOf(state.turnId))} starts the next round.${mode === "online" ? " Anyone at the table can continue." : ""}</p>` : ""}</section>`;
}
function renderEnd() {
  return `<div class="play-layout"><div class="game-main">${state.phase === "finished" ? `<section class="panel winner-panel"><div class="winner-symbol" aria-hidden="true">♛</div><div class="eyebrow">LAST PLAYER STANDING</div><h2>${state.winnerId ? `${escapeHTML(nameOf(state.winnerId))} wins.` : "Game complete."}</h2><p class="muted">A steady hand. An excellent poker face.<br>Think you can do it again?</p>${isHost() ? '<button class="button primary" data-action="rematch">Play again <span aria-hidden="true">→</span></button>' : `<p class="notice">Waiting for ${escapeHTML(nameOf(state.hostId))} to open a new game.</p>`}</section>` : ""}${renderRevealDetails()}</div>${renderRoster()}</div>`;
}

function renderGame(force = false) {
  if (!state) return;
  const key = JSON.stringify([
    state.version,
    state.youId,
    state.canClaimHost,
    state.removableIds,
    mode,
  ]);
  if (!force && key === lastRenderKey) return;
  lastRenderKey = key;
  const context = JSON.stringify([
    state.round,
    state.turnId,
    state.bid,
    state.phase,
  ]);
  if (context !== bidContext) {
    draftBid = nextBid();
    bidContext = context;
  }
  $("#home-view").hidden = true;
  $("#game-view").hidden = false;
  $("#game-view").innerHTML =
    renderTopbar() +
    (state.phase === "lobby"
      ? renderLobby()
      : state.phase === "playing"
        ? renderPlaying()
        : renderEnd());
  if (busy)
    document
      .querySelectorAll(
        "#game-view [data-action], #bid-form button, #bid-form input",
      )
      .forEach((element) => {
        element.disabled = true;
      });
}
function acceptSnapshot(snapshot, force = false) {
  if (
    !snapshot ||
    typeof snapshot.version !== "number" ||
    !Array.isArray(snapshot.players)
  )
    throw new Error(
      "The table returned an invalid response. Please refresh and try again.",
    );
  if (state && snapshot.code === state.code && snapshot.version < state.version)
    return;
  const previous = state;
  state = snapshot;
  if (
    !previous ||
    previous.round !== snapshot.round ||
    previous.phase !== snapshot.phase ||
    (mode === "local" && previous.turnId !== snapshot.turnId)
  )
    handVisible = false;
  renderGame(force);
  if (
    mode === "local" &&
    state.phase === "playing" &&
    (!previous ||
      previous.phase !== state.phase ||
      previous.turnId !== state.turnId ||
      previous.round !== state.round)
  )
    showPrivacy();
  if (state.phase !== "playing" && $("#privacy-dialog").open)
    $("#privacy-dialog").close();
  if (previous && previous.version !== snapshot.version) {
    if (snapshot.phase === "reveal")
      message(
        `${nameOf(snapshot.reveal.loserId)} loses a die. The round is revealed.`,
      );
    else if (snapshot.phase === "finished")
      message(
        snapshot.winnerId
          ? `${nameOf(snapshot.winnerId)} wins the game.`
          : "The game is complete.",
      );
    else if (snapshot.phase === "playing" && isOurTurn() && mode === "online")
      message("Your turn. Raise the bid or call Liar!");
  }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  if (mode !== "online" || !state || tableUnavailable) return;
  pollTimer = setTimeout(poll, document.hidden ? 10000 : 2500);
}
async function poll() {
  if (mode !== "online" || !state) return;
  if (busy || pollRunning) {
    schedulePoll();
    return;
  }
  pollRunning = true;
  const generation = sessionGeneration;
  const code = state.code;
  try {
    const snapshot = await online.request("get", code);
    if (generation !== sessionGeneration || mode !== "online") return;
    acceptSnapshot(snapshot);
    setConnectionProblem(false);
  } catch (error) {
    if (generation === sessionGeneration) {
      setConnectionProblem(true, terminalTableError(error));
      $("#connection-message").textContent =
        error.message || "Connection interrupted. Your table is still here.";
    }
  } finally {
    pollRunning = false;
    if (generation === sessionGeneration) schedulePoll();
  }
}
async function act(action, payload = {}) {
  if (busy || !state) return;
  const generation = sessionGeneration;
  const currentCode = state.code;
  setBusy(true);
  try {
    const snapshot =
      mode === "local"
        ? local.request(action, payload, state.version)
        : await online.request(action, currentCode, payload, state.version);
    if (generation !== sessionGeneration) return;
    setConnectionProblem(false);
    acceptSnapshot(snapshot);
  } catch (error) {
    if (generation !== sessionGeneration) return;
    message(
      error.message || "That move could not be completed. Try again.",
      true,
    );
    if (mode === "online") {
      try {
        const fresh = await online.request("get", currentCode);
        if (generation === sessionGeneration) {
          acceptSnapshot(fresh);
          setConnectionProblem(false);
        }
      } catch (refreshError) {
        if (generation === sessionGeneration) {
          setConnectionProblem(true, terminalTableError(refreshError));
          $("#connection-message").textContent =
            refreshError.message ||
            "Connection interrupted. Your table is still here.";
        }
      }
    }
  } finally {
    if (generation === sessionGeneration) {
      setBusy(false);
      schedulePoll();
    }
  }
}
function showPrivacy() {
  if (mode !== "local" || state?.phase !== "playing") return;
  handVisible = false;
  renderGame(true);
  $("#privacy-title").textContent = `${nameOf(state.turnId)}, you’re up.`;
  $("#privacy-copy").textContent =
    "Pass the device, then make sure only you can see the screen.";
  if (!$("#privacy-dialog").open) $("#privacy-dialog").showModal();
}
function askToLeave() {
  $("#confirm-copy").textContent =
    mode === "local"
      ? "This ends the local game for everyone. The game is not saved."
      : state.phase === "lobby"
        ? "Your seat will be removed. You can join again before the game starts."
        : state.phase === "finished"
          ? "You’ll leave this table. The other players can stay and start a new game."
          : playerOf(state.youId)?.diceCount === 0
            ? "You’ll leave your spectator seat. The current round will continue without interruption."
            : "You will forfeit your remaining dice. The table will restart the round for the remaining players. You cannot rejoin an active game.";
  $("#confirm-dialog").showModal();
}
function returnHome(notice = "You left the table.") {
  sessionGeneration++;
  clearTimeout(pollTimer);
  if (mode === "online") storage.remove(HOME_KEY);
  mode = null;
  local = null;
  state = null;
  lastRenderKey = "";
  bidContext = "";
  handVisible = false;
  if ($("#privacy-dialog").open) $("#privacy-dialog").close();
  if ($("#confirm-dialog").open) $("#confirm-dialog").close();
  $("#game-view").hidden = true;
  $("#game-view").innerHTML = "";
  $("#home-view").hidden = false;
  setConnectionProblem(false);
  updateResume();
  message(notice);
}
async function leaveGame() {
  if (busy) return;
  $("#confirm-dialog").close();
  setBusy(true);
  try {
    if (mode === "online" && !tableUnavailable)
      await online.request("leave", state.code);
    returnHome();
  } catch (error) {
    if (terminalTableError(error))
      returnHome("This table is no longer available. You’re back home.");
    else
      message(
        error.message ||
          "Could not leave the table. Check your connection and try again.",
        true,
      );
  } finally {
    setBusy(false);
  }
}
async function copyInvite() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", state.code);
  try {
    await navigator.clipboard.writeText(url.href);
    message("Invite link copied. Send it to your friends.");
  } catch {
    // The fallback keeps the invite usable on browsers without clipboard access.
    const field = document.createElement("textarea");
    field.value = url.href;
    field.setAttribute("aria-label", "Invite link");
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      /* Display the code instead. */
    }
    field.remove();
    message(
      copied
        ? "Invite link copied. Send it to your friends."
        : `Share this room code with your friends: ${state.code}`,
    );
  }
}
function updateBidControls() {
  const field = $("#bid-quantity");
  if (!field || !state) return;
  draftBid.quantity = Number(field.value);
  document
    .querySelectorAll("[data-face]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.face) === draftBid.face),
      ),
    );
  const valid = legalBid(draftBid.quantity, draftBid.face);
  $("#place-bid").disabled = busy || !valid;
  $("#place-bid").textContent =
    `Bid ${Number.isInteger(draftBid.quantity) && draftBid.quantity > 0 ? draftBid.quantity : "…"} ${faceNames[draftBid.face]}`;
  if (!valid)
    $("#bid-help").textContent =
      draftBid.quantity < 1 ||
      draftBid.quantity > state.totalDice ||
      !Number.isInteger(draftBid.quantity)
        ? `Choose a whole number from 1 to ${state.totalDice}.`
        : "That bid does not raise the current bid. Choose more dice or a higher face.";
  else
    $("#bid-help").textContent =
      `You’re bidding at least ${draftBid.quantity} ${faceNames[draftBid.face]} across the whole table, including ones.`;
}

$("#create-panel").addEventListener("submit", (event) => {
  event.preventDefault();
  enterOnline("create", null, $("#create-name").value);
});
$("#join-panel").addEventListener("submit", (event) => {
  event.preventDefault();
  enterOnline("join", cleanCode($("#join-code").value), $("#join-name").value);
});
$("#join-code").addEventListener("input", (event) => {
  event.target.value = cleanCode(event.target.value);
});
$("#resume-button").addEventListener("click", () =>
  enterOnline("get", storage.get(HOME_KEY)),
);
for (const button of document.querySelectorAll("[data-entry-tab]")) {
  button.addEventListener("click", () => switchEntry(button.dataset.entryTab));
  button.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const tab =
        event.key === "Home"
          ? "create"
          : event.key === "End"
            ? "join"
            : button.dataset.entryTab === "create"
              ? "join"
              : "create";
      switchEntry(tab);
      $(`#${tab}-tab`).focus();
    }
  });
}
$("#local-count").addEventListener("change", buildLocalNames);
$("#local-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  try {
    const names = [...document.querySelectorAll(".local-player-name")].map(
      (input) => input.value.trim(),
    );
    const nextLocal = new LocalGame(names);
    sessionGeneration++;
    clearTimeout(pollTimer);
    local = nextLocal;
    mode = "local";
    state = null;
    lastRenderKey = "";
    bidContext = "";
    handVisible = false;
    setConnectionProblem(false);
    acceptSnapshot(local.snapshot(), true);
    window.scrollTo({ top: 0, behavior: "instant" });
    act("start");
  } catch (error) {
    message(error.message, true);
  }
});
$("#game-view").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled || busy) return;
  if (button.dataset.face) {
    draftBid.face = Number(button.dataset.face);
    updateBidControls();
    return;
  }
  if (button.dataset.step) {
    const field = $("#bid-quantity");
    field.value = String(
      Math.max(
        1,
        Math.min(
          state.totalDice,
          (Number(field.value) || 1) + Number(button.dataset.step),
        ),
      ),
    );
    updateBidControls();
    return;
  }
  const action = button.dataset.action;
  if (action === "toggle-hand") {
    handVisible = !handVisible;
    renderGame(true);
  } else if (action === "copy") copyInvite();
  else if (action === "leave") askToLeave();
  else if (action === "remove") {
    // Removing a player is deliberately separate from taking an in-game turn.
    const player = playerOf(button.dataset.player);
    if (
      player &&
      window.confirm(
        `Remove ${player.name} from this table?${state.phase === "lobby" || state.phase === "finished" ? "" : player.diceCount > 0 ? " Their dice will be forfeited and the round will restart." : " Their spectator seat will be removed. The current round will continue."}`,
      )
    )
      act("remove", { playerId: player.id });
  } else if (
    ["start", "challenge", "next", "rematch", "claim_host"].includes(action)
  )
    act(action);
});
$("#game-view").addEventListener("input", (event) => {
  if (event.target.id === "bid-quantity") updateBidControls();
});
$("#game-view").addEventListener("submit", (event) => {
  if (event.target.id !== "bid-form") return;
  event.preventDefault();
  if (!busy && legalBid(draftBid.quantity, draftBid.face))
    act("bid", { ...draftBid });
});
$("#rules-button").addEventListener("click", () =>
  $("#rules-dialog").showModal(),
);
$("#close-rules").addEventListener("click", () => $("#rules-dialog").close());
$("#got-rules").addEventListener("click", () => $("#rules-dialog").close());
$("#cancel-leave").addEventListener("click", () =>
  $("#confirm-dialog").close(),
);
$("#confirm-leave").addEventListener("click", leaveGame);
$("#privacy-quit").addEventListener("click", askToLeave);
$("#privacy-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
});
$("#reveal-local").addEventListener("click", () => {
  if (mode !== "local" || state?.phase !== "playing") return;
  handVisible = true;
  $("#privacy-dialog").close();
  renderGame(true);
});
$("#retry-button").addEventListener("click", () => {
  clearTimeout(pollTimer);
  poll();
});
$("#home-button").addEventListener("click", () => {
  if (!busy && tableUnavailable)
    returnHome("This table is no longer available. You’re back home.");
});
function concealHand() {
  if (!state || state.phase !== "playing") return;
  if (mode === "local") showPrivacy();
  else if (handVisible) {
    handVisible = false;
    renderGame(true);
  }
}
window.addEventListener("blur", concealHand);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) concealHand();
  if (mode === "online") {
    if (!document.hidden) {
      clearTimeout(pollTimer);
      poll();
    } else schedulePoll();
  }
});
window.addEventListener("online", () => {
  if (mode === "online") {
    clearTimeout(pollTimer);
    poll();
  }
});
window.addEventListener("offline", () => {
  if (mode === "online") setConnectionProblem(true);
});

function initializeCaptcha() {
  if (!CONFIG.turnstileSiteKey || !online.configured) return;
  window.ldTurnstileReady = () => {
    captchaWidget = window.turnstile.render("#captcha-container", {
      sitekey: CONFIG.turnstileSiteKey,
      theme: "dark",
      size: "flexible",
      callback: (token) => {
        captchaToken = token;
      },
      "expired-callback": () => {
        captchaToken = null;
      },
      "error-callback": () => {
        captchaToken = null;
      },
    });
  };
  const script = document.createElement("script");
  script.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ldTurnstileReady&render=explicit";
  script.async = true;
  script.defer = true;
  script.onerror = () =>
    message(
      "Could not load human verification. Check your connection and reload the page.",
      true,
    );
  document.head.append(script);
}

$("#setup-notice").hidden = online.configured;
const savedName = storage.get(NAME_KEY) || "";
$("#create-name").value = savedName;
$("#join-name").value = savedName;
const inviteCode = cleanCode(
  new URLSearchParams(window.location.search).get("room"),
);
if (inviteCode) {
  $("#join-code").value = inviteCode;
  switchEntry("join");
}
buildLocalNames();
updateResume();
initializeCaptcha();
