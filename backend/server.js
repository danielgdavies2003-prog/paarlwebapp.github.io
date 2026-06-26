const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ✅ DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ INIT TABLES
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      is_admin BOOLEAN DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lunch_entries (
      id SERIAL PRIMARY KEY,
      username TEXT,
      theatre TEXT,
      date TEXT,
      role TEXT,
      lunch_out TEXT,
      back_in TEXT
    );
  `);

  console.log("DB ready ✅");
}
initDB();

// ✅ ROOT
app.get("/", (req, res) => res.send("Backend ✅"));


// ✅ REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    await pool.query(
      "INSERT INTO users(username, password) VALUES($1, $2)",
      [username, password]
    );

    res.json({ message: "Registered ✅" });

  } catch {
    res.status(400).json({ error: "User exists ❌" });
  }
});


// ✅ LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE username=$1 AND password=$2",
    [username, password]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: "Invalid ❌" });
  }

  const user = result.rows[0];

  res.json({
    username: user.username,
    isAdmin: user.is_admin
  });
});


// ✅ SAVE ENTRY
app.post("/api/lunch-entry", async (req, res) => {
  const { username, theatre, date, role, lunchOut, backIn } = req.body;

  await pool.query(
    `INSERT INTO lunch_entries(username, theatre, date, role, lunch_out, back_in)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [username, theatre, date, role, lunchOut, backIn]
  );

  res.json({ message: "Saved ✅" });
});


// ✅ ADMIN ONLY EXCEL
app.get("/export-excel", async (req, res) => {
  const { username } = req.query;

  const userCheck = await pool.query(
    "SELECT is_admin FROM users WHERE username=$1",
    [username]
  );

  if (!userCheck.rows.length || !userCheck.rows[0].is_admin) {
    return res.status(403).send("Forbidden ❌");
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Entries");

  sheet.columns = [
    { header: "User", key: "username" },
    { header: "Date", key: "date" },
    { header: "Theatre", key: "theatre" },
    { header: "Role", key: "role" },
    { header: "Lunch Out", key: "lunch_out" },
    { header: "Lunch In", key: "back_in" }
  ];

  const result = await pool.query("SELECT * FROM lunch_entries");

  result.rows.forEach(r => sheet.addRow(r));

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=lunch.xlsx"
  );

  await workbook.xlsx.write(res);
  res.end();
});


app.listen(PORT, () =>
  console.log("Running on port " + PORT)
);