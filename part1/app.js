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
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });

    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end();

    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    // Create tables
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

    // Clear existing data to ensure clean insertion
    await db.execute('DELETE FROM WalkRatings');
    await db.execute('DELETE FROM WalkApplications');
    await db.execute('DELETE FROM WalkRequests');
    await db.execute('DELETE FROM Dogs');
    await db.execute('DELETE FROM Users');

    // Reset AUTO_INCREMENT counters
    await db.execute('ALTER TABLE Users AUTO_INCREMENT = 1');
    await db.execute('ALTER TABLE Dogs AUTO_INCREMENT = 1');
    await db.execute('ALTER TABLE WalkRequests AUTO_INCREMENT = 1');
    await db.execute('ALTER TABLE WalkApplications AUTO_INCREMENT = 1');
    await db.execute('ALTER TABLE WalkRatings AUTO_INCREMENT = 1');

    // Insert Users
    await db.query(`
      INSERT INTO Users (username, email, password_hash, role) VALUES
      ('alice123', 'alice@example.com', 'hashed123', 'owner'),
      ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
      ('carol123', 'carol@example.com', 'hashed789', 'owner'),
      ('davidwalker', 'david@example.com', 'hashed999', 'walker'),
      ('emily123', 'emily@example.com', 'hashed321', 'owner')
    `);

    // Insert Dogs
    await db.query(`
      INSERT INTO Dogs (name, size, owner_id)
      VALUES
      ('Max', 'medium', (SELECT user_id FROM Users WHERE username = 'alice123')),
      ('Bella', 'small', (SELECT user_id FROM Users WHERE username = 'carol123')),
      ('Rocky', 'large', (SELECT user_id FROM Users WHERE username = 'emily123')),
      ('Buddy', 'small', (SELECT user_id FROM Users WHERE username = 'alice123')),
      ('Cooper', 'medium', (SELECT user_id FROM Users WHERE username = 'carol123'))
    `);

    // Insert WalkRequests
    await db.query(`
      INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
      VALUES
      ((SELECT dog_id FROM Dogs WHERE name = 'Max' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Bella' AND owner_id = (SELECT user_id FROM Users WHERE username = 'carol123')), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Rocky' AND owner_id = (SELECT user_id FROM Users WHERE username = 'emily123')), '2025-06-11 07:15:00', 60, 'Riverwalk Trail', 'open'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Buddy' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')), '2025-06-11 10:00:00', 20, 'Central Park', 'completed'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Cooper' AND owner_id = (SELECT user_id FROM Users WHERE username = 'carol123')), '2025-06-12 16:30:00', 40, 'Greenfield Gardens', 'cancelled'),
      ((SELECT dog_id FROM Dogs WHERE name = 'Max' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')), '2025-06-13 09:00:00', 30, 'City Park', 'completed')
    `);

    // Insert WalkApplications
    await db.query(`
      INSERT INTO WalkApplications (request_id, walker_id, status)
      VALUES
      (
        (SELECT request_id FROM WalkRequests WHERE status = 'completed' AND dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Buddy' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')) LIMIT 1),
        (SELECT user_id FROM Users WHERE username = 'bobwalker'),
        'accepted'
      ),
      (
        (SELECT request_id FROM WalkRequests WHERE status = 'completed' AND dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Max' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')) AND location = 'City Park' LIMIT 1),
        (SELECT user_id FROM Users WHERE username = 'bobwalker'),
        'accepted'
      )
    `);

    // Insert WalkRatings
    await db.query(`
      INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
      VALUES
      (
        (SELECT request_id FROM WalkRequests WHERE status = 'completed' AND dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Buddy' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')) LIMIT 1),
        (SELECT user_id FROM Users WHERE username = 'bobwalker'),
        (SELECT user_id FROM Users WHERE username = 'alice123'),
        5,
        'Great walk, very punctual!'
      ),
      (
        (SELECT request_id FROM WalkRequests WHERE status = 'completed' AND dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Max' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')) AND location = 'City Park' LIMIT 1),
        (SELECT user_id FROM Users WHERE username = 'bobwalker'),
        (SELECT user_id FROM Users WHERE username = 'alice123'),
        4,
        'Good job, but a bit rushed.'
      )
    `);

    // --- API ROUTES ---

    app.get('/api/dogs', async (req, res) => {
      try {
        const [dogs] = await db.query(`
          SELECT Dogs.name AS dog_name, Dogs.size, Users.username AS owner_username
          FROM Dogs
          JOIN Users ON Dogs.owner_id = Users.user_id
        `);
        res.json(dogs);
      } catch (err) {
        console.error('Error fetching dogs:', err);
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
        console.log('Open walk requests:', requests); // Debug log
        res.json(requests);
      } catch (err) {
        console.error('Error fetching open walk requests:', err);
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
            COUNT(DISTINCT CASE WHEN wa.status = 'accepted' AND r.status = 'completed' THEN wa.request_id END) AS completed_walks
          FROM Users u
          LEFT JOIN WalkRatings wr ON wr.walker_id = u.user_id
          LEFT JOIN WalkApplications wa ON wa.walker_id = u.user_id
          LEFT JOIN WalkRequests r ON wa.request_id = r.request_id
          WHERE u.role = 'walker'
          GROUP BY u.user_id
        `);
        res.json(summary);
      } catch (err) {
        console.error('Error fetching walker summary:', err);
        res.status(500).json({ error: 'Failed to fetch walker summary' });
      }
    });

  } catch (err) {
    console.error('Database setup error:', err);
  }
})();

app.use(express.static(path.join(__dirname, 'public')));
module.exports = app;
