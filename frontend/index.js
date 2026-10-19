
const $ = (id) => document.getElementById(id);
let best = 0;

// ================= API: passano tutte da nginx =================
async function api(path, options = {}) {
const token = sessionStorage.getItem("token");
const headers = { "Content-Type": "application/json" };
if (token) headers.Authorization = "Bearer " + token;
const res = await fetch(path, { ...options, headers });
let body = {};
try { body = await res.json(); } catch (e) { /* risposta non JSON, es. 502 di nginx */ }
if (!res.ok) throw new Error(body.error || "Il server ha risposto con errore " + res.status + ".");
return body;
}

// ================= Account =================
const form = $("auth-form");
const authError = $("auth-error");
const field = (id) => $(id).value;
let authMode = "login";

function setAuthMode(newMode) {
authMode = newMode;
const register = authMode === "register";
$("register-fields").hidden = !register;
$("form-title").textContent = register ? "Crea un account" : "Accedi";
$("submit").textContent = register ? "Crea account" : "Accedi";
$("switch-text").textContent = register ? "Hai già un account?" : "Non hai un account?";
$("switch-mode").textContent = register ? "Accedi" : "Creane uno";
$("password").autocomplete = register ? "new-password" : "current-password";
authError.textContent = "";
}
$("switch-mode").addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login"));

function showProfile(p) {
$("full-name").textContent = p.nome + " " + p.cognome;
$("who").textContent = p.username;
$("who-email").textContent = p.email;
$("stat-games").textContent = p.games_played;
$("stat-best").textContent = p.best_score;
$("stat-last").textContent = p.last_score;
best = Math.max(best, p.best_score);
$("best").textContent = best;
showRank(p.rank, p.rank_points, p.ranked_games);
}

function showRank(rankId, points, games) {
const i = Math.max(0, RANKS.findIndex((r) => r.id === rankId));
const rank = RANKS[i];
myRank = rank.id;
updateMenu();
const next = RANKS[i + 1];
$("rank-icon").replaceChildren(rankIcon(rank.id, 48));
$("rank-name").textContent = rank.name;
$("rank-points").textContent = points + " punti rank";
const played = games === 1 ? "1 partita classificata" : games + " partite classificate";
if (next) {
    const span = next.min_points - rank.min_points;
    $("rank-fill").style.width = Math.min(100, ((points - rank.min_points) / span) * 100) + "%";
    $("rank-next").textContent = played + " · " + (next.min_points - points) + " punti per " + next.name;
} else {
    $("rank-fill").style.width = "100%";
    $("rank-next").textContent = played + " · rank massimo raggiunto";
}
}

async function showAccount() {
const loggedIn = !!sessionStorage.getItem("token");
$("logged-out").hidden = loggedIn;
$("logged-in").hidden = !loggedIn;
$("type-ranked").disabled = !loggedIn;
$("ranked-sub").textContent = loggedIn ? "Sempre Caos, il resto a caso. Cambia il rank." : "Accedi per giocare.";
if (!loggedIn) nextMatch = null;
if (!loggedIn && playType === "classificata" && state === "idle") setPlayType("normale");
if (!loggedIn) return;
try {
    showProfile(await api("/api/auth/me"));
} catch (err) {
    sessionStorage.clear();
    $("logged-out").hidden = false;
    $("logged-in").hidden = true;
    authError.textContent = err.message;
}
}

form.addEventListener("submit", async (event) => {
event.preventDefault();
authError.textContent = "";
const credentials = { username: field("username"), password: field("password") };
try {
    if (authMode === "register") {
    await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...credentials, nome: field("nome"), cognome: field("cognome"), email: field("email") }),
    });
    }
    const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify(credentials) });
    sessionStorage.setItem("token", result.token);
    form.reset();
    setAuthMode("login");
    await showAccount();
} catch (err) {
    authError.textContent = err.message;
}
});

$("logout").addEventListener("click", async () => {
try { await api("/api/auth/logout", { method: "POST" }); } catch (e) { /* esce comunque */ }
sessionStorage.clear();
best = 0;
$("best").textContent = 0;
showAccount();
});

// ================= Classifica =================
let board = "ranked";
const BOARD_TEXT = {
ranked: { empty: "Nessuna partita classificata ancora.", note: "Ordinata per punti rank. L'icona accanto al nome è il rank del giocatore." },
record: { empty: "Nessun punteggio ancora. Fai la prima partita.", note: "Miglior punteggio di ogni giocatore, in qualsiasi partita." },
};

async function loadLeaderboard() {
const list = $("leaderboard");
const empty = $("leaderboard-empty");
$("board-note").textContent = BOARD_TEXT[board].note;
try {
    const rows = await api("/api/snake/leaderboard?type=" + board);
    list.innerHTML = "";
    rows.forEach((row) => {
    const li = document.createElement("li");
    const player = document.createElement("span");
    player.className = "player";
    const name = document.createElement("span");
    name.textContent = row.username;
    player.append(rankIcon(row.rank, 24), name);
    const value = document.createElement("span");
    value.textContent = board === "ranked" ? row.score + " pt" : row.score;
    li.append(player, value);
    list.append(li);
    });
    empty.textContent = BOARD_TEXT[board].empty;
    empty.hidden = rows.length > 0;
} catch (err) {
    empty.hidden = false;
    empty.textContent = "Classifica non disponibile: " + err.message;
}
}

document.querySelectorAll(".tab").forEach((tab) =>
tab.addEventListener("click", () => {
    board = tab.dataset.board;
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    loadLeaderboard();
})
);

// ================= Grafica: sprite 8x8 in stile pixel =================
// "." = trasparente, "k" = colore del serpente, le altre lettere = colori dello sprite
const SPRITES = {
classico: { label: "Classico", colors: {}, rows: [
    "........", "........", "...kk...", "..kkkk..", "..kkkk..", "...kk...", "........", "........"] },
mela: { label: "Mela", colors: { r: "#c0392b", d: "#8e2418", w: "#f3d9c7", b: "#5b3a1e", g: "#3f7d2b" }, rows: [
    "....b...", "...bgg..", ".rrrrrr.", "rrwrrrrr", "rwrrrrrr", "rrrrrrrd", ".rrrrdd.", "..dd.dd."] },
ciliegie: { label: "Ciliegie", colors: { r: "#b8202a", w: "#f3c4c4", g: "#3f7d2b" }, rows: [
    "....gg..", "...g.g..", "..g..g..", ".g...g..", ".r...r..", "rwr.rwr.", "rrr.rrr.", ".r...r.."] },
banana: { label: "Banana", colors: { y: "#e3b72f", d: "#a8811a", b: "#5b3a1e" }, rows: [
    "......b.", "......y.", ".....yy.", "....yyy.", "...yyyd.", "yyyyyd..", ".dddd...", "........"] },
uva: { label: "Uva", colors: { p: "#6a2f86", w: "#a77cc2", g: "#3f7d2b" }, rows: [
    "....g...", "...gg...", ".ppppp..", ".pwpwp..", "..ppppp.", "..pwpw..", "...ppp..", "....p..."] },
fragola: { label: "Fragola", colors: { r: "#cf3328", y: "#f5d76e", g: "#3f7d2b" }, rows: [
    "..gggg..", "...gg...", ".rrrrrr.", "rryrrryr", "rrrrrrrr", ".ryrryr.", "..rrrr..", "...rr..."] },
blocco: { colors: {}, rows: [
    "kkkkkkkk", "k......k", "k.kkkk.k", "k.k..k.k", "k.k..k.k", "k.kkkk.k", "k......k", "kkkkkkkk"] },
};

function drawSprite(c, sprite, px, py, size, ink) {
const n = sprite.rows.length;
const p = Math.floor(size / n);
const off = Math.floor((size - p * n) / 2);
sprite.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
    if (ch === ".") return;
    c.fillStyle = ch === "k" ? ink : sprite.colors[ch];
    c.fillRect(px + off + x * p, py + off + y * p, p, p);
    });
});
}

// ================= Rank =================
// Soglie e obiettivi arrivano da /api/snake/config; questi sono i valori di riserva
let RANKS = [
{ id: "bronzo", name: "Bronzo", min_points: 0, target: 6 },
{ id: "argento", name: "Argento", min_points: 100, target: 10 },
{ id: "oro", name: "Oro", min_points: 250, target: 15 },
{ id: "platino", name: "Platino", min_points: 450, target: 20 },
{ id: "diamante", name: "Diamante", min_points: 700, target: 26 },
];
const MEDAL = [
"..RR....RR..", "...RR..RR...", "....RRRR....", "....dddd....",
"...oooooo...", "..ohhooood..", "..ohoeeood..", "..oooeeood..",
"..oooooood..", "...oooodd...", "....dddd....", "............"];
const RANK_SPRITES = {
bronzo: { rows: MEDAL, colors: { R: "#3f7d2b", o: "#c07a3e", h: "#e8b07a", d: "#7a4520", e: "#7a4520" } },
argento: { rows: MEDAL, colors: { R: "#3b6fb6", o: "#b9c2cc", h: "#f4f7fa", d: "#6f7b89", e: "#6f7b89" } },
oro: { rows: MEDAL, colors: { R: "#c0392b", o: "#e3b72f", h: "#fff2b0", d: "#a07a12", e: "#a07a12" } },
platino: { colors: { o: "#8fd3cc", h: "#eafaf7", d: "#3d8a83", e: "#3d8a83" }, rows: [
    "............", ".dddddddddd.", ".dhhooooood.", ".dhooeeoood.", ".doeeeeeeod.", ".dooeeeeood.",
    "..dooeeood..", "..doeooeod..", "...doooood..", "....dood....", ".....dd.....", "............"] },
diamante: { colors: { b: "#6cc0f0", h: "#f0fbff", d: "#2a6f9e", w: "#ffffff" }, rows: [
    "..........w.", "...dddddd.w.", "..dhhbbbbd..", ".dhhbbbbbbd.", "dddddddddddd", ".dbbbbbbbbd.",
    "..dbbbbbbd..", "...dbbbbd...", "....dbbd....", ".....dd.....", "............", "............"] },
};
const rankById = (id) => RANKS.find((r) => r.id === id) || RANKS[0];
let myRank = "bronzo";

function rankIcon(id, px) {
const NS = "http://www.w3.org/2000/svg";
const sprite = RANK_SPRITES[id] || RANK_SPRITES.bronzo;
const n = sprite.rows.length;
const svg = document.createElementNS(NS, "svg");
svg.setAttribute("viewBox", `0 0 ${n} ${n}`);
svg.setAttribute("width", px);
svg.setAttribute("height", px);
svg.setAttribute("shape-rendering", "crispEdges");
svg.setAttribute("role", "img");
svg.setAttribute("aria-label", "Rank " + rankById(id).name);
svg.classList.add("rank-icon");
sprite.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", x);
    r.setAttribute("y", y);
    r.setAttribute("width", 1);
    r.setAttribute("height", 1);
    r.setAttribute("fill", sprite.colors[ch]);
    svg.append(r);
}));
return svg;
}

// ================= Impostazioni =================
const OPTIONS = {
color: [
    { id: "classico", label: "Classico", value: "#2c3622" },
    { id: "blu", label: "Blu", value: "#1f3f6e" },
    { id: "rosso", label: "Rosso", value: "#8c2a1c" },
    { id: "viola", label: "Viola", value: "#4e2a6e" },
    { id: "arancio", label: "Arancio", value: "#a04b0c" },
    { id: "petrolio", label: "Petrolio", value: "#0d5450" },
],
food: ["classico", "mela", "ciliegie", "banana", "uva", "fragola"].map((id) => ({ id, label: SPRITES[id].label })),
count: [
    { id: "1", label: "1", value: 1 },
    { id: "3", label: "3", value: 3 },
    { id: "5", label: "5", value: 5 },
],
size: [
    { id: "piccola", label: "Piccola", value: 12 },
    { id: "media", label: "Media", value: 18 },
    { id: "grande", label: "Grande", value: 24 },
],
speed: [
    { id: "lenta", label: "Lenta", value: 170 },
    { id: "normale", label: "Normale", value: 120 },
    { id: "veloce", label: "Veloce", value: 80 },
],
mode: [
    { id: "classica", label: "Classica", desc: "Le regole di sempre: mangia, cresci e non sbattere." },
    { id: "muri", label: "Muri", desc: "Ogni volta che mangi compare un blocco sul campo." },
    { id: "senza-bordi", label: "Senza bordi", desc: "Esci da un lato e rientri da quello opposto." },
    { id: "caos", label: "Caos", desc: "Blocchi che compaiono e niente bordi, tutto insieme." },
],
};
const DEFAULTS = { color: "classico", food: "mela", count: "1", size: "media", speed: "normale", mode: "classica" };
const STORE_KEY = "snake-settings";
const LCD = "#c7d6a5";

let prefs = { ...DEFAULTS };        // le scelte del giocatore per le partite normali
let settings = prefs;               // le impostazioni della partita attiva
let playType = "normale";           // normale | classificata
let match = null;                   // partita classificata in corso
let nextMatch = null;               // prossima classificata, già estratta dal server
// In classificata le impostazioni sono quelle estratte dal server (modalità sempre Caos)
const activeSettings = () =>
playType === "classificata" ? { ...(nextMatch ? nextMatch.settings : { ...prefs, mode: "caos" }) } : prefs;
const pick = (key) => OPTIONS[key].find((o) => o.id === settings[key]);
const randomItem = (list) => list[Math.floor(Math.random() * list.length)];

function loadSaved() {
try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (!saved) return false;
    for (const key of Object.keys(OPTIONS)) {
    if (OPTIONS[key].some((o) => o.id === saved[key])) prefs[key] = saved[key];
    }
    $("shuffle-each").checked = !!saved.shuffleEach;
    if (saved.playType === "classificata") playType = "classificata";
    return true;
} catch (e) {
    return false;
}
}

function save() {
try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...prefs, shuffleEach: $("shuffle-each").checked, playType }));
} catch (e) { /* il browser non permette di salvare: pazienza */ }
}

function srOnly(text) {
const s = document.createElement("span");
s.className = "sr-only";
s.textContent = text;
return s;
}

function buildChoices() {
for (const key of Object.keys(OPTIONS)) {
    const box = $("choices-" + key);
    OPTIONS[key].forEach((opt) => {
    const label = document.createElement("label");
    label.className = "chip chip-" + key;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = key;
    input.value = opt.id;
    input.addEventListener("change", () => {
        prefs[key] = opt.id;
        settings = activeSettings();
        settingsChanged();
    });
    const face = document.createElement("span");
    face.className = "face";
    if (key === "color") {
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.setProperty("--swatch", opt.value);
        face.append(sw, srOnly(opt.label));
        label.title = opt.label;
    } else if (key === "food") {
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        c.dataset.food = opt.id;
        face.append(c, srOnly(opt.label));
        label.title = opt.label;
    } else {
        face.textContent = opt.label;
    }
    label.append(input, face);
    box.append(label);
    });
}
}

function paintFoodPreviews() {
document.querySelectorAll("canvas[data-food]").forEach((c) => {
    const cx = c.getContext("2d");
    cx.fillStyle = LCD;
    cx.fillRect(0, 0, 32, 32);
    drawSprite(cx, SPRITES[c.dataset.food], 0, 0, 32, pick("color").value);
});
}

function syncChoices() {
for (const key of Object.keys(OPTIONS)) {
    const input = document.querySelector(`input[name="${key}"][value="${settings[key]}"]`);
    if (input) input.checked = true;
}
$("mode-desc").textContent = pick("mode").desc;
$("hud-mode").textContent = (playType === "classificata" ? "Classificata · " : "") + pick("mode").label;
paintFoodPreviews();
updateMenu();
}

// ---------- Tipo di partita e menu sul campo ----------
function rankedMultiplier() {
if (match) return match.multiplier;
return nextMatch ? nextMatch.multiplier : null;
}

// Quanti cibi servono per raggiungere l'obiettivo del proprio rank
function goalFood() {
const m = rankedMultiplier();
return m ? Math.ceil(rankById(myRank).target / m - 1e-9) : null;
}

function tag(text, extra) {
const t = document.createElement("span");
t.className = "draw-tag";
if (extra) t.append(extra);
t.append(text);
return t;
}

function updateMenu() {
if (!$("menu")) return;
const ranked = playType === "classificata";
$("settings-fields").hidden = ranked;
$("menu-ranked").hidden = !ranked;
if (ranked) {
    const rank = rankById(myRank);
    const m = rankedMultiplier();
    $("menu-rank-icon").replaceChildren(rankIcon(rank.id, 40));
    $("menu-rank-name").textContent = rank.name;
    $("menu-mult").textContent = m ? "×" + fmt(m) : "×?";
    $("menu-goal").textContent = m ? "Obiettivo: " + goalFood() + " cibi (" + rank.target + " ÷ difficoltà)" : "Estrazione in corso…";
    const box = $("draw");
    box.replaceChildren();
    const current = match || nextMatch;
    if (current) {
    const st = current.settings;
    const find = (key) => OPTIONS[key].find((o) => o.id === st[key]);
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.setProperty("--swatch", find("color").value);
    const food = document.createElement("canvas");
    food.width = food.height = 32;
    const fc = food.getContext("2d");
    fc.fillStyle = LCD;
    fc.fillRect(0, 0, 32, 32);
    drawSprite(fc, SPRITES[st.food], 0, 0, 32, find("color").value);
    box.append(
        tag(find("mode").label),
        tag("Mappa " + find("size").label.toLowerCase()),
        tag("Velocità " + find("speed").label.toLowerCase()),
        tag(st.count + (st.count === "1" ? " cibo" : " cibi") + " in campo", food),
        tag("Serpente " + find("color").label.toLowerCase(), dot),
    );
    }
}
updateGoal();
}

// Chiede al server la prossima classificata (sempre la stessa finché non si gioca)
async function loadNextMatch() {
if (!sessionStorage.getItem("token")) return;
try {
    nextMatch = await api("/api/snake/ranked/next", { method: "POST" });
} catch (err) {
    nextMatch = null;
    say("Classificata non disponibile: " + err.message);
}
if (playType === "classificata" && state === "idle") {
    settings = activeSettings();
    syncChoices();
    reset();
    draw();
}
updateMenu();
}

// Riga grande sotto il campo: sempre visibile in classificata
function updateGoal() {
const ranked = playType === "classificata";
$("goal").hidden = !ranked;
if (!ranked) return;
const target = goalFood();
const done = score || 0;                  // a fine partita resta il punteggio fatto
$("goal-done").textContent = done;
$("goal-target").textContent = target ?? "?";
$("goal-mult").textContent = rankedMultiplier() ? "×" + fmt(rankedMultiplier()) : "×?";
const reached = target !== null && done >= target;
$("goal").classList.toggle("done", reached);
$("goal-label").textContent = reached ? "Obiettivo raggiunto" : "Obiettivo";
}

function showMenu(show) {
$("menu").hidden = !show;
if (show) $("play").focus({ preventScroll: true });
}

function showResult(title, line, rankId) {
$("menu-result").hidden = false;
$("menu").classList.add("has-result");
$("menu-result").classList.toggle("plain", !rankId);
$("result-icon").replaceChildren(...(rankId ? [rankIcon(rankId, 48)] : []));
$("result-title").textContent = title;
$("result-line").textContent = line;
}

function setPlayType(type) {
if (state !== "idle") return;
playType = type;
const ranked = type === "classificata";
document.querySelector(`input[name="type"][value="${type}"]`).checked = true;
settings = activeSettings();
hideResult();
save();
syncChoices();
reset();
draw();
updateMenu();
say(ranked ? "Classificata: modalità Caos, il resto lo estrae il server." : "Scegli le impostazioni e premi Gioca.");
if (ranked) loadNextMatch();
}

function hideResult() {
$("menu-result").hidden = true;
$("menu").classList.remove("has-result");
}

document.querySelectorAll('input[name="type"]').forEach((i) =>
i.addEventListener("change", () => setPlayType(i.value))
);

function settingsChanged() {
if (state !== "idle") return;
save();
syncChoices();
reset();
draw();
hideResult();
say("Scegli le impostazioni e premi Gioca.");
}

function shuffle() {
for (const key of Object.keys(OPTIONS)) prefs[key] = randomItem(OPTIONS[key]).id;
settings = activeSettings();
save();
syncChoices();
}

$("shuffle").addEventListener("click", () => {
shuffle();
reset();
draw();
hideResult();
say("Nuove impostazioni: " + describe() + ".");
});
$("shuffle-each").addEventListener("change", save);

function describe() {
return pick("mode").label + ", mappa " + pick("size").label.toLowerCase() + ", velocità " + pick("speed").label.toLowerCase();
}

function nearest(key, value) {
return OPTIONS[key].reduce((a, b) => (Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a)).id;
}

// ================= Gioco =================
const canvas = $("board");
const ctx = canvas.getContext("2d");
const BOARD = 432;                       // 432 è divisibile per 12, 18 e 24: caselle intere
const CELL_SHADE = "rgba(44, 54, 34, 0.07)";
const BLOCK = "#55623f";
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEYS = {
ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
w: "up", s: "down", a: "left", d: "right",
};

let rules, cell, snake, dir, nextDirs, foods, blocks, score;
let timer = null;
let state = "idle";                      // idle | running | paused | dying
let snakeVisible = true;

const say = (text) => { $("screen-msg").textContent = text; };
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

function currentRules() {
const mode = settings.mode;
return {
    grid: pick("size").value,
    speed: pick("speed").value,
    count: pick("count").value,
    ink: pick("color").value,
    food: settings.food,
    walls: mode === "muri" || mode === "caos",
    wrap: mode === "senza-bordi" || mode === "caos",
};
}

function reset() {
rules = currentRules();
cell = BOARD / rules.grid;
const mid = Math.floor(rules.grid / 2);
snake = [[mid, mid], [mid - 1, mid], [mid - 2, mid]];
dir = "right";
nextDirs = [];
foods = [];
blocks = [];
score = 0;
snakeVisible = true;
$("score").textContent = 0;
if ($("goal")) updateGoal();
for (let i = 0; i < rules.count; i++) {
    const f = freeCell(2);
    if (f) foods.push(f);
}
canvas.classList.toggle("open", rules.wrap);
}

// Casella libera a caso; con minDist evita di metterla addosso alla testa
function freeCell(minDist) {
const taken = new Set([...snake, ...foods, ...blocks].map(([x, y]) => x + "," + y));
const [hx, hy] = snake[0];
const free = [];
const far = [];
for (let x = 0; x < rules.grid; x++) {
    for (let y = 0; y < rules.grid; y++) {
    if (taken.has(x + "," + y)) continue;
    free.push([x, y]);
    if (Math.abs(x - hx) + Math.abs(y - hy) >= minDist) far.push([x, y]);
    }
}
const list = far.length ? far : free;
return list.length ? randomItem(list) : null;
}

function turn(newDir) {
const last = nextDirs.length ? nextDirs[nextDirs.length - 1] : dir;
const [lx, ly] = DIRS[last], [nx, ny] = DIRS[newDir];
if (lx + nx === 0 && ly + ny === 0) return;   // niente inversione a U
if (newDir === last) return;
if (nextDirs.length < 3) nextDirs.push(newDir);
}

function step() {
if (nextDirs.length) dir = nextDirs.shift();
const [dx, dy] = DIRS[dir];
let hx = snake[0][0] + dx;
let hy = snake[0][1] + dy;

if (rules.wrap) {
    hx = (hx + rules.grid) % rules.grid;
    hy = (hy + rules.grid) % rules.grid;
} else if (hx < 0 || hy < 0 || hx >= rules.grid || hy >= rules.grid) {
    return die();
}

const head = [hx, hy];
const eaten = foods.findIndex((f) => same(f, head));
const body = eaten >= 0 ? snake : snake.slice(0, -1);   // la coda si sposta, salvo quando mangia
if (body.some((s) => same(s, head)) || blocks.some((b) => same(b, head))) return die();

snake.unshift(head);
if (eaten >= 0) {
    score++;
    $("score").textContent = score;
    updateGoal();
    foods.splice(eaten, 1);
    if (rules.walls) {
    const b = freeCell(3);
    if (b) blocks.push(b);
    }
    const f = freeCell(0);
    if (f) foods.push(f);
    if (!foods.length) {                                   // nessuna casella libera: campo pieno
    draw();
    return finish(true);
    }
} else {
    snake.pop();
}
draw();
}

function draw() {
ctx.fillStyle = LCD;
ctx.fillRect(0, 0, BOARD, BOARD);

// Le "celle spente" dello schermo LCD
const g = Math.max(1, Math.round(cell / 12));
ctx.fillStyle = CELL_SHADE;
for (let x = 0; x < rules.grid; x++) {
    for (let y = 0; y < rules.grid; y++) ctx.fillRect(x * cell + g, y * cell + g, cell - 2 * g, cell - 2 * g);
}

blocks.forEach(([x, y]) => drawSprite(ctx, SPRITES.blocco, x * cell, y * cell, cell, BLOCK));
foods.forEach(([x, y]) => drawSprite(ctx, SPRITES[rules.food], x * cell, y * cell, cell, rules.ink));
if (snakeVisible) drawSnake();
}

function drawSnake() {
const g = Math.max(1, Math.round(cell / 10));
ctx.fillStyle = rules.ink;
snake.forEach(([x, y], i) => {
    ctx.fillRect(x * cell + g, y * cell + g, cell - 2 * g, cell - 2 * g);
    if (i === 0) return;
    const [px, py] = snake[i - 1];
    if (Math.abs(px - x) + Math.abs(py - y) !== 1) return;   // salto da un bordo all'altro
    ctx.fillRect(
    Math.min(px, x) * cell + g,
    Math.min(py, y) * cell + g,
    (Math.abs(px - x) + 1) * cell - 2 * g,
    (Math.abs(py - y) + 1) * cell - 2 * g,
    );
});

// Occhi rivolti nella direzione di marcia
const [hx, hy] = snake[0];
const [dx, dy] = DIRS[dir];
const e = Math.max(2, Math.round(cell / 6));
const cx = hx * cell + cell / 2;
const cy = hy * cell + cell / 2;
ctx.fillStyle = LCD;
[1, -1].forEach((side) => {
    const ex = cx + dx * cell * 0.15 - dy * cell * 0.2 * side;
    const ey = cy + dy * cell * 0.15 + dx * cell * 0.2 * side;
    ctx.fillRect(Math.round(ex - e / 2), Math.round(ey - e / 2), e, e);
});
}

function lockSettings(locked) {
$("settings-fields").disabled = locked;
}

function updateButton() {
$("pause").textContent = state === "paused" ? "Riprendi" : "Pausa";
$("pause").classList.toggle("is-idle", state === "idle" || state === "starting");
$("pause").disabled = state === "dying";
$("play").disabled = state === "starting";
$("play").textContent = state === "starting" ? "Attendi…" : "Gioca";
}

const fmt = (n) => String(n).replace(".", ",");

async function start() {
if (state !== "idle") return;
let intro = "In gioco: " + describe() + ".";
if (playType === "classificata") {
    state = "starting";
    lockSettings(true);
    updateButton();
    say("Avvio della partita classificata…");
    try {
    if (!nextMatch) nextMatch = await api("/api/snake/ranked/next", { method: "POST" });
    match = await api("/api/snake/ranked/start", {
        method: "POST",
        body: JSON.stringify({ match_id: nextMatch.match_id }),
    });
    nextMatch = null;
    } catch (err) {
    state = "idle";
    lockSettings(false);
    updateButton();
    say(err.message);
    loadNextMatch();
    return;
    }
    settings = { ...match.settings };
    syncChoices();
    intro = "Classificata, difficoltà ×" + fmt(match.multiplier) + ": servono " + goalFood() + " cibi.";
    if (match.abandoned) {
    intro = "La classificata precedente era rimasta a metà: conta come 0 punti (" + match.abandoned.delta + " rank). " + intro;
    showAccount();
    }
} else if ($("shuffle-each").checked) {
    shuffle();
}
hideResult();
reset();
draw();
showMenu(false);
state = "running";
lockSettings(true);
updateButton();
updateGoal();
say(intro);
timer = setInterval(step, rules.speed);
}

function pause() {
if (state !== "running") return;
clearInterval(timer);
timer = null;
state = "paused";
updateButton();
say("In pausa. Premi Spazio o Riprendi per continuare.");
}

function resume() {
if (state !== "paused") return;
state = "running";
updateButton();
say("In gioco: " + describe() + ".");
timer = setInterval(step, rules.speed);
}

$("play").addEventListener("click", start);

function primaryAction() {
if (state === "idle") start();
else if (state === "running") pause();
else if (state === "paused") resume();
}

function die() {
clearInterval(timer);
timer = null;
state = "dying";
updateButton();
let blinks = 0;
const blink = setInterval(() => {              // il serpente lampeggia, come sui vecchi Nokia
    snakeVisible = !snakeVisible;
    draw();
    if (++blinks >= 6) {
    clearInterval(blink);
    snakeVisible = true;
    draw();
    finish(false);
    }
}, 140);
}

async function finish(won) {
clearInterval(timer);
timer = null;
state = "idle";
lockSettings(false);
updateButton();
best = Math.max(best, score);
$("best").textContent = best;
const head = won ? "Campo pieno, hai vinto con " : "Partita finita: ";
const title = won ? "Campo pieno!" : "Partita finita";

if (match) {
    const current = match;
    try {
    const r = await api("/api/snake/ranked/finish", {
        method: "POST",
        body: JSON.stringify({ match_id: current.match_id, score }),
    });
    const sign = r.delta > 0 ? "+" : "";
    const line = score + " × " + fmt(r.multiplier) + " = " + fmt(r.performance) + ", obiettivo " + r.target
        + ". " + sign + r.delta + " punti rank, ora " + r.rank_points + ".";
    const rankName = rankById(r.rank).name;
    const big = r.promoted ? "Promosso a " + rankName + "!" : r.demoted ? "Sceso a " + rankName : sign + r.delta + " · " + rankName;
    say(head + line);
    match = null;
    showResult(big, line, r.rank);
    loadLeaderboard();
    showAccount();
    } catch (err) {
    match = null;
    say(head + score + " punti. " + err.message);
    showResult(title, score + " punti. " + err.message, null);
    }
    showMenu(true);
    // nel menu compare la prossima estrazione; il campo mostra ancora la partita appena finita
    nextMatch = null;
    try { nextMatch = await api("/api/snake/ranked/next", { method: "POST" }); } catch (e) { /* riproverà a Gioca */ }
    updateMenu();
    return;
}

if (!sessionStorage.getItem("token")) {
    say(head + score + " punti. Accedi per salvarli.");
    showResult(title, score + " punti. Accedi per salvarli e giocare in classificata.", null);
    showMenu(true);
    return;
}
try {
    const result = await api("/api/snake/score", { method: "POST", body: JSON.stringify({ score }) });
    say(head + score + " punti, partita " + result.games_played + " salvata. Record " + result.best + ".");
    showResult(title, score + " punti. Il tuo record è " + result.best + ".", null);
    loadLeaderboard();
    showAccount();
} catch (err) {
    say(head + score + " punti. " + err.message);
    showResult(title, score + " punti. " + err.message, null);
    if (err.message.startsWith("Sessione scaduta")) { sessionStorage.clear(); showAccount(); }
}
showMenu(true);
}

// ================= Comandi =================
document.addEventListener("keydown", (event) => {
const tag = event.target.tagName;
if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
if (tag === "BUTTON" && (key === " " || key === "Enter")) return;   // ci pensa il clic del pulsante

if (KEYS[key]) {
    if (state === "running") { event.preventDefault(); turn(KEYS[key]); }
} else if (key === " ") {
    event.preventDefault();
    primaryAction();
} else if (key === "Escape" || key === "p") {
    if (state === "running") pause();
    else if (state === "paused") resume();
}
});

$("pause").addEventListener("click", primaryAction);
// Scorrimento del dito sul campo
let touchStart = null;
canvas.addEventListener("touchstart", (e) => {
const t = e.changedTouches[0];
touchStart = [t.clientX, t.clientY];
}, { passive: true });
canvas.addEventListener("touchend", (e) => {
if (!touchStart) return;
const t = e.changedTouches[0];
const dx = t.clientX - touchStart[0];
const dy = t.clientY - touchStart[1];
touchStart = null;
if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
    if (state !== "running") primaryAction();
    return;
}
if (state === "running") turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});

// Se si cambia scheda, il gioco va in pausa da solo
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

// ================= Avvio =================
async function init() {
buildChoices();
const hasSaved = loadSaved();
try {
    const cfg = await api("/api/snake/config");
    if (Array.isArray(cfg.ranks) && cfg.ranks.length) RANKS = cfg.ranks;
    if (!hasSaved) {                    // i valori della ConfigMap-snake scelgono le impostazioni iniziali
    prefs.size = nearest("size", cfg.grid_size);
    prefs.speed = nearest("speed", cfg.speed_ms);
    }
} catch (err) {
    say("Impostazioni del server non caricate, uso quelle predefinite.");
}
const loggedIn = !!sessionStorage.getItem("token");
setPlayType(playType === "classificata" && loggedIn ? "classificata" : "normale");
}

init().then(() => { showAccount(); loadLeaderboard(); });
Z