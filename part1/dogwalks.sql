const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const mysql = require('mysql2/promise');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db;

(async () => {
  try {
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    // Insert users
    await db.query(`
      INSERT IGNORE INTO Users (username, email, password_hash, role) VALUES
      ('alice123', 'alice@example.com', 'hashed123', 'owner'),
      ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
      ('carol123', 'carol@example.com', 'hashed789', 'owner'),
      ('davidwalker', 'david@example.com', 'hashed999', 'walker'),
      ('emily123', 'emily@example.com', 'hashed321', 'owner')
    `);

    // Insert dogs
    await db.query(`
      INSERT IGNORE INTO Dogs (name, size, owner_id)
      VALUES
        ('Max', 'medium', (SELECT user_id FROM Users WHERE username = 'alice123')),
        ('Bella', 'small', (SELECT user_id FROM Users WHERE username = 'carol123')),
        ('Rocky', 'large', (SELECT user_id FROM Users WHERE username = 'emily123')),
        ('Buddy', 'small', (SELECT user_id FROM Users WHERE username = 'alice123')),
        ('Cooper', 'medium', (SELECT user_id FROM Users WHERE username = 'carol123'))
    `);

    // Insert walk requests
    await db.query(`
      INSERT IGNORE INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
      VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Rocky'), '2025-06-11 07:15:00', 60, 'Riverwalk Trail', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Buddy'), '2025-06-11 10:00:00', 20, 'Central Park', 'completed'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Cooper'), '2025-06-12 16:30:00', 40, 'Greenfield Gardens', 'cancelled')
    `);

    // Ensure bobwalker is accepted for the completed walk
    await db.query(`
      INSERT IGNORE INTO WalkApplications (request_id, walker_id, status)
      VALUES (
        (SELECT request_id FROM WalkRequests WHERE status = 'completed' AND dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Buddy')),
        (SELECT user_id FROM Users WHERE username = 'bobwalker'),
        'accepted'
      )
    `);

    // Insert rating
    await db.query(`
      INSERT IGNORE INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
      VALUES (
        (SELECT request_id FROM WalkRequests WHERE status = 'completed' AND dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Buddy')),
        (SELECT user_id FROM Users WHERE username = 'bobwalker'),
        (SELECT user_id FROM Users WHERE username = 'alice123'),
        5,
        'Great walk, very punctual!'
      )
    `);

  } catch (err) {
    console.error('DB Setup Error:', err);
  }
})();

app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [summary] = await db.query(`
      SELECT
        u.username AS walker_username,
        COUNT(DISTINCT r.rating_id) AS total_ratings,
        ROUND(AVG(r.rating), 1) AS average_rating,
        COUNT(DISTINCT CASE
          WHEN wr.status = 'completed' AND wa.status = 'accepted' THEN wr.request_id
          ELSE NULL
        END) AS completed_walks
      FROM Users u
      LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id
      LEFT JOIN WalkRequests wr ON wa.request_id = wr.request_id
      LEFT JOIN WalkRatings r ON r.request_id = wr.request_id AND r.walker_id = u.user_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id
    `);
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch walker summary' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
module.exports = app;
