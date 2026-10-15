# Liar’s Dice

A phone-friendly Liar’s Dice game for **2–10 people**, with a private hand on each person’s device. **Ones are wild.** Online rooms are the main mode; pass and play is available as a smaller option on the home screen.

The project uses separate HTML, CSS, and JavaScript files. GitHub Pages hosts the website, and Supabase stores rooms and runs the online game rules. The files are ready to configure; **the online game is not deployed until you complete the setup below.**

## What “free” means

Use a **public GitHub repository with GitHub Free** and a **Supabase Free project**. You do not need to buy a domain, rent a server, enable paid Edge Functions, or install a JavaScript build system.

| Service                        | Role                                     | Free-plan considerations                                                                                                                                                |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Pages                   | Serves the website                       | Available for public repositories on GitHub Free. Your source code is public.                                                                                           |
| Supabase Free                  | Database and anonymous player identities | Currently includes a 500 MB database, 5 GB egress, and 50,000 monthly active users; maximum two active Free projects. Free projects pause after one week of inactivity. |
| Cloudflare Turnstile, optional | Reduces automated anonymous sign-ups     | A free plan is available. You can use it without moving the website to Cloudflare.                                                                                      |

These are the published limits checked October 15, 2026. This design is intended for casual games with friends, but free service is subject to provider limits and future plan changes. It is not a promise of unlimited traffic or uninterrupted service. Keep the project on the Free plan and check its Usage page occasionally. The app’s database responses count toward egress.

Official references: [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [Supabase pricing](https://supabase.com/pricing), [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/).

## 1. Create the free database

1. Open [supabase.com](https://supabase.com/) and create or sign in to your account.
2. Create a project in a **Free** organization. Name it `liars-dice`, choose a nearby region, and save the database password somewhere private. This password does **not** go into the website.
3. Wait for the project to finish provisioning.
4. Open **SQL Editor**, then create a new query.
5. Open the supplied **`setup.sql`** in a text editor. Copy its **entire contents** into the SQL Editor and select **Run**. Use a new project for this installation.
6. Confirm that the query completes successfully. It creates the game tables and the `public.ld_api` function used by the website.
7. Open **Authentication → Sign In / Providers** (dashboard labels may vary), find **Anonymous Sign-Ins**, and enable them. Save the change.

Players enter a display name, not an email address or password. Supabase still assigns each browser an authenticated anonymous identity so the server can tell players apart.

Keep `ld_private` **out of the Data API’s exposed schemas**. Only the `public` schema needs to be exposed for this game. The supplied SQL denies direct client access to the private tables. Do not add public read policies or broad table grants to make the game work; the website uses the checked `ld_api` function instead.

You do not need to enable Supabase Realtime or create a publication. The game checks for updates approximately every 2.5 seconds while visible, and every 10 seconds while hidden; browser background throttling can delay those checks further.

## 2. Connect the website to Supabase

1. In your Supabase project, open **Connect** to find the Project URL and publishable key. You can also find keys under **Settings → API Keys**.
2. Open the supplied **`config.js`**.
3. Paste the URL and **publishable key** between the quotes:

```javascript
export const CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseKey: "sb_publishable_YOUR_PUBLIC_KEY",
  turnstileSiteKey: "",
};
```

4. Save the file. Leave `turnstileSiteKey` empty for the first test unless you have already enabled CAPTCHA in Supabase.

The publishable key is designed to appear in browser code and a public repository. A legacy **`anon`** key also works if your existing project still uses one, but use a publishable key for a new setup. **Never put a `service_role` key, an `sb_secret_…` key, the database password, or a Turnstile secret into these files.**

The public key does not make other players’ dice public. The database function verifies the player’s session, room membership, turn, and action before returning that player’s view.

Reference: [Supabase API key types and where to find them](https://supabase.com/docs/guides/getting-started/api-keys).

## 3. Publish it on GitHub Pages

1. Sign in to [github.com](https://github.com/) and create a new repository named **`liars-dice`**.
2. Choose **Public** so GitHub Pages is available on GitHub Free.
3. Upload the project files to the repository’s top level. **`index.html` must be at the top level**, not inside an extra `liars-dice` subfolder. Upload the extracted files, not the ZIP archive.
4. Confirm that these files appear together:

   | File            | Purpose                                            |
   | --------------- | -------------------------------------------------- |
   | `index.html`    | Page structure                                     |
   | `styles.css`    | Responsive layout and appearance                   |
   | `app.js`        | Screens, controls, and game interaction            |
   | `online.js`     | Supabase sign-in and online requests               |
   | `local-game.js` | Pass-and-play rules                                |
   | `config.js`     | Your public project configuration                  |
   | `setup.sql`     | Database installation script; run this in Supabase |
   | `README.md`     | These instructions                                 |

5. Commit the upload to the **`main`** branch.
6. Open the repository’s **Settings → Pages**.
7. Under **Build and deployment**, choose **Deploy from a branch**.
8. Select **`main`** and **`/ (root)`**, then **Save**.
9. Wait for the Pages deployment to finish. The Pages settings will show your site’s address.

For a repository named `liars-dice` under `mwcrox`, the address will be:

**https://mwcrox.github.io/liars-dice/**

Use your actual account and repository names if different. Share the website address with players; they do not need GitHub or Supabase accounts. Future commits to `main` publish updates automatically.

References: [GitHub Pages publishing settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [entry-file location](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## 4. Play a first online game

1. Open the published site on your phone or computer, enter your name, and create a room.
2. Share its invite link or six-character room code.
3. Each friend opens the site on their own device, enters a different display name, and joins that room.
4. Wait for everyone to join. The host starts the game when there are 2–10 players.
5. Tap to show your own dice. On your turn, raise the bid or call the previous bidder’s bluff.
6. Review the revealed hands after a challenge, then continue to the next round.

New players can join in the lobby only. An existing player can resume a game using the same browser identity. A room code is an invitation, so share it with the people you want at the table.

### Rules used in this version

- Everyone begins with **five dice**. The last player with dice wins.
- **Ones count as wild for every bid.** Bids use faces **2–6**; there are no bids on ones.
- A bid claims that at least that many matching dice exist across all surviving hands. “Four 3s” counts both 3s and 1s.
- Raise by increasing the quantity with any face, or keeping the quantity and increasing the face. After “four 3s,” both “four 4s” and “five 2s” are valid.
- Only the next player may bid or challenge. You cannot challenge until a bid exists.
- A challenge reveals the round’s dice. If there are fewer matches than claimed, the bidder loses one die. Otherwise, the challenger loses one die. An exact match means the bid was true.
- Everyone remaining rerolls for the next round. The loser starts if still alive; otherwise the next surviving player clockwise starts. The first round’s starting player is random.
- There are no exact-call bonuses or special one-die rounds in this ruleset.

### Reconnecting and host controls

- Refreshing or reopening the same browser can restore your identity. Use **Resume** when available, or rejoin with the room code. Clearing site data, switching browser profiles, or closing a private-browsing session can lose that identity.
- One browser profile is one player. Two regular tabs in the same browser are not two players. Use separate devices, browser profiles, or different browsers for testing.
- The host starts games, removes players, and returns the table to a lobby for a rematch.
- In a lobby, the host can remove another player. During a game, removal is available only after that player has stopped checking in for more than 90 seconds.
- If the host stops checking in for more than 90 seconds, a remaining player can claim the host role. Deliberately leaving transfers it to another player.
- **Leave** forfeits your place. A player who still has dice departing during a live round discards that round’s bid and starts a fresh round for the remaining players. One remaining player wins. An eliminated spectator leaving does not disturb the current round.
- A brief disconnection does not automatically cost a die. If someone cannot return, use the host controls after the absence threshold.
- Rooms expire after 24 hours without game-changing activity. Creating a new room clears expired rooms; merely leaving a tab open does not extend a room forever. Each identity can host at most three unexpired rooms.

## 5. Optional: add free bot protection

Before sharing the site widely, consider enabling **Cloudflare Turnstile**. Supabase recommends CAPTCHA for anonymous sign-ins because automated account creation can consume database space. The widget integration is already included in the game.

1. Create a free Cloudflare account and open **Turnstile**.
2. Add a widget using **Managed** mode. Add your website’s hostname, such as **`mwcrox.github.io`**. Enter the hostname without `https://` or `/liars-dice/`.
3. Copy its public **site key** into `turnstileSiteKey` in `config.js` and publish the updated file.
4. In Supabase’s authentication settings, open **Bot and Abuse Protection**. Enable CAPTCHA, choose **Turnstile**, paste the **secret key there**, and save it.
5. Test creating a room in a fresh browser profile. Complete the widget if prompted.

Use both sides of that configuration together. Enabling CAPTCHA in Supabase while leaving the website’s site key empty blocks new sign-ins. Existing sessions can make a configuration mistake harder to notice, which is why the test uses a fresh profile. No change to GitHub Pages hosting is needed.

References: [Supabase CAPTCHA setup](https://supabase.com/docs/guides/auth/auth-captcha), [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/).

## Pass and play

Expand the smaller pass-and-play option on the home screen and enter 2–10 names. Everyone shares one device. At each turn, a privacy screen identifies the next player; pass the device before revealing the hand.

This mode does not connect to Supabase and works with an empty `config.js`. Its current game lives only in that page’s memory: refreshing or closing the page ends it. It is a trust-based local mode; someone controlling the shared browser can inspect its in-memory state.

To try it before publishing, serve the folder locally instead of double-clicking `index.html`. The JavaScript files use modules, which require an HTTP server. For example, if Python is installed, open a terminal in the project folder and run:

```bash
python -m http.server 8000
```

On Windows, `py -m http.server 8000` may be the available command; on macOS/Linux, use `python3 -m http.server 8000` if needed. Open **http://localhost:8000/**. This server only serves the files; it does not replace Supabase for online games.

## Verify the finished setup

Do this before your first game night:

1. **Two players:** open two different browsers or devices. Create and join a room, start, place a bid, challenge, and start the next round. Both screens should agree on the turn, result, and dice counts.
2. **Private hands:** during a live round, open a desktop browser’s Developer Tools → Network and inspect a response for `ld_api`. The top-level `dice` array should contain only that player’s hand; other players’ entries should contain counts, not rolls. All hands should appear only after a challenge in `reveal.hands`.
3. **Turn enforcement:** the waiting player should have no working bid or challenge action. A second submission based on an old version should be rejected and refreshed rather than applied twice.
4. **Reconnect:** refresh one player’s page and resume. Check that the player keeps the same seat and hand.
5. **Ten players:** create a fresh room, join with ten distinct devices/profiles, and start. Try an eleventh identity while still in the lobby on another test room; joining must be rejected once ten places are occupied.
6. **Small screens:** try both portrait and landscape on a phone. Check that you can reach the bid controls and hide/show your hand.
7. **Pass and play:** start a two-player local game and confirm that the privacy screen appears between turns.

For a direct-table privacy check, a browser client must not be able to read `ld_private` tables through the Data API, even with a valid player session. Do not test this through the Supabase SQL Editor: that editor uses your administrator privileges and is expected to see database data. The project owner can inspect stored dice; the protection is between ordinary players, not against the database administrator.

## Troubleshooting and upkeep

| Problem                                                              | What to check                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The home screen says online play is not configured                   | Save the real URL and publishable key in `config.js`, commit it, wait for deployment, then refresh.                                                                                                                                         |
| “Anonymous sign-ins are disabled”                                    | Enable Anonymous Sign-Ins in Supabase Authentication.                                                                                                                                                                                       |
| Invalid API key or unauthorized error                                | Check that URL and key belong to the same project. Use the publishable key, not a secret key.                                                                                                                                               |
| Function `ld_api` cannot be found                                    | Run all of `setup.sql` successfully in that same project. Confirm the Data API exposes `public`.                                                                                                                                            |
| CAPTCHA error                                                        | Check the Turnstile site key, allowed hostname, and the secret stored in Supabase. Use a fresh session to test.                                                                                                                             |
| Too many requests during setup                                       | Anonymous sign-up defaults to 30 requests per hour per IP. Ten players on one Wi-Fi can join, but repeatedly clearing sessions and creating new test identities can hit the limit. Reuse existing profiles and wait for the limit to reset. |
| The site loads but the online game stopped working after a week away | Check the Supabase dashboard. If paused, restore/resume the project and wait until it is ready.                                                                                                                                             |
| GitHub Pages returns 404                                             | Check Public visibility, `main` plus `/ (root)`, and `index.html` at the published root. Inspect the repository’s Actions tab for deployment failure.                                                                                       |
| Styles or scripts are missing                                        | Keep the supplied filenames and relative paths. Check that all six website files were uploaded together.                                                                                                                                    |
| Local files load but buttons do nothing                              | Use a local HTTP server or the published HTTPS URL; do not open a `file://` address.                                                                                                                                                        |
| Two tabs show the same player                                        | They share a browser identity. Use a separate browser/profile or device.                                                                                                                                                                    |
| A player seems stuck                                                 | Give polling a few seconds, check the connection, and retry. A stale turn error means another action was applied first.                                                                                                                     |
| Your previous seat cannot be recovered                               | You may have changed browsers or cleared storage. A lost anonymous identity cannot be recovered by entering the same name.                                                                                                                  |

Check Supabase’s Usage page occasionally. Expired **game rooms** are cleaned up by this application when someone creates a room; **anonymous Auth users** are separate and Supabase currently does not automatically remove them. For a small friends-only game this is usually modest, but repeated fresh-browser testing creates more identities. Periodically review old anonymous accounts under Authentication → Users and remove obsolete ones only when their games are over. Removing an identity ends its ability to resume a seat. Supabase also documents SQL for bulk cleanup; review its age criteria before using it on returning players.

Reference: [anonymous sign-in limits and cleanup](https://supabase.com/docs/guides/auth/auth-anonymous).

## How the online game stays consistent

The browser submits actions such as “bid” and “challenge” to a database function. The server rolls online dice, checks whose turn it is, validates bids, determines the loser, and returns a per-player snapshot. Room mutations use a row lock and version checks, so simultaneous actions cannot both win the same turn.

All live hands are stored in a private schema with direct client access revoked. Only the caller’s own dice are returned during play. The browser does not download everyone’s dice and merely hide them with CSS. The game needs no custom application server, Supabase SDK, npm dependencies, or Realtime setup. The optional Turnstile widget loads Cloudflare’s script only when configured.

## Included checks

The delivered code passed JavaScript rules/auth-client tests, database integration tests against PostgreSQL via PGlite with pgcrypto, and browser checks using ten separate player sessions connected to that database. Browser checks covered bidding, challenges, rerolls, hand privacy, reconnecting, expired-room recovery, pass-and-play handoffs, and layouts at 320 px, 390 px, desktop, and phone landscape widths. Supabase's hosted Auth and Data API still need the first-game verification above after you configure your own project.

If Node.js is installed, run `npm test` in this folder to repeat the eight JavaScript tests. No npm install is required. `tests/backend.sql` is an additional privileged integration suite for a disposable PostgreSQL/Supabase test database after installing `setup.sql`; it is not part of the normal website setup. Run it through `psql` because it includes a psql directive. The application itself does not require Node.js or any test tools.
