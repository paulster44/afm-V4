import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// The frontend server will run on the port exposed by the container (e.g., 8080).
const port = process.env.PORT || 8080;

// Middleware to parse JSON bodies, with a higher limit for contract scan uploads.
app.use(express.json({ limit: '10mb' }));

// Proxy API requests to the backend server.
// In the single-container setup, the backend runs on a different port (8081)
// but is accessible via 'localhost' from this frontend server process.
app.use('/api', async (req, res) => {
  const backendUrl = 'http://localhost:8081';
  try {
    const response = await axios({
      method: req.method,
      url: `${backendUrl}${req.originalUrl}`,
      data: req.body,
      headers: {
        // Forward only essential headers to the backend service
        ...(req.headers.authorization && { 'Authorization': req.headers.authorization }),
        ...(req.headers['content-type'] && { 'Content-Type': req.headers['content-type'] }),
      }
    });
    // Forward the status, headers, and data from the backend response to the original client.
    res.set(response.headers);
    res.status(response.status).send(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      // If the backend returned an error, forward that specific error.
      res.set(error.response.headers);
      res.status(error.response.status).send(error.response.data);
    } else {
      // If there was a network or other proxy error, return a generic gateway error.
      console.error('Proxy Error:', error);
      res.status(502).json({ message: 'Bad Gateway: Could not forward request to backend.' });
    }
  }
});

const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

// Serve all other static files from the 'dist' directory
app.use(express.static(distPath));

// For single-page applications, send the index.html for any other GET request
// that doesn't match an API call or a static file.
app.get('*', (req, res) => {
  res.sendFile(indexPath);
});

app.listen(port, () => {
  console.log(`Frontend server with API proxy listening on port ${port}`);
});
