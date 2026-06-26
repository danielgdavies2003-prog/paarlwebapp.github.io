const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Create / update database tables
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
    `);

    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lunch_entries (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        theatre TEXT NOT NULL,
        date TEXT NOT NULL,
        role TEXT NOT NULL,
        lunch_out TEXT NOT NULL,
        back_in TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Database ready ✅");
  } catch (err) {
    console.error("Database setup failed ❌", err);
  }
}

// Home route
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

// Register user
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required ❌" });
  }

  try {
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, password]
    );

    res.json({ message: "Registered successfully ✅" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(400).json({ error: "User already exists ❌" });
  }
});

// Login user
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required ❌" });
  }

  try {
    const result = await pool.query(
      "SELECT username, is_admin FROM users WHERE username = $1 AND password = $2",
      [username, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid login ❌" });
    }

    const user = result.rows[0];

    res.json({
      message: "Login successful ✅",
      username: user.username,
      isAdmin: user.is_admin,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error ❌" });
  }
});

// Save lunch entry
app.post("/api/lunch-entry", async (req, res) => {
  const { username, theatre, date, role, lunchOut, backIn } = req.body;

  if (!username || !theatre || !date || !role || !lunchOut || !backIn) {
    return res.status(400).json({
      message: "All fields are required ❌",
    });
  }

  try {
    await pool.query(
      `INSERT INTO lunch_entries 
      (username, theatre, date, role, lunch_out, back_in)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [username, theatre, date, role, lunchOut, backIn]
    );

    res.json({ message: "Lunch entry saved ✅" });
  } catch (err) {
    console.error("Save lunch error:", err);
    res.status(500).json({ message: "Error saving lunch entry ❌" });
  }
});

// Get entries for one user
app.get("/api/my-entries/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM lunch_entries 
       WHERE username = $1 
       ORDER BY date DESC, created_at DESC`,
      [username]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch entries error:", err);
    res.status(500).json({ error: "Error fetching entries ❌" });
  }
});

// Admin check route
app.get("/api/admin-check", async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ isAdmin: false });
  }

  try {
    const result = await pool.query(
      "SELECT is_admin FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({ isAdmin: false });
    }

    res.json({ isAdmin: result.rows[0].is_admin });
  } catch (err) {
    console.error("Admin check error:", err);
    res.status(500).json({ isAdmin: false });
  }
});

// TEMP ADMIN SETUP ROUTE
// Use this once to make yourself admin.
// After it works, remove this route for better security.
app.get("/make-admin", async (req, res) => {
  const { username, key } = req.query;

  const ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY;

  if (!ADMIN_SETUP_KEY || key !== ADMIN_SETUP_KEY) {
    return res.status(403).send("Forbidden ❌");
  }

  if (!username) {
    return res.status(400).send("Username required ❌");
  }

  try {
    const result = await pool.query(
      "UPDATE users SET is_admin = true WHERE username = $1 RETURNING username, is_admin",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("User not found ❌. Register first.");
    }

    res.send(`${username} is now admin ✅`);
  } catch (err) {
    console.error("Make admin error:", err);
    res.status(500).send("Error making admin ❌");
  }
});

// Admin-only Excel export
app.get("/export-excel", async (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(403).send("Forbidden ❌");
  }

  try {
    const adminCheck = await pool.query(
      "SELECT is_admin FROM users WHERE username = $1",
      [username]
    );

    if (
      adminCheck.rows.length === 0 ||
      adminCheck.rows[0].is_admin !== true
    ) {
      return res.status(403).send("Forbidden ❌");
    }

    const workbook = new ExcelJS.Workbook();

    const theatres = ["T1", "T2", "T3", "T4", "T5"];

    for (const theatre of theatres) {
      const sheet = workbook.addWorksheet(theatre);

      sheet.columns = [
        { header: "User", key: "username", width: 20 },
        { header: "Date", key: "date", width: 15 },
        { header: "Theatre", key: "theatre", width: 12 },
        { header: "Role", key: "role", width: 30 },
        { header: "Lunch Out", key: "lunch_out", width: 15 },
        { header: "Lunch In", key: "back_in", width: 15 },
      ];

      const result = await pool.query(
        `SELECT username, date, theatre, role, lunch_out, back_in
         FROM lunch_entries
         WHERE theatre = $1
         ORDER BY date ASC, created_at ASC`,
        [theatre]
      );

      result.rows.forEach((row) => {
        sheet.addRow(row);
      });

      sheet.getRow(1).font = { bold: true };
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=TheatreLunchEntries.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Excel export error:", err);
    res.status(500).send("Excel export failed ❌");
  }
});

// Start backend only after DB setup
initDB().then(() => {
  app.listen(PORT, () => {
    console.log("Server running on port " + PORT + " ✅");
  });
});