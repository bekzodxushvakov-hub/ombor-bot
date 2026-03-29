const express = require('express');
const Database = require('better-sqlite3');
const session = require('express-session');

const app = express();
const PORT = 3000;

const PASSWORD = "8504";

const db = new Database('ombor.db');

// POST ишлаши учун
app.use(express.urlencoded({ extended: true }));

// SESSION
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

// ===== LOGIN PAGE =====
app.get('/login', (req, res) => {
  res.send(`
    <html>
    <head>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="container mt-5">

      <h3>🔐 Кириш</h3>

      <form method="POST" action="/login">
        <input type="password" name="password" class="form-control mb-2" placeholder="Пароль" />
        <button class="btn btn-primary">Кириш</button>
      </form>

    </body>
    </html>
  `);
});

// ===== LOGIN LOGIC =====
app.post('/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    req.session.auth = true;
    res.redirect('/');
  } else {
    res.send("❌ Нотўғри пароль");
  }
});

// ===== LOGOUT =====
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ===== AUTH MIDDLEWARE =====
function checkAuth(req, res, next) {
  if (!req.session.auth) {
    return res.redirect('/login');
  }
  next();
}

// ===== DELETE =====
app.get('/delete/:id', checkAuth, (req, res) => {
  const id = req.params.id;

  db.run(`DELETE FROM items WHERE id=?`, [id], () => {
    res.redirect('/');
  });
});

// ===== EDIT PAGE =====
app.get('/edit/:id', checkAuth, (req, res) => {
  const id = req.params.id;

  db.get(`SELECT * FROM items WHERE id=?`, [id], (err, r) => {

    if (!r) {
      return res.send("Маълумот топилмади");
    }

    let html = `
    <html>
    <head>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="container mt-5">

    <h3>✏️ Таҳрирлаш</h3>

    <form method="POST" action="/update/${r.id}">
      <input name="name" value="${r.name}" class="form-control mb-2" />
      <input name="quantity" value="${r.quantity}" class="form-control mb-2" />
      <input name="person" value="${r.person}" class="form-control mb-2" />
      <input name="project" value="${r.project}" class="form-control mb-2" />

      <button class="btn btn-success">Сақлаш</button>
      <a href="/" class="btn btn-secondary">Орқага</a>
    </form>

    </body>
    </html>
    `;

    res.send(html);
  });
});

// ===== UPDATE =====
app.post('/update/:id', checkAuth, (req, res) => {
  const id = req.params.id;

  const { name, quantity, person, project } = req.body;

  db.run(
    `UPDATE items SET name=?, quantity=?, person=?, project=? WHERE id=?`,
    [name, quantity, person, project, id],
    () => {
      res.redirect('/');
    }
  );
});

// ===== MAIN PAGE =====
app.get('/', checkAuth, (req, res) => {

  const project = req.query.project || '';
  const search = req.query.search || '';

  let query = "SELECT * FROM items WHERE 1=1";

  if (project) {
    query += ` AND project LIKE '%${project}%'`;
  }

  if (search) {
    query += ` AND name LIKE '%${search}%'`;
  }

  db.all(query, [], (err, rows) => {

    if (err) {
      console.log(err);
      return res.send("❌ База хатолик");
    }

    let html = `
<html>
<head>
  <title>Ombor</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>

<body class="bg-light">

<div class="container mt-5">

  <div class="d-flex justify-content-between mb-3">
    <h3>📦 Омбор бошқарув панели</h3>
    <a href="/logout" class="btn btn-danger">Чиқиш</a>
  </div>

  <div class="card shadow">
    <div class="card-body">

      <!-- FILTER -->
      <form method="GET" class="row g-2 mb-3">
        <div class="col-md-4">
          <input type="text" name="project" placeholder="🏗 Лойиҳа" value="${project}" class="form-control">
        </div>
        <div class="col-md-4">
          <input type="text" name="search" placeholder="🔍 Товар қидириш" value="${search}" class="form-control">
        </div>
        <div class="col-md-4">
          <button class="btn btn-success w-100">Фильтр</button>
        </div>
      </form>

      <table class="table table-hover">
        <thead class="table-dark">
          <tr>
            <th>ID</th>
            <th>Товар</th>
            <th>Миқдор</th>
            <th>Тип</th>
            <th>Ким</th>
            <th>Лойиҳа</th>
            <th>Сана</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
`;

    if (!rows || rows.length === 0) {
      html += `<tr><td colspan="8" class="text-center">Маълумот топилмади</td></tr>`;
    } else {
      rows.forEach(r => {

        let typeBadge = r.type === 'in'
          ? `<span class="badge bg-success">Кирим</span>`
          : `<span class="badge bg-danger">Чиқим</span>`;

        html += `
        <tr>
          <td>${r.id}</td>
          <td><b>${r.name}</b></td>
          <td>${r.quantity}</td>
          <td>${typeBadge}</td>
          <td>${r.person}</td>
          <td>${r.project}</td>
          <td>${r.date}</td>
          <td>
            <a href="/edit/${r.id}" class="btn btn-warning btn-sm">✏️</a>
            <a href="/delete/${r.id}" class="btn btn-danger btn-sm"
               onclick="return confirm('Ростдан ҳам ўчирмоқчимисиз?')">
               🗑
            </a>
          </td>
        </tr>
        `;
      });
    }

    html += `
        </tbody>
      </table>

    </div>
  </div>

</div>

</body>
</html>
`;

    res.send(html);
  });

});

app.listen(PORT, '172.16.20.34', () => {
  console.log(`🚀 Server ishlayapti: http://localhost:${3000}`);
});