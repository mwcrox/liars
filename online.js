/** Small Supabase REST client. No SDK, build step, or runtime dependency. */
export class OnlineGame {
  constructor(config) {
    this.url = (config.supabaseUrl || "").trim().replace(/\/+$/, "");
    this.key = (config.supabaseKey || "").trim();
    this.storageKey = `liars-dice-session:${this.url}`;
    this.session = this.readSession();
    this.authPromise = null;
  }

  get configured() {
    return /^https:\/\/[^/]+$/.test(this.url) && !!this.key;
  }

  get userId() {
    return this.session?.user?.id || null;
  }

  readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(this.storageKey) || "null");
      return value?.access_token && value?.refresh_token && value?.user?.id
        ? value
        : null;
    } catch {
      return null;
    }
  }

  saveSession(data) {
    if (!data.access_token || !data.refresh_token || !data.user?.id) {
      throw new Error(
        "No player session was returned. Enable anonymous sign-ins in Supabase.",
      );
    }
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at:
        data.expires_at ||
        Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: { id: data.user.id },
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.session));
    } catch {
      /* The current session still works when browser storage is blocked. */
    }
  }

  async fetchJSON(path, body, accessToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const headers = { apikey: this.key, "Content-Type": "application/json" };
      // Publishable keys are not JWTs; only the player's JWT belongs here.
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const response = await fetch(`${this.url}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        let message =
          data.message ||
          data.msg ||
          data.error_description ||
          data.error ||
          `Server error (${response.status}).`;
        if (response.status === 429)
          message =
            "Too many requests. Wait a few minutes, then try again. New guest sign-ins are limited per network.";
        if (data.code === "PGRST202")
          message =
            "The game database is not installed yet. Run setup.sql in the Supabase SQL Editor.";
        const error = new Error(message);
        error.status = response.status;
        error.code = data.code || data.error_code;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError")
        throw new Error(
          "The connection timed out. Check your connection and try again.",
        );
      if (error instanceof TypeError)
        throw new Error(
          "Cannot reach the game server. Check your connection or whether the Supabase project is paused.",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async connect(captchaToken, forceRefresh = false) {
    if (!this.configured)
      throw new Error(
        "Add your Supabase URL and public key to config.js to enable online rooms.",
      );
    if (this.key.startsWith("sb_secret_"))
      throw new Error(
        "Use a publishable key in config.js, never a secret key.",
      );
    // Catch accidentally pasted legacy service_role keys as well.
    if (this.key.startsWith("eyJ")) {
      try {
        const encoded = this.key
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        if (JSON.parse(atob(encoded)).role === "service_role")
          throw new Error(
            "Use a publishable key in config.js, never a service_role key.",
          );
      } catch (error) {
        if (error.message.includes("service_role")) throw error;
      }
    }
    if (this.authPromise) return this.authPromise;
    const authenticate = async () => {
      // Serialize refreshes between tabs when Web Locks is available.
      this.session = this.readSession() || this.session;
      if (!forceRefresh && this.session?.expires_at > Date.now() / 1000 + 60)
        return this.userId;
      if (this.session?.refresh_token) {
        try {
          this.saveSession(
            await this.fetchJSON("/auth/v1/token?grant_type=refresh_token", {
              refresh_token: this.session.refresh_token,
            }),
          );
          return this.userId;
        } catch (error) {
          if (error.status === 400 || error.status === 401) {
            this.session = null;
            try {
              localStorage.removeItem(this.storageKey);
            } catch {
              /* Storage optional. */
            }
            throw new Error(
              "Your guest session expired. Return home and reconnect. Your previous seat cannot be recovered after its session is lost.",
            );
          }
          throw error;
        }
      }
      const body = { data: {} };
      if (captchaToken)
        body.gotrue_meta_security = { captcha_token: captchaToken };
      this.saveSession(await this.fetchJSON("/auth/v1/signup", body));
      return this.userId;
    };
    this.authPromise = globalThis.navigator?.locks
      ? navigator.locks.request(this.storageKey, authenticate)
      : authenticate();
    try {
      return await this.authPromise;
    } finally {
      this.authPromise = null;
    }
  }

  async request(action, code = null, payload = {}, version = null) {
    // Do not silently create a replacement player during an existing game.
    if (!this.session && !this.readSession())
      throw new Error(
        "Your player session is missing. Return home and reconnect.",
      );
    await this.connect();
    const body = {
      p_action: action,
      p_code: code,
      p_payload: payload,
      p_version: version,
    };
    try {
      return await this.fetchJSON(
        "/rest/v1/rpc/ld_api",
        body,
        this.session.access_token,
      );
    } catch (error) {
      if (error.status !== 401) throw error;
      await this.connect(undefined, true);
      return this.fetchJSON(
        "/rest/v1/rpc/ld_api",
        body,
        this.session.access_token,
      );
    }
  }
}
