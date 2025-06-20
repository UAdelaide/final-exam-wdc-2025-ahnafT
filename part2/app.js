const express = require('express');
const path = require('path');
const session = require('express-session');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));

app.use(session({
    secret: 'secretsecret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 }
}));

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

let db;

(async () => {
  try {
    // ✅ Connect to DB
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

app.get('/api/dogs', async (req, res) => {
  try {
    const [dogs] = await db.query(`
      SELECT Dogs.dog_id, Dogs.name, Dogs.size, Dogs.owner_id
      FROM Dogs
    `);
    res.json(dogs);
  } catch (err) {
    console.error('Error fetching dogs:', err);
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// Export the app instead of listening here
module.exports = app;