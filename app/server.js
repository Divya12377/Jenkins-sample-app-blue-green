const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const version = process.env.APP_VERSION || 'blue';

app.get('/', (req, res) => {
  res.json({
    message: `Hello from ${version} version!`,
    version: version,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', version: version });
});

app.listen(port, () => {
  console.log(`App running on port ${port}, version: ${version}`);
});
