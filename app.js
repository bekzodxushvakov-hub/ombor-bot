const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const TelegramBot = require('node-telegram-bot-api');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== BOT TOKEN =====
const TOKEN = "8773337414:AAE-MFcL4P_PjqpTfkvW4iIc5-g1kV5Yl7g";

// ===== PASSWORD =====
const PASSWORD = "8504";

// ===== DATABASE =====
const db = new sqlite3.Database('./ombor.db');

// ===== BOT =====
const bot = new TelegramBot(TOKEN, { polling: true });

// ===== MIDDLEWARE =====
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

// ===== LOGIN =====
app.get('/login', (req, res) => {
  res.send(`
    <form method="POST" action="/login" style="margin:50px">
      <h3>🔐 Login</h3>
      <input type="password" name="password" />
      <button>Kirish</button>
    </form>
  `);
});

app.post('/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    req.session.auth = true;
    res.redirect('/');
  } else {
    res.send("Xato пароль");
  }
});

// ===== AUTH =====
function checkAuth(req, res, next) {
  if (!req.session.auth) return res.redirect('/login');
  next();
}

// ===== MAIN PAGE =====
app.get('/', checkAuth, (req, res) => {
  db.all(`SELECT * FROM items`, [], (err, rows) => {
    let html = "<h1>Ombor</h1><ul>";
    rows.forEach(r => {
      html += `<li>${r.name} - ${r.quantity}</li>`;
    });
    html += "</ul>";
    res.send(html);
  });
});

// ===== BOT START =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Bot ishlayapti 🚀");
});

// ===== SERVER =====
app.listen(PORT, () => {
  console.log("Server ishlayapti");
});