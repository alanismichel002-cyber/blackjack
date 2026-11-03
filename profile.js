/*
 * Player profiles stored in the Supabase `profiles` table.
 * The table and its security rules live in supabase/profiles.sql.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

  const el = {
    tabs: document.querySelectorAll(".tab"),
    tabTriggers: document.querySelectorAll("[data-tab]"),
    play: $("tab-play"),
    panel: $("tab-profile"),
    nudge: $("profile-nudge"),
    loading: $("profile-loading"),
    view: $("profile-view"),
    form: $("profile-form"),
    // view
    vAvatar: $("pv-avatar"),
    vName: $("pv-name"),
    vUsername: $("pv-username"),
    vBio: $("pv-bio"),
    vLocation: $("pv-location"),
    vHand: $("pv-hand"),
    vSince: $("pv-since"),
    edit: $("pv-edit"),
    // form
    title: $("pf-title"),
    subtitle: $("pf-subtitle"),
    avatarPreview: $("pf-avatar-preview"),
    avatar: $("pf-avatar"),
    name: $("pf-name"),
    username: $("pf-username"),
    location: $("pf-location"),
    hand: $("pf-hand"),
    bio: $("pf-bio"),
    bioCount: $("pf-bio-count"),
    error: $("pf-error"),
    save: $("pf-save"),
    cancel: $("pf-cancel"),
  };

  let sb = null;
  let user = null;
  let profile = null; // the saved row, or null if the player hasn't made one
  let onChange = () => {};

  /* ---------- Tabs ---------- */

  function showTab(name) {
    el.tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    el.play.classList.toggle("hidden", name !== "play");
    el.panel.classList.toggle("hidden", name !== "profile");
  }
  el.tabTriggers.forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  /* ---------- Loading ---------- */

  async function init(client, currentUser, changed) {
    if (user && user.id === currentUser.id) {
      // Already loaded (e.g. a token refresh): just re-apply the saved name and picture.
      if (profile) changed(profile);
      return;
    }
    sb = client;
    user = currentUser;
    onChange = changed;
    profile = null;
    showOnly(el.loading);
    el.loading.textContent = "Loading your profile…";

    const { data, error } = await sb
      .from("profiles")
      .select("id, username, full_name, bio, avatar_url, location, favorite_hand, created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      el.loading.textContent = friendlyError(error);
      return;
    }

    // A row without a username (e.g. created automatically at sign-up) still needs setting up.
    profile = data && data.username ? data : null;
    if (profile) {
      onChange(profile);
      renderView();
    } else {
      openForm(data);
    }
    el.nudge.classList.toggle("hidden", !!profile);
  }

  function reset() {
    user = null;
    profile = null;
    el.nudge.classList.add("hidden");
    showTab("play");
  }

  /* ---------- View ---------- */

  function renderView() {
    setAvatar(el.vAvatar, profile.avatar_url || googlePicture(), profile.full_name);
    el.vName.textContent = profile.full_name;
    el.vUsername.textContent = "@" + profile.username;
    el.vBio.textContent = profile.bio || "No bio yet.";
    el.vBio.classList.toggle("muted", !profile.bio);
    el.vLocation.textContent = profile.location || "—";
    el.vHand.textContent = profile.favorite_hand || "—";
    el.vSince.textContent = profile.created_at
      ? new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : "—";
    showOnly(el.view);
  }

  /* ---------- Form ---------- */

  function openForm(existing) {
    const src = existing || {};
    const meta = user.user_metadata || {};
    const editing = !!profile;

    el.title.textContent = editing ? "Edit your profile" : "Create your profile";
    el.subtitle.classList.toggle("hidden", editing);
    el.cancel.classList.toggle("hidden", !editing);
    el.save.textContent = editing ? "Save changes" : "Create profile";

    el.name.value = src.full_name || meta.full_name || meta.name || "";
    el.username.value = src.username || suggestUsername(meta, user.email);
    el.location.value = src.location || "";
    el.hand.value = src.favorite_hand || "";
    el.bio.value = src.bio || "";
    // Only show a custom picture URL; blank means "use my Google photo".
    el.avatar.value = src.avatar_url && src.avatar_url !== googlePicture() ? src.avatar_url : "";
    el.error.textContent = "";
    updatePreview();
    updateBioCount();
    showOnly(el.form);
  }

  el.edit.addEventListener("click", () => openForm(profile));
  el.cancel.addEventListener("click", renderView);
  el.bio.addEventListener("input", updateBioCount);
  el.avatar.addEventListener("input", updatePreview);
  el.name.addEventListener("input", updatePreview);

  el.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {
      id: user.id,
      full_name: el.name.value.trim(),
      username: el.username.value.trim(),
      location: el.location.value.trim() || null,
      favorite_hand: el.hand.value || null,
      bio: el.bio.value.trim() || null,
      avatar_url: el.avatar.value.trim() || googlePicture() || null,
    };

    const problem = validate(values);
    if (problem) {
      el.error.textContent = problem;
      return;
    }

    el.save.disabled = true;
    el.error.textContent = "";
    const { data, error } = await sb
      .from("profiles")
      .upsert(values, { onConflict: "id" })
      .select("id, username, full_name, bio, avatar_url, location, favorite_hand, created_at")
      .single();
    el.save.disabled = false;

    if (error) {
      console.error(error);
      el.error.textContent = friendlyError(error);
      return;
    }

    profile = data;
    el.nudge.classList.add("hidden");
    onChange(profile);
    renderView();
  });

  function validate(v) {
    if (!v.full_name) return "Please enter a display name.";
    if (v.full_name.length > 50) return "Display name must be 50 characters or fewer.";
    if (!USERNAME_RE.test(v.username)) return "Usernames must be 3–20 letters, numbers or underscores.";
    if (v.bio && v.bio.length > 280) return "Bio must be 280 characters or fewer.";
    if (el.avatar.value.trim() && !/^https:\/\//i.test(el.avatar.value.trim())) {
      return "Profile picture URL must start with https://";
    }
    return "";
  }

  function friendlyError(error) {
    if (error.code === "23505") return "That username is already taken. Try another one.";
    if (error.code === "23514") return "One of the fields isn't in the right format. Please check and try again.";
    if (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205") {
      return "The profiles database isn't set up yet. Run supabase/profiles.sql in the Supabase SQL Editor.";
    }
    if (error.code === "42501") return "You don't have permission to change this profile.";
    return "Something went wrong saving your profile. Please try again.";
  }

  /* ---------- Helpers ---------- */

  function showOnly(node) {
    [el.loading, el.view, el.form].forEach((n) => n.classList.toggle("hidden", n !== node));
  }

  function googlePicture() {
    const meta = (user && user.user_metadata) || {};
    return meta.avatar_url || meta.picture || "";
  }

  function suggestUsername(meta, email) {
    const base = (meta.full_name || meta.name || (email || "").split("@")[0] || "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 20);
    return base.length >= 3 ? base : "";
  }

  function updatePreview() {
    const custom = el.avatar.value.trim();
    const url = /^https:\/\//i.test(custom) ? custom : googlePicture();
    setAvatar(el.avatarPreview, url, el.name.value);
  }

  function setAvatar(img, url, name) {
    img.onerror = () => {
      img.onerror = null;
      img.src = placeholderAvatar(name);
    };
    img.src = url || placeholderAvatar(name);
  }

  // A simple initials avatar so there's always something to show.
  function placeholderAvatar(name) {
    const letters = (name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("") || "?";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#1b5e20"/><text x="40" y="52" font-family="sans-serif" font-size="30" font-weight="700" fill="#e8c35a" text-anchor="middle">${letters.replace(/[<&>"]/g, "")}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function updateBioCount() {
    el.bioCount.textContent = el.bio.value.length;
  }

  window.Profile = { init, reset, showTab };
})();
