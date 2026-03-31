const cron = require('node-cron');
const ExcelJS = require('exceljs');
const TelegramBot = require('node-telegram-bot-api');
const Database = require('better-sqlite3');

const token = process.env.BOT_TOKEN;
const ADMIN_ID = 363167991;

const bot = new TelegramBot(token, { polling: true });

// DATABASE
const db = new Database('ombor.db');

// TABLES
db.prepare(`
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  quantity INTEGER,
  type TEXT,
  person TEXT,
  project TEXT,
  date TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  manager TEXT
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER UNIQUE,
  name TEXT,
  role TEXT
)
`).run();

// ADMIN qo‘shish
db.prepare(`
INSERT OR IGNORE INTO users (chat_id, name, role)
VALUES (?, ?, 'admin')
`).run(ADMIN_ID, 'Admin');

// USER FUNCTION
function getUser(chatId) {
  return db.prepare(`SELECT * FROM users WHERE chat_id=?`).get(chatId);
}

// STATE
const userState = {};

// START
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Омбор бот ишлаяпти!\n/menu ни босинг");
});

// MENU
bot.onText(/\/menu/, (msg) => {
  bot.sendMessage(msg.chat.id, "Танланг:", {
    reply_markup: {
      keyboard: [
        ["📥 Кирим", "📤 Чиқим"],
        ["📦 Қолдиқ"],
        ["📁 Лойиҳалар", "➕ Лойиҳа қўшиш"]
      ],
      resize_keyboard: true
    }
  });
});

// ADD USER (admin only)
bot.onText(/\/adduser (.+)/, (msg, match) => {
  const admin = getUser(msg.chat.id);

  if (!admin || admin.role !== 'admin') {
    return bot.sendMessage(msg.chat.id, "⛔ Фақат админ");
  }

  const newId = parseInt(match[1]);

  db.prepare(`
    INSERT OR IGNORE INTO users (chat_id, role)
    VALUES (?, 'worker')
  `).run(newId);

  bot.sendMessage(msg.chat.id, "✅ Ходим қўшилди");
});

// REPORT
bot.onText(/\/report/, (msg) => {
  const rows = db.prepare(`
    SELECT project, name, SUM(quantity) as total
    FROM items
    WHERE type='out'
    GROUP BY project, name
  `).all();

  if (!rows.length) return bot.sendMessage(msg.chat.id, "📊 Йўқ");

  let text = "📊 Лойиҳалар:\n\n";
  let current = "";

  rows.forEach(r => {
    if (current !== r.project) {
      current = r.project;
      text += `\n🏗 ${r.project}:\n`;
    }
    text += `- ${r.name}: ${r.total}\n`;
  });

  bot.sendMessage(msg.chat.id, text);
});

// MAIN
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  const user = getUser(chatId);
  if (!user) return bot.sendMessage(chatId, "⛔ Рухсат йўқ");

  // BUTTONS
  if (text === "📥 Кирим") {
    userState[chatId] = { step: 'name' };
    return bot.sendMessage(chatId, "📦 Товар номи?");
  }

  if (text === "📤 Чиқим") {
    userState[chatId] = { step: 'name_out' };
    return bot.sendMessage(chatId, "📦 Қайси товар?");
  }

  if (text === "📦 Қолдиқ") {
    const rows = db.prepare(`
      SELECT name,
      SUM(CASE WHEN type='in' THEN quantity ELSE -quantity END) as total
      FROM items GROUP BY name
    `).all();

    let text = "📦 Қолдиқ:\n";
    rows.forEach(r => text += `${r.name}: ${r.total}\n`);

    return bot.sendMessage(chatId, text);
  }

  if (text === "📁 Лойиҳалар") {
    const rows = db.prepare(`SELECT * FROM projects`).all();

    let text = "📋 Лойиҳалар:\n";
    rows.forEach(r => text += `${r.name} (${r.manager})\n`);

    return bot.sendMessage(chatId, text);
  }

  if (text === "➕ Лойиҳа қўшиш") {
    userState[chatId] = { step: 'project_name' };
    return bot.sendMessage(chatId, "📁 Номи?");
  }

  if (!userState[chatId]) return;
  const state = userState[chatId];

  // PROJECT
  if (state.step === 'project_name') {
    state.name = text;
    state.step = 'project_manager';
    return bot.sendMessage(chatId, "👤 Ким?");
  }

  if (state.step === 'project_manager') {
    db.prepare(`INSERT INTO projects (name, manager) VALUES (?, ?)`)
      .run(state.name, text);

    delete userState[chatId];
    return bot.sendMessage(chatId, "✅ Сақланди");
  }

  // KIRIM
  if (state.step === 'name') {
    state.name = text;
    state.step = 'quantity';
    return bot.sendMessage(chatId, "🔢 Миқдор?");
  }

  if (state.step === 'quantity') {
    state.quantity = parseInt(text);
    state.step = 'person';
    return bot.sendMessage(chatId, "👤 Ким?");
  }

  if (state.step === 'person') {
    db.prepare(`
      INSERT INTO items (name, quantity, type, person, project, date)
      VALUES (?, ?, 'in', ?, '-', ?)
    `).run(state.name, state.quantity, text, new Date().toISOString());

    delete userState[chatId];
    return bot.sendMessage(chatId, "✅ Кирим сақланди");
  }

  // CHIQIM
  if (state.step === 'name_out') {
    state.name = text;
    state.step = 'quantity_out';
    return bot.sendMessage(chatId, "🔢 Миқдор?");
  }

  if (state.step === 'quantity_out') {
    state.quantity = parseInt(text);
    state.step = 'person_out';
    return bot.sendMessage(chatId, "👤 Ким?");
  }

  if (state.step === 'person_out') {
    state.person = text;
    state.step = 'project';
    return bot.sendMessage(chatId, "🏗 Лойиҳа?");
  }

  if (state.step === 'project') {
    db.prepare(`
      INSERT INTO items (name, quantity, type, person, project, date)
      VALUES (?, ?, 'out', ?, ?, ?)
    `).run(state.name, state.quantity, state.person, text, new Date().toISOString());

    delete userState[chatId];
    return bot.sendMessage(chatId, "📤 Чиқим сақланди");
  }
});

// DAILY REPORT
cron.schedule('0 18 * * *', () => {
  const inData = db.prepare(`SELECT SUM(quantity) as total FROM items WHERE type='in'`).get();
  const outData = db.prepare(`SELECT SUM(quantity) as total FROM items WHERE type='out'`).get();

  let text = `📊 Ҳисобот:\n📥 ${inData.total || 0}\n📤 ${outData.total || 0}`;
  bot.sendMessage(ADMIN_ID, text);
});

console.log("🤖 Bot ишлаяпти...");