// Смоук-тест единого HTML-приложения «Тайный Санта» в jsdom.
// Проверяет: рендер экранов, демо-данные, алгоритм жеребьёвки,
// исключения, статусы, секретность назначений, валидацию анкеты.
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const html = readFileSync(new URL("../public/santa.html", import.meta.url), "utf8");
const vc = new VirtualConsole();
vc.on("error", (...a) => console.error("[page]", ...a));
vc.on("jsdomError", () => {}); // canvas not implemented in jsdom — ожидаемо

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
window.fetch = () => Promise.reject(new Error("offline-test"));
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function check(name, cond) {
  if (cond) console.log("  ok:", name);
  else { failed++; console.error("  FAIL:", name); }
}
const text = () => window.document.querySelector("#app").textContent;

await tick(400);
const ts = window.__ts;
check("приложение загрузилось (__ts)", !!ts);
check("главная отрендерена", text().includes("Тайный Санта") && text().includes("Создать игру"));

// мастер создания
ts.go("#/create"); await tick();
check("шаг 1: подпись названия", text().includes("Название увидят ваши игроки"));
check("шаг 1: форматы", text().includes("Офлайн") && text().includes("Онлайн"));
check("шаг 1: подпись даты жеребьёвки", text().includes("Когда все игроки соберутся"));
window.document.querySelector('[data-action="wiz-next"]').click(); await tick();
check("шаг 1: пустое название не пропускает", window.document.querySelector("#wName").closest(".field").classList.contains("invalid"));
window.document.querySelector("#wName").value = "Тестовая игра";
window.document.querySelector('[data-action="wiz-next"]').click(); await tick();
check("шаг 2: оформление", text().includes("Это добавит игре индивидуальности") && text().includes("Выберите Санту"));
window.document.querySelector('[data-action="wiz-next"]').click(); await tick();
check("шаг 3: сообщение и приглашения", text().includes("Сообщение игрокам") && text().includes("Пока никто не выбран") && text().includes("Игроки (0)"));
check("шаг 3: предзаполненное сообщение", window.document.querySelector("#rte").textContent.includes("Скорее регистрируйтесь"));

// демо-игра
ts.seedDemo(); await tick(200);
const g = ts.state.games.find((x) => x.demo);
check("демо-игра создана", !!g && g.players.length === 6);
check("панель организатора", text().includes("Провести жеребьёвку") && text().includes("Ссылка-приглашение"));
check("сводка статусов", text().includes("Ждёт жеребьёвки") && text().includes("Регистрация"));
check("исключение пары показано", text().includes("Аня Смирнова ⇄ Борис Орлов"));

// страница приглашения
ts.go("#/invite/" + g.id); await tick();
check("приглашение: что за игра", text().includes("Что это вообще за игра"));
check("приглашение: правила", text().includes("Какие правила и как играть"));
check("приглашение: кнопка Участвовать", text().includes("Участвовать"));

// анкета: валидация < 4 символов
const vika = g.players.find((p) => p.status === "registration");
let threw = false;
try { await ts.saveProfile(g.id, vika.id, { wish: "abc", anti: "", address: "" }); } catch (e) { threw = /4 символов/.test(e.message); }
check("анкета: валидация мин. 4 символов", threw);
await ts.saveProfile(g.id, vika.id, { wish: "Тёплые варежки", anti: "Шампунь", address: "" });
check("анкета сохранена -> Ждёт жеребьёвки", ts.state.games.find((x) => x.id === g.id).players.find((p) => p.id === vika.id).status === "waiting");

// жеребьёвка
const gg = ts.state.games.find((x) => x.id === g.id);
const map = await ts.runDraw(gg.id);
const j = gg.players.filter((p) => p.status !== "invited");
check("жеребьёвка: все назначены", j.every((p) => map[p.id]));
check("жеребьёвка: никто не дарит сам себе", Object.entries(map).every(([a, b]) => a !== b));
check("жеребьёвка: без повторов", new Set(Object.values(map)).size === j.length);
const anna = gg.players.find((p) => p.name.startsWith("Аня"));
const boris = gg.players.find((p) => p.name.startsWith("Борис"));
check("жеребьёвка: исключённая пара соблюдена", !(map[anna.id] === boris.id || map[boris.id] === anna.id));
check("после жеребьёвки все «Покупает подарок»", j.every((p) => p.status === "buying"));

// кабинет игрока: видит только своё назначение
const giver = anna;
const recipient = gg.players.find((p) => p.id === map[giver.id]);
ts.go("#/player/" + gg.id + "/" + giver.id); await tick();
check("кабинет: «Ты даришь подарок»", text().includes("Ты даришь подарок:"));
check("кабинет: имя получателя видно", text().includes(recipient.name));
const others = Object.entries(map).filter(([a]) => a !== giver.id).map(([, b]) => gg.players.find((p) => p.id === b).name);
check("кабинет: чужие назначения скрыты", others.filter((n) => n !== recipient.name && n !== giver.name).every((n) => !text().includes(n)));
check("кабинет: кнопка «Подарок готов 🎁»", text().includes("Подарок готов 🎁"));
ts.go("#/game/" + gg.id); await tick();
check("панель организатора не раскрывает пары", !text().includes("Ты даришь подарок") && text().includes("Назначения скрыты даже от организатора"));

// готов подарить
await ts.markReady(gg.id, giver.id, true); await tick();
check("статус «Готов подарить»", gg.players.find((p) => p.id === giver.id).status === "ready");
ts.go("#/player/" + gg.id + "/" + giver.id); ts.render(); await tick();
check("кабинет: экран готовности", text().includes("Подарок готов — ты лучший Санта"));

// приглашение после жеребьёвки закрыто
ts.go("#/invite/" + gg.id); await tick();
check("набор после жеребьёвки закрыт", text().includes("Жеребьёвка уже проведена"));

//localStorage
const stored = JSON.parse(window.localStorage.getItem("ts_state_v1"));
check("состояние в localStorage", stored && stored.data.games.length === 2 && stored.updatedAt > 0);

console.log(failed ? `\nSMOKE FAILED: ${failed}` : "\nSMOKE OK ✅");
process.exit(failed ? 1 : 0);
