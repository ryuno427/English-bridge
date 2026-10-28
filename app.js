"use strict";

const APP = {
  name: "English Bridge",
  version: "0.2.0",
  databaseName: "englishBridgeDB",
  databaseVersion: 1,
  stores: [
    "quickRecords", "reviewCards", "reviewLogs", "usageLogs",
    "weeklyPlans", "dailyGoals", "categories", "settings", "appMeta"
  ]
};

const root = document.documentElement;
const themeButton = document.querySelector("#themeButton");
const syncButton = document.querySelector("#syncButton");
const accountButton = document.querySelector("#accountButton");
const noticeDialog = document.querySelector("#noticeDialog");
const dialogMessage = document.querySelector("#dialogMessage");
const goalCheck = document.querySelector("#goalCheck");
const authDialog = document.querySelector("#authDialog");
const authForm = document.querySelector("#authForm");
const authStatus = document.querySelector("#authStatus");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const signUpButton = document.querySelector("#signUpButton");
const signOutButton = document.querySelector("#signOutButton");
const closeAuthButton = document.querySelector("#closeAuthButton");

let dbPromise;
let supabaseClient = null;
let currentUser = null;

function configurationReady() {
  const cfg = window.ENGLISH_BRIDGE_CONFIG || {};
  return cfg.supabaseUrl?.startsWith("https://") &&
    cfg.supabasePublishableKey &&
    !cfg.supabasePublishableKey.startsWith("YOUR_");
}

function initializeSupabase() {

  alert("configurationReady = " + configurationReady());

  alert("window.supabase = " + Boolean(window.supabase));

  alert(
    "window.supabase.createClient = " +
    Boolean(window.supabase?.createClient)
  );

  if (!configurationReady()) {
    alert("config.js 読み込み失敗");
    return;
  }

  if (!window.supabase?.createClient) {
    alert("Supabase CDN 読み込み失敗");
    return;
  }

  const cfg = window.ENGLISH_BRIDGE_CONFIG;

  supabaseClient = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  alert("Supabase初期化成功");
}

  const cfg = window.ENGLISH_BRIDGE_CONFIG;
  supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem("englishBridgeTheme") || "system";
  savedTheme === "system" ? root.removeAttribute("data-theme") : root.setAttribute("data-theme", savedTheme);
}

function cycleTheme() {
  const current = localStorage.getItem("englishBridgeTheme") || "system";
  const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
  localStorage.setItem("englishBridgeTheme", next);
  applySavedTheme();
  showNotice(`表示テーマを「${next === "system" ? "端末設定" : next === "light" ? "ライト" : "ダーク"}」にしました。`);
}

function showNotice(message) {
  dialogMessage.textContent = message;
  typeof noticeDialog.showModal === "function" ? noticeDialog.showModal() : alert(message);
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(APP.databaseName, APP.databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      APP.stores.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function getAllLocal(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putLocal(storeName, item) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readwrite").objectStore(storeName).put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getDeviceId() {
  let id = localStorage.getItem("englishBridgeDeviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("englishBridgeDeviceId", id);
  }
  return id;
}

function itemTimestamp(item) {
  return Date.parse(item.updatedAt || item.updated_at || item.createdAt || 0) || 0;
}

async function refreshAuthState() {
  if (!supabaseClient) {
    currentUser = null;
    authStatus.textContent = "config.jsにSupabaseの接続情報を設定してください。";
  } else {
    const { data, error } = await supabaseClient.auth.getUser();
    currentUser = error ? null : data.user;
    authStatus.textContent = currentUser
      ? `${currentUser.email} でログイン中です。`
      : "ログインするとPC・iPhone・iPadで同期できます。";
  }
  signOutButton.hidden = !currentUser;
  authEmail.hidden = Boolean(currentUser);
  authPassword.hidden = Boolean(currentUser);
  document.querySelector('label:has(#authEmail)').hidden = Boolean(currentUser);
  document.querySelector('label:has(#authPassword)').hidden = Boolean(currentUser);
  document.querySelector("#signInButton").hidden = Boolean(currentUser);
  signUpButton.hidden = Boolean(currentUser);
  accountButton.textContent = currentUser ? "●" : "♙";
}

async function signIn(event) {
  event.preventDefault();
  if (!supabaseClient) return showNotice("先にconfig.jsへSupabaseの接続情報を設定してください。");
  authStatus.textContent = "ログインしています…";
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: authEmail.value.trim(), password: authPassword.value
  });
  if (error) return authStatus.textContent = `ログインできませんでした: ${error.message}`;
  await refreshAuthState();
  await syncNow();
}

async function signUp() {
  if (!authForm.reportValidity()) return;
  if (!supabaseClient) return showNotice("先にconfig.jsへSupabaseの接続情報を設定してください。");
  authStatus.textContent = "登録しています…";
  const { data, error } = await supabaseClient.auth.signUp({
    email: authEmail.value.trim(), password: authPassword.value,
    options: { emailRedirectTo: location.href.split("#")[0].split("?")[0] }
  });
  if (error) return authStatus.textContent = `登録できませんでした: ${error.message}`;
  authStatus.textContent = data.session
    ? "登録とログインが完了しました。"
    : "確認メールを送りました。メール内のリンクを開いてください。";
  await refreshAuthState();
}

async function signOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null;
  await refreshAuthState();
}

async function syncNow() {
  if (!navigator.onLine) return showNotice("オフラインです。データは端末内に残り、オンライン時に同期できます。");
  if (!supabaseClient || !currentUser) return authDialog.showModal();
  syncButton.disabled = true;
  syncButton.textContent = "…";
  try {
    const { data: remoteItems, error: pullError } = await supabaseClient
      .from("sync_items").select("store_name,item_id,payload,updated_at,deleted_at");
    if (pullError) throw pullError;

    const remoteMap = new Map((remoteItems || []).map((row) => [`${row.store_name}:${row.item_id}`, row]));
    const uploads = [];
    for (const storeName of APP.stores) {
      const localItems = await getAllLocal(storeName);
      for (const local of localItems) {
        const key = `${storeName}:${local.id}`;
        const remote = remoteMap.get(key);
        if (!remote || itemTimestamp(local) > Date.parse(remote.updated_at)) {
          uploads.push({
            user_id: currentUser.id,
            store_name: storeName,
            item_id: String(local.id),
            payload: local,
            device_id: getDeviceId(),
            updated_at: new Date(local.updatedAt || local.createdAt || Date.now()).toISOString(),
            deleted_at: local.isDeleted ? (local.deletedAt || new Date().toISOString()) : null
          });
        }
      }
    }

    if (uploads.length) {
      const { error } = await supabaseClient.from("sync_items")
        .upsert(uploads, { onConflict: "user_id,store_name,item_id" });
      if (error) throw error;
    }

    for (const row of remoteItems || []) {
      if (row.deleted_at) continue;
      const localItems = await getAllLocal(row.store_name);
      const local = localItems.find((item) => String(item.id) === row.item_id);
      if (!local || Date.parse(row.updated_at) > itemTimestamp(local)) {
        await putLocal(row.store_name, row.payload);
      }
    }

    localStorage.setItem("englishBridgeLastSyncAt", new Date().toISOString());
    showNotice(`同期が完了しました。送信 ${uploads.length}件、確認 ${(remoteItems || []).length}件。`);
  } catch (error) {
    console.error(error);
    showNotice(`同期できませんでした。端末内のデータは保持されています。\n${error.message}`);
  } finally {
    syncButton.disabled = false;
    syncButton.textContent = "↻";
  }
}

async function initializeApp() {
  applySavedTheme();
  goalCheck.checked = localStorage.getItem("englishBridgeGoalDone") === "true";
  await openDatabase();
  initializeSupabase();
  await refreshAuthState();
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async () => {
      await refreshAuthState();
    });
  }
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(console.error));
  }
}

themeButton.addEventListener("click", cycleTheme);
accountButton.addEventListener("click", () => authDialog.showModal());
syncButton.addEventListener("click", syncNow);
authForm.addEventListener("submit", signIn);
signUpButton.addEventListener("click", signUp);
signOutButton.addEventListener("click", signOut);
closeAuthButton.addEventListener("click", () => authDialog.close());
goalCheck.addEventListener("change", () => localStorage.setItem("englishBridgeGoalDone", String(goalCheck.checked)));

document.querySelectorAll("[data-placeholder]").forEach((button) => {
  button.addEventListener("click", () => showNotice(`${button.dataset.placeholder}は次の開発作業で追加します。`));
});
document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => { item.classList.remove("active"); item.removeAttribute("aria-current"); });
    button.classList.add("active");
    button.setAttribute("aria-current", "page");
    if (button.dataset.view !== "home") showNotice(`${button.textContent.trim()}画面は次の開発作業で追加します。`);
  });
});

initializeApp().catch((error) => {
  console.error(error);
  showNotice("アプリの初期化に失敗しました。ブラウザのコンソールを確認してください。");
});
