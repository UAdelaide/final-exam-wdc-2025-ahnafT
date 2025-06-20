var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db;

(async () => {
  try {
    // Connect without DB first to create DB if needed
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });

    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end();

    // Connect to DogWalkService DB
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    // Create tables if not exists
    await db.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner', 'walker') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Dogs (
        dog_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        size ENUM('small', 'medium', 'large') NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRequests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        dog_id INT NOT NULL,
        requested_time DATETIME NOT NULL,
        duration_minutes INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkApplications (
        application_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        CONSTRAINT unique_application UNIQUE (request_id, walker_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRatings (
        rating_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        owner_id INT NOT NULL,
        rating INT CHECK (rating BETWEEN 1 AND 5),
        comments TEXT,
        rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        FOREIGN KEY (owner_id) REFERENCES Users(user_id),
        CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
      )
    `);

    // Seed data only if Users table empty
    const [users] = await db.query('SELECT COUNT(*) AS count FROM Users');
    if (users[0].count === 0) {
      // Insert users
      await db.query(`
        INSERT INTO Users (username, email, password_hash, role) VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('davidwalker', 'david@example.com', 'hashed999', 'walker'),
        ('emily123', 'emily@example.com', 'hashed321', 'owner')
      `);

      // Get relevant user IDs
      const [[alice]] = await db.query(`SELECT user_id FROM Users WHERE username = 'alice123'`);
      const [[carol]] = await db.query(`SELECT user_id FROM Users WHERE username = 'carol123'`);
      const [[emily]] = await db.query(`SELECT user_id FROM Users WHERE username = 'emily123'`);
      const [[bob]] = await db.query(`SELECT user_id FROM Users WHERE username = 'bobwalker'`);
      const [[david]] = await db.query(`SELECT user_id FROM Users WHERE username = 'davidwalker'`);

      // Insert dogs
      await db.query(`
        INSERT INTO Dogs (name, size, owner_id) VALUES
        ('Max', 'medium', ?),
        ('Bella', 'small', ?),
        ('Rocky', 'large', ?),
        ('Buddy', 'small', ?),
        ('Cooper', 'medium', ?)
      `, [alice.user_id, carol.user_id, emily.user_id, alice.user_id, carol.user_id]);

      // Get dog IDs
      const [[maxDog]] = await db.query(`SELECT dog_id FROM Dogs WHERE name = 'Max' AND owner_id = ?`, [alice.user_id]);
      const [[bellaDog]] = await db.query(`SELECT dog_id FROM Dogs WHERE name = 'Bella' AND owner_id = ?`, [carol.user_id]);
      const [[rockyDog]] = await db.query(`SELECT dog_id FROM Dogs WHERE name = 'Rocky' AND owner_id = ?`, [emily.user_id]);
      const [[buddyDog]] = await db.query(`SELECT dog_id FROM Dogs WHERE name = 'Buddy' AND owner_id = ?`, [alice.user_id]);
      const [[cooperDog]] = await db.query(`SELECT dog_id FROM Dogs WHERE name = 'Cooper' AND owner_id = ?`, [carol.user_id]);

      // Insert walk requests
      await db.query(`
        INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
        (?, '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        (?, '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        (?, '2025-06-11 07:15:00', 60, 'Riverwalk Trail', 'open'),
        (?, '2025-06-11 10:00:00', 20, 'Central Park', 'completed'),
        (?, '2025-06-12 16:30:00', 40, 'Greenfield Gardens', 'cancelled')
      `, [maxDog.dog_id, bellaDog.dog_id, rockyDog.dog_id, buddyDog.dog_id, cooperDog.dog_id]);

      // Get request_id for completed walk for Buddy
      const [[completedRequest]] = await db.query(`
        SELECT request_id FROM WalkRequests WHERE dog_id = ? AND status = 'completed'
      `, [buddyDog.dog_id]);

      // Insert WalkApplication for bobwalker accepted for completed walk
      await db.query(`
        INSERT INTO WalkApplications (request_id, walker_id, status)
        VALUES (?, ?, 'accepted')
      `, [completedRequest.request_id, bob.user_id]);

      // Insert WalkRating for that walk
      await db.query(`
        INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
        VALUES (?, ?, ?, 5, 'Great walk, very punctual!')
      `, [completedRequest.request_id, bob.user_id, alice.user_id]);
    }

    // API endpoints
    app.get('/api/dogs', async (req, res) => {
      try {
        const [dogs] = await db.query(`
          SELECT Dogs.name AS dog_name, Dogs.size, Users.username AS owner_username
          FROM Dogs
          JOIN Users ON Dogs.owner_id = Users.user_id
        `);
        res.json(dogs);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch dogs' });
      }
    });

    app.get('/api/walkrequests/open', async (req, res) => {
      try {
        const [requests] = await db.query(`
          SELECT
            WalkRequests.request_id,
            Dogs.name AS dog_name,
            WalkRequests.requested_time,
            WalkRequests.duration_minutes,
            WalkRequests.location,
            Users.username AS owner_username
          FROM WalkRequests
          JOIN Dogs ON WalkRequests.dog_id = Dogs.dog_id
          JOIN Users ON Dogs.owner_id = Users.user_id
          WHERE WalkRequests.status = 'open'
        `);
        res.json(requests);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch open walk requests' });
      }
    });

    app.get('/api/walkers/summary', async (req, res) => {
      try {
        const [summary] = await db.query(`
          SELECT
            u.username AS walker_username,
            COUNT(DISTINCT wr.rating_id) AS total_ratings,
            ROUND(AVG(wr.rating), 1) AS average_rating,
            COUNT(DISTINCT wa.request_id) AS completed_walks
          FROM Users u
          LEFT JOIN WalkRatings wr ON wr.walker_id = u.user_id
          LEFT JOIN WalkApplications wa ON wa.walker_id = u.user_id AND wa.status = 'accepted'
          LEFT JOIN WalkRequests wrq ON wrq.request_id = wa.request_id AND wrq.status = 'completed'
          WHERE u.role = 'walker'
          GROUP BY u.user_id
        `);
        res.json(summary);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch walker summary' });
      }
    });

  } catch (err) {
    console.error('Database setup error:', err);
  }
})();

app.use(express.static(path.join(__dirname, 'public')));
module.exports = app;
