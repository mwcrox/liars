import test from "node:test";
import assert from "node:assert/strict";
import { LocalGame } from "../local-game.js";

test("validates room size and duplicate names", () => {
  assert.throws(() => new LocalGame(["A"]));
  assert.throws(
    () => new LocalGame(Array.from({ length: 11 }, (_, i) => `P${i}`)),
  );
  assert.throws(() => new LocalGame(["Sam", " sam "]));
  assert.throws(() => new LocalGame(["", "A"]));
});

test("ten players get five dice each and only current hand is in snapshot", () => {
  const game = new LocalGame(Array.from({ length: 10 }, (_, i) => `P${i}`));
  const state = game.request("start");
  assert.equal(state.totalDice, 50);
  assert.equal(state.dice.length, 5);
  assert.equal(state.players.length, 10);
  assert.equal(state.reveal, null);
  assert.ok(state.players.every((player) => !("dice" in player)));
  for (const dice of game.hands.values())
    assert.ok(dice.every((die) => die >= 1 && die <= 6));
});

test("bids must rise; ones are wild, not a bid face; stale actions fail", () => {
  const game = new LocalGame(["A", "B"]);
  game.request("start");
  game.request("bid", { quantity: 3, face: 4 });
  assert.throws(() => game.request("bid", { quantity: 3, face: 3 }));
  assert.throws(() => game.request("bid", { quantity: 4, face: 1 }));
  assert.throws(() => game.request("bid", { quantity: 11, face: 6 }));
  assert.throws(() => game.request("bid", { quantity: 4, face: 5 }, 1));
  game.request("bid", { quantity: 3, face: 5 });
  game.request("bid", { quantity: 4, face: 2 });
});

test("ones count toward truthful bid; challenger loses and starts", () => {
  const game = new LocalGame(["A", "B"]);
  game.request("start");
  game.turnId = "local-1";
  game.hands.set("local-1", [1, 1, 2, 3, 4]);
  game.hands.set("local-2", [6, 6, 2, 3, 4]);
  game.request("bid", { quantity: 4, face: 6 });
  const state = game.request("challenge");
  assert.equal(state.reveal.matches, 4);
  assert.equal(state.reveal.loserId, "local-2");
  assert.equal(state.reveal.truthful, true);
  assert.equal(state.totalDice, 9);
  assert.equal(state.reveal.hands.flatMap((hand) => hand.dice).length, 10);
  const next = game.request("next");
  assert.equal(next.turnId, "local-2");
  assert.equal(next.dice.length, 4);
  assert.equal(next.reveal, null);
});

test("false bid eliminates bidder; skips eliminated seat; rematch resets", () => {
  const game = new LocalGame(["A", "B"]);
  game.request("start");
  game.turnId = "local-1";
  game.players[0].diceCount = 1;
  game.hands.set("local-1", [2]);
  game.hands.set("local-2", [2, 2, 2, 2, 2]);
  game.request("bid", { quantity: 1, face: 6 });
  const state = game.request("challenge");
  assert.equal(state.phase, "finished");
  assert.equal(state.winnerId, "local-2");
  assert.equal(state.reveal.loserId, "local-1");
  assert.equal(state.reveal.truthful, false);
  assert.equal(game.nextAlive("local-1"), "local-2");
  const rematch = game.request("rematch");
  assert.equal(rematch.phase, "lobby");
  assert.equal(rematch.totalDice, 10);
  assert.equal(rematch.reveal, null);
});

test("complete ten-player game conserves dice until one winner remains", () => {
  const game = new LocalGame(Array.from({ length: 10 }, (_, i) => `P${i}`));
  game.request("start");
  let losses = 0;
  while (game.phase !== "finished" && losses < 50) {
    const before = game.totalDice;
    game.request("bid", { quantity: before, face: 6 });
    const snapshot = game.request("challenge");
    assert.equal(snapshot.totalDice, before - 1);
    assert.ok(snapshot.players.every((player) => player.diceCount >= 0));
    losses++;
    if (snapshot.phase === "reveal") game.request("next");
  }
  assert.equal(game.phase, "finished");
  assert.equal(game.alive.length, 1);
  assert.ok(losses >= 45 && losses <= 49);
});
