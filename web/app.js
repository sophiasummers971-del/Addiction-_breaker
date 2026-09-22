'use strict';
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ingest, summarise } = require('../src/ingest');

const app = express();
const upload = multer({ dest: '/tmp/' });

app.use(express.static(path.join(__dirname, 'public')));

app.post('/upload', upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const result = ingest([req.file.path]);
    fs.unlinkSync(req.file.path);
    const users = summarise(result.events);
    res.json({
      totals: result.totals,
      files: result.files,
      issues: result.issues.slice(0, 20),
      warnings: result.warnings,
      users,
    });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(400).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3737;
app.listen(PORT, () => console.log(`Algorithm Mirror Web running at http://localhost:${PORT}`));
