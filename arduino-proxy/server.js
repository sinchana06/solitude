import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors()); // allow your React app to call this

const ARDUINO_IP = 'http://10.119.132.172'; // your local Arduino IP

app.get('/api/weight', async (req, res) => {
  try {
    const response = await fetch(ARDUINO_IP);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch from Arduino' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Proxy server running');
});
