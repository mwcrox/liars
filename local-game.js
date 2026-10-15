/** Pass-and-play engine. Online games are instead adjudicated in setup.sql. */
function randomInt(max) {
  const value = new Uint32Array(1);
  const limit = Math.floor(4294967296 / max) * max;
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % max;
}

export class LocalGame {
  constructor(names) {
    if (!Array.isArray(names) || names.length < 2 || names.length > 10)
      throw new Error("Add 2–10 players.");
    const clean = names.map((name) => String(name).trim());
    if (clean.some((name) => !name || [...name].length > 20))
      throw new Error("Names must be 1–20 characters.");
    if (
      new Set(clean.map((name) => name.toLocaleLowerCase())).size !==
      clean.length
    )
      throw new Error("Each player needs a different name.");
    this.players = clean.map((name, seat) => ({
      id: `local-${seat + 1}`,
      name,
      seat,
      diceCount: 5,
      left: false,
    }));
    this.hostId = this.players[0].id;
    this.phase = "lobby";
    this.version = 1;
    this.round = 0;
    this.turnId = null;
    this.bid = null;
    this.reveal = null;
    this.winnerId = null;
    this.hands = new Map();
  }

  get alive() {
    return this.players.filter((player) => player.diceCount > 0);
  }
  get totalDice() {
    return this.players.reduce((sum, player) => sum + player.diceCount, 0);
  }

  nextAlive(id) {
    const position = this.players.findIndex((player) => player.id === id);
    for (let step = 1; step <= this.players.length; step++) {
      const player = this.players[(position + step) % this.players.length];
      if (player.diceCount > 0) return player.id;
    }
    return null;
  }

  roll(starter) {
    this.round++;
    this.phase = "playing";
    this.bid = null;
    this.reveal = null;
    this.turnId = starter;
    this.hands = new Map(
      this.players.map((player) => [
        player.id,
        Array.from({ length: player.diceCount }, () => randomInt(6) + 1),
      ]),
    );
  }

  snapshot() {
    const youId = this.phase === "playing" ? this.turnId : this.hostId;
    return structuredClone({
      code: "LOCAL",
      version: this.version,
      phase: this.phase,
      hostId: this.hostId,
      youId,
      round: this.round,
      turnId: this.turnId,
      bid: this.bid,
      players: this.players,
      dice: this.hands.get(youId) || [],
      totalDice: this.totalDice,
      reveal: this.reveal,
      winnerId: this.winnerId,
      canClaimHost: false,
      removableIds: [],
    });
  }

  request(action, payload = {}, version = null) {
    if (action === "get") return this.snapshot();
    if (version !== null && version !== this.version)
      throw new Error("The table changed. Refresh and try again.");
    if (action === "start") {
      if (this.phase !== "lobby")
        throw new Error("The game has already started.");
      this.roll(this.alive[randomInt(this.alive.length)].id);
    } else if (action === "bid") {
      if (this.phase !== "playing") throw new Error("Bidding is closed.");
      const { quantity, face } = payload;
      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > this.totalDice
      )
        throw new Error("Choose a valid dice quantity.");
      if (!Number.isInteger(face) || face < 2 || face > 6)
        throw new Error("Choose a face from 2 to 6. Ones are wild.");
      if (
        this.bid &&
        !(
          quantity > this.bid.quantity ||
          (quantity === this.bid.quantity && face > this.bid.face)
        )
      )
        throw new Error(
          "Raise the quantity, or keep the quantity and raise the face.",
        );
      this.bid = { quantity, face, playerId: this.turnId };
      this.turnId = this.nextAlive(this.turnId);
    } else if (action === "challenge") {
      if (this.phase !== "playing" || !this.bid)
        throw new Error("There must be a bid to challenge.");
      const matches = [...this.hands.values()]
        .flat()
        .filter((die) => die === 1 || die === this.bid.face).length;
      const truthful = matches >= this.bid.quantity;
      const loserId = truthful ? this.turnId : this.bid.playerId;
      this.reveal = {
        bidderId: this.bid.playerId,
        challengerId: this.turnId,
        loserId,
        quantity: this.bid.quantity,
        face: this.bid.face,
        matches,
        truthful,
        hands: this.players
          .filter((player) => player.diceCount > 0)
          .map((player) => ({
            playerId: player.id,
            dice: [...this.hands.get(player.id)],
          })),
      };
      const loser = this.players.find((player) => player.id === loserId);
      loser.diceCount--;
      this.turnId = loser.diceCount > 0 ? loser.id : this.nextAlive(loser.id);
      if (this.alive.length === 1) {
        this.phase = "finished";
        this.winnerId = this.alive[0].id;
      } else this.phase = "reveal";
    } else if (action === "next") {
      if (this.phase !== "reveal")
        throw new Error("The next round is not ready.");
      this.roll(this.turnId);
    } else if (action === "rematch") {
      if (this.phase !== "finished")
        throw new Error("Finish this game before a rematch.");
      this.players.forEach((player) => {
        player.diceCount = 5;
      });
      this.phase = "lobby";
      this.round = 0;
      this.turnId = this.bid = this.reveal = this.winnerId = null;
      this.hands.clear();
    } else throw new Error("Unknown game action.");
    this.version++;
    return this.snapshot();
  }
}
