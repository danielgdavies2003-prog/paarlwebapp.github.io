const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.get("/", (req,res)=>res.send("Running ✅"));

// tables
pool.query(`
CREATE TABLE IF NOT EXISTS users(
id SERIAL PRIMARY KEY,
username TEXT UNIQUE,
password TEXT
)`);

pool.query(`
CREATE TABLE IF NOT EXISTS lunch_entries(
id SERIAL PRIMARY KEY,
username TEXT,
theatre TEXT,
date TEXT,
role TEXT,
lunch_out TEXT,
back_in TEXT
)`);

// register
app.post("/register", async (req,res)=>{
  try{
    const r=await pool.query(
      "INSERT INTO users(username,password) VALUES($1,$2)",
      [req.body.username, req.body.password]
    );
    res.json(r.rows);
  }catch{
    res.status(400).json({error:"User exists"});
  }
});

// login
app.post("/login", async (req,res)=>{
  const r=await pool.query(
    "SELECT * FROM users WHERE username=$1 AND password=$2",
    [req.body.username, req.body.password]
  );

  if(r.rows.length) res.json({ok:true});
  else res.status(401).json({error:"Invalid"});
});

// save
app.post("/api/lunch-entry", async (req,res)=>{
  const {username,theatre,date,role,lunchOut,backIn}=req.body;

  await pool.query(
    `INSERT INTO lunch_entries(username,theatre,date,role,lunch_out,back_in)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [username,theatre,date,role,lunchOut,backIn]
  );

  res.json({message:"Saved ✅"});
});

// get user entries
app.get("/api/my-entries/:user", async (req,res)=>{
  const r=await pool.query(
    "SELECT * FROM lunch_entries WHERE username=$1 ORDER BY date DESC",
    [req.params.user]
  );
  res.json(r.rows);
});

app.listen(3000);
