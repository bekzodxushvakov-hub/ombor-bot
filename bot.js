const cron = require('node-cron');
const ADMIN_ID = 363167991;
const ExcelJS = require('exceljs');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

// TOKEN (ўзингникини қўй!)
const token = process.env.BOT_TOKEN;

// BOT
const bot = new TelegramBot(token, { polling: true });

// DATABASE
const db = new sqlite3.Database('./ombor.db');

// ===== TABLES =====
db.run(`
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  quantity INTEGER,
  type TEXT,
  person TEXT,
  project TEXT,
  date TEXT
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  manager TEXT
)
`);

// ===== STATE =====
const userState = {};

// ===== START =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Омбор бот ишга тушди!\n/menu ни босинг");
});

// ===== MENU =====
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

// ===== REPORT (ХАТОГА ЧИДАМЛИ) =====
bot.onText(/\/report/, (msg) => {
  const chatId = msg.chat.id;

  db.all(`
    SELECT project, name, SUM(quantity) as total
    FROM items
    WHERE type='out'
    GROUP BY project, name
    ORDER BY project
  `, [], (err, rows) => {

    if (err) {
      console.log("SQL ERROR:", err);
      return bot.sendMessage(chatId, "❌ Хатолик юз берди");
    }

    if (!rows || rows.length === 0) {
      return bot.sendMessage(chatId, "📊 Ҳали маълумот йўқ");
    }

    let result = "📊 Лойиҳалар бўйича:\n\n";
    let currentProject = "";

    rows.forEach(r => {
      if (currentProject !== r.project) {
        currentProject = r.project;
        result += `\n🏗 ${r.project}:\n`;
      }

      result += `  - ${r.name}: ${r.total}\n`;
    });

    bot.sendMessage(chatId, result);
  });
});

// ===== MAIN LOGIC =====
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // ===== BUTTONS =====
  if (msg.chat.id !== ADMIN_ID) {
  return bot.sendMessage(msg.chat.id, "⛔ Сизда рухсат йўқ");
}
  if (text === "📥 Кирим") {
    userState[chatId] = { step: 'name' };
    return bot.sendMessage(chatId, "📦 Товар номи?");
  }

  if (text === "📤 Чиқим") {
    userState[chatId] = { step: 'name_out' };
    return bot.sendMessage(chatId, "📦 Қайси товар?");
  }

  if (text === "📦 Қолдиқ") {
    db.all(`
      SELECT name,
      SUM(CASE WHEN type='in' THEN quantity ELSE -quantity END) as total
      FROM items
      GROUP BY name
    `, [], (err, rows) => {

      if (err) {
        return bot.sendMessage(chatId, "❌ Хатолик");
      }

      if (!rows || rows.length === 0) {
        return bot.sendMessage(chatId, "📦 Омбор бўш");
      }

      let result = "📦 Қолдиқ:\n";
      rows.forEach(r => {
        result += `${r.name}: ${r.total}\n`;
      });

      bot.sendMessage(chatId, result);
    });
    return;
  }

  if (text === "📁 Лойиҳалар") {
    db.all(`SELECT * FROM projects`, [], (err, rows) => {

      if (!rows || rows.length === 0) {
        return bot.sendMessage(chatId, "📭 Лойиҳа йўқ");
      }

      let result = "📋 Лойиҳалар:\n";
      rows.forEach(r => {
        result += `${r.id}. ${r.name} (👤 ${r.manager})\n`;
      });

      bot.sendMessage(chatId, result);
    });
    return;
  }

  if (text === "➕ Лойиҳа қўшиш") {
    userState[chatId] = { step: 'project_name' };
    return bot.sendMessage(chatId, "📁 Лойиҳа номи?");
  }

  // ===== FORM =====
  if (!userState[chatId]) return;

  const state = userState[chatId];

  // ---- PROJECT ----
  if (state.step === 'project_name') {
    state.name = text;
    state.step = 'project_manager';
    return bot.sendMessage(chatId, "👤 Жавобгар ким?");
  }

  if (state.step === 'project_manager') {
    state.manager = text;

    db.run(
      `INSERT INTO projects (name, manager) VALUES (?, ?)`,
      [state.name, state.manager]
    );

    bot.sendMessage(chatId, "✅ Лойиҳа сақланди!");
    delete userState[chatId];
    return;
  }

  // ---- KIRIM ----
  if (state.step === 'name') {
    state.name = text;
    state.step = 'quantity';
    return bot.sendMessage(chatId, "🔢 Миқдор?");
  }

  if (state.step === 'quantity') {
    const qty = parseInt(text);
    if (isNaN(qty)) return bot.sendMessage(chatId, "❗ Сон киритинг");

    state.quantity = qty;
    state.step = 'person';
    return bot.sendMessage(chatId, "👤 Ким олиб келди?");
  }

  if (state.step === 'person') {
    state.person = text;

    db.run(
      `INSERT INTO items (name, quantity, type, person, project, date) VALUES (?, ?, ?, ?, ?, ?)`,
      [state.name, state.quantity, 'in', state.person, '-', new Date().toISOString()]
    );

    bot.sendMessage(chatId, "✅ Кирим сақланди!");
    delete userState[chatId];
    return;
  }

  // ---- CHIQIM ----
  if (state.step === 'name_out') {
    state.name = text;
    state.step = 'quantity_out';
    return bot.sendMessage(chatId, "🔢 Қанча чиқди?");
  }

  if (state.step === 'quantity_out') {
    const qty = parseInt(text);
    if (isNaN(qty)) return bot.sendMessage(chatId, "❗ Сон киритинг");

    state.quantity = qty;
    state.step = 'person_out';
    return bot.sendMessage(chatId, "👤 Ким олди?");
  }

  if (state.step === 'person_out') {
    state.person = text;
    state.step = 'project';
    return bot.sendMessage(chatId, "🏗 Қайси лойиҳа?");
  }

  if (state.step === 'project') {
    state.project = text;

    db.run(
      `INSERT INTO items (name, quantity, type, person, project, date) VALUES (?, ?, ?, ?, ?, ?)`,
      [state.name, state.quantity, 'out', state.person, state.project, new Date().toISOString()]
    );

    bot.sendMessage(chatId, "📤 Чиқим сақланди!");
    delete userState[chatId];
    return;
  }
});
// EXCEL EXPORT
const ExcelJS = require('exceljs');

bot.onText(/\/excel/, async (msg) => {
  const chatId = msg.chat.id;

  db.all(`SELECT * FROM items`, [], async (err, rows) => {

    if (err) {
      console.log(err);
      return bot.sendMessage(chatId, "❌ SQL хатолик");
    }

    if (!rows || rows.length === 0) {
      return bot.sendMessage(chatId, "📊 Маълумот йўқ");
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Ombor');

      sheet.columns = [
        { header: 'ID', key: 'id' },
        { header: 'Tovar', key: 'name' },
        { header: 'Miqdor', key: 'quantity' },
        { header: 'Type', key: 'type' },
        { header: 'Kim', key: 'person' },
        { header: 'Loyiha', key: 'project' },
        { header: 'Sana', key: 'date' }
      ];

      rows.forEach(r => sheet.addRow(r));

      const filePath = 'hisobot.xlsx';

      await workbook.xlsx.writeFile(filePath);

      bot.sendDocument(chatId, filePath);

    } catch (e) {
      console.log(e);
      bot.sendMessage(chatId, "❌ Excel хатолик");
    }

  });
});
// DAILY REPORT (18:00)
cron.schedule('0 18 * * *', () => {

  const chatId = ADMIN_ID;

  // Кирим
  db.get(`
    SELECT SUM(quantity) as total FROM items WHERE type='in'
  `, [], (err, inData) => {

    // Чиқим
    db.get(`
      SELECT SUM(quantity) as total FROM items WHERE type='out'
    `, [], (err, outData) => {

      // Лойиҳа бўйича
      db.all(`
        SELECT project, SUM(quantity) as total
        FROM items
        WHERE type='out'
        GROUP BY project
      `, [], (err, rows) => {

        let text = "📊 Бугунги ҳисобот:\n\n";

        text += `📥 Кирим: ${inData?.total || 0}\n`;
        text += `📤 Чиқим: ${outData?.total || 0}\n\n`;

        if (rows && rows.length > 0) {
          text += "🏗 Лойиҳалар:\n";
          rows.forEach(r => {
            text += `- ${r.project}: ${r.total}\n`;
          });
        }

        bot.sendMessage(chatId, text);
      });
    });
  });

});
// ANALYTICS
bot.onText(/\/analytics/, (msg) => {
  const chatId = msg.chat.id;

  // ENG KO‘P TOVAR
  db.get(`
    SELECT name, SUM(quantity) as total
    FROM items
    WHERE type='out'
    GROUP BY name
    ORDER BY total DESC
    LIMIT 1
  `, [], (err, topItem) => {

    // ENG KO‘P LOYIHA
    db.get(`
      SELECT project, SUM(quantity) as total
      FROM items
      WHERE type='out'
      GROUP BY project
      ORDER BY total DESC
      LIMIT 1
    `, [], (err, topProject) => {

      let text = "📊 Аналитика:\n\n";

      if (topItem) {
        text += `🔥 Энг кўп кетган товар:\n${topItem.name} — ${topItem.total}\n\n`;
      }

      if (topProject) {
        text += `🏗 Энг кўп сарф қилган лойиҳа:\n${topProject.project} — ${topProject.total}\n`;
      }

      bot.sendMessage(chatId, text);
    });
  });
});