const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// ✅ Use Render PORT
const PORT = process.env.PORT || 3000;

// ✅ Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ TEST ROUTE
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});


// ✅ Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT
      )
    `);

    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, password]
    );

    res.json({ message: "Registered ✅" });

  } catch (err) {
    res.status(400).json({ error: "User exists ❌" });
  }
});


// ✅ Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE username=$1 AND password=$2",
    [username, password]
  );

  if (result.rows.length > 0) {
    res.json({ message: "Login success ✅" });
  } else {
    res.status(401).json({ error: "Invalid ❌" });
  }
});


// ✅ Save lunch
app.post("/api/lunch-entry", async (req, res) => {
  const { username, theatre, date, role, lunchOut, backIn } = req.body;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lunch_entries (
        id SERIAL PRIMARY KEY,
        username TEXT,
        theatre TEXT,
        date TEXT,
        role TEXT,
        lunch_out TEXT,
        back_in TEXT
      )
    `);

    await pool.query(
      `INSERT INTO lunch_entries 
      (username, theatre, date, role, lunch_out, back_in)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [username, theatre, date, role, lunchOut, backIn]
    );

    res.json({ message: "Saved ✅" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error ❌" });
  }
});


// ✅ Excel Export
app.get("/export-excel", async (req, res) => {
  try {
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

    result.rows.forEach(row => {
      sheet.addRow(row);
    });

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

  } catch (err) {
    console.error(err);
    res.status(500).send("Excel error ❌");
  }
});


// ✅ START SERVER (IMPORTANT)
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
