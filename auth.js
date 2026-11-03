/*
 * Google sign-in through Supabase Auth.
 * Shows a login screen until the player is signed in, then greets them by name
 * with their Google profile picture and starts the blackjack table.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const loginScreen = $("login-screen");
  const game = $("game");
  const loginBtn = $("google-login");
  const loginError = $("login-error");
  const signOutBtn = $("sign-out");
  const avatar = $("avatar");
  const avatarFallback = $("avatar-fallback");
  const greeting = $("greeting");

  const cfg = window.SUPABASE_CONFIG || {};
  if (!cfg.anonKey || cfg.anonKey.startsWith("PASTE_")) {
    showLogin("Login isn't set up yet: add your Supabase anon key to config.js.");
    loginBtn.disabled = true;
    return;
  }

  const supabase = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });

  loginBtn.addEventListener("click", async () => {
    loginBtn.disabled = true;
    loginError.textContent = "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Come back to this exact page (works on localhost and on Netlify).
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      loginBtn.disabled = false;
      loginError.textContent = `Couldn't start Google sign-in: ${error.message}`;
    }
  });

  signOutBtn.addEventListener("click", async () => {
    signOutBtn.disabled = true;
    await supabase.auth.signOut();
    signOutBtn.disabled = false;
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    // Defer so we never call other Supabase methods inside the callback.
    setTimeout(() => (session ? showGame(session.user) : showLogin()), 0);
  });

  // Report OAuth errors Supabase sends back in the URL (e.g. the user cancelled).
  const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
  const oauthError = params.get("error_description");
  if (oauthError) {
    showLogin(`Sign-in failed: ${oauthError.replace(/\+/g, " ")}`);
    history.replaceState(null, "", window.location.pathname);
  }

  function showLogin(message = "") {
    if (window.Profile) window.Profile.reset();
    game.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    loginBtn.disabled = false;
    if (message) loginError.textContent = message;
  }

  function showGame(user) {
    const meta = user.user_metadata || {};
    const fullName = meta.full_name || meta.name || user.email || "Player";
    const firstName = (meta.given_name || fullName).split(" ")[0];
    const picture = meta.avatar_url || meta.picture;

    setIdentity(firstName, fullName, picture);

    // Tidy the ?code=... left in the address bar after the Google redirect.
    if (window.location.search.includes("code=")) {
      history.replaceState(null, "", window.location.pathname);
    }

    loginScreen.classList.add("hidden");
    game.classList.remove("hidden");
    window.startBlackjack(user.id);
    // Load the player's profile; once saved, the greeting uses their chosen name and picture.
    window.Profile.init(supabase, user, (profile) => {
      const name = profile.full_name || fullName;
      setIdentity(name.split(" ")[0], name, profile.avatar_url || picture);
    });
  }

  function setIdentity(firstName, fullName, picture) {
    greeting.textContent = `Welcome, ${firstName}!`;
    greeting.title = fullName;
    avatarFallback.textContent = initials(fullName);
    if (picture) {
      avatar.src = picture;
      avatar.alt = fullName;
      avatar.classList.remove("hidden");
      avatarFallback.classList.add("hidden");
    } else {
      showFallback();
    }
  }

  avatar.addEventListener("error", showFallback);
  function showFallback() {
    avatar.classList.add("hidden");
    avatarFallback.classList.remove("hidden");
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");
  }
})();
