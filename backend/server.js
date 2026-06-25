const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});


// Create table
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT
  );
`);

// Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *",
      [username, password]
    );
    res.json(result.rows[0]);
  } catch {
    res.status(400).json({ error: "User already exists" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE username=$1 AND password=$2",
    [username, password]
  );

  if (result.rows.length > 0) {
    res.json({ message: "Login success ✅" });
  } else {
    res.status(401).json({ error: "Invalid login ❌" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));

app.post("/api/lunch-entry", async (req, res) => {
  const { theatre, date, role, lunchOut, backIn } = req.body;

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS lunch_entries (
        id SERIAL PRIMARY KEY,
        theatre TEXT,
        date TEXT,
        role TEXT,
        lunch_out TEXT,
        back_in TEXT
      )`
    );

    await pool.query(
      `INSERT INTO lunch_entries (theatre, date, role, lunch_out, back_in)
       VALUES ($1, $2, $3, $4, $5)`,
      [theatre, date, role, lunchOut, backIn]
    );

    res.json({ message: "Lunch entry saved ✅" });
  } catch (err) {
    res.status(500).json({ message: "Error saving entry ❌" });
  }
});

const ExcelJS = require("exceljs");

app.get("/export-excel", async (req, res) => {
  const workbook = new ExcelJS.Workbook();

  const theatres = ["T1", "T2", "T3", "T4", "T5"];

  for (const theatre of theatres) {
    const sheet = workbook.addWorksheet(theatre);

    sheet.columns = [
      { header: "Date", key: "date" },
      { header: "Role", key: "role" },
      { header: "Lunch Out", key: "lunch_out" },
      { header: "Back In", key: "back_in" }
    ];

    const result = await pool.query(
      "SELECT * FROM lunch_entries WHERE theatre = $1",
      [theatre]
    );

    result.rows.forEach(row => {
      sheet.addRow({
        date: row.date,
        role: row.role,
        lunch_out: row.lunch_out,
        back_in: row.back_in
      });
    });
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.setHeader("Content-Disposition", "attachment; filename=lunch.xlsx");

  await workbook.xlsx.write(res);
  res.end();
});