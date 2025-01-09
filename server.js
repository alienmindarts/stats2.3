const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const ARTISTS_DIR = path.join(__dirname, 'artists');

// Middleware to serve static files
app.use(express.static(path.join(__dirname)));

// API endpoint to list artists
app.get('/api/artists', (req, res) => {
  fs.readdir(ARTISTS_DIR, (err, files) => {
    if (err) {
      console.error('Error reading artists directory:', err);
      return res.status(500).json({ error: 'Unable to read artists directory' });
    }

    // Filter JSON files and remove the " stats.json" suffix
    const artists = files
      .filter(file => file.endsWith(' stats.json'))
      .map(file => file.replace(' stats.json', ''));

    res.json(artists);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
