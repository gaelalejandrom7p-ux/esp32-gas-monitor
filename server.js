const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_v2_2024';
const ESP32_TOKEN = process.env.ESP32_TOKEN || 'esp32_token_seguro_2024';

let pool;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
}

let latestReading = null;
let esp32Status = { connected: false, lastSeen: null, ip: null, systemState: 'DESCONOCIDO' };
const connectedClients = new Set();

async function initializeDatabase() {
    if (!pool) { console.log('⚠ No DATABASE_URL'); return; }
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, email VARCHAR(100) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, name VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS sensor_readings (id SERIAL PRIMARY KEY, co_value DECIMAL(10,2) NOT NULL, hc_value DECIMAL(10,2) NOT NULL, co_status VARCHAR(20), hc_status VARCHAR(20), system_state VARCHAR(50), esp32_ip VARCHAR(50), timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        console.log('✓ Conectado a PostgreSQL');
    } catch (error) { console.log('✗ Error BD:', error.message); }
}

function getStatus(type, value) {
    const thresholds = { co: { normal: 150, warning: 500 }, hc: { normal: 150, warning: 500 } };
    const t = thresholds[type];
    if (value <= t.normal) return 'Normal';
    if (value <= t.warning) return 'Precaución';
    return 'Peligro';
}

function broadcastToClients(data) {
    const message = JSON.stringify(data);
    connectedClients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(message); });
}

setInterval(() => {
    if (esp32Status.lastSeen && (Date.now() - esp32Status.lastSeen) / 1000 > 15) {
        esp32Status.connected = false;
        broadcastToClients({ type: 'esp32_status', connected: false });
    }
}, 5000);

wss.on('connection', (ws) => {
    connectedClients.add(ws);
    ws.send(JSON.stringify({ type: 'init', esp32Status, latestReading }));
    ws.on('close', () => connectedClients.delete(ws));
});

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-ESP32-Token'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token requerido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token inválido' });
        req.user = user; next();
    });
}

app.post('/api/esp32/data', (req, res) => {
    const token = req.headers['x-esp32-token'];
    if (token !== ESP32_TOKEN) return res.status(401).json({ success: false, message: 'Token inválido' });
    
    const { co, hc, state: systemState, avgCO, avgHC } = req.body;
    esp32Status = { connected: true, lastSeen: Date.now(), ip: req.headers['x-forwarded-for'] || req.ip, systemState: systemState || 'ACTIVO' };
    latestReading = { co: parseFloat(co), hc: parseFloat(hc), co_status: getStatus('co', co), hc_status: getStatus('hc', hc), system_state: systemState, avgCO, avgHC, timestamp: new Date().toISOString() };
    broadcastToClients({ type: 'reading', data: latestReading, esp32Status });
    if (pool) pool.query('INSERT INTO sensor_readings (co_value, hc_value, co_status, hc_status, system_state, esp32_ip) VALUES ($1,$2,$3,$4,$5,$6)', [co, hc, latestReading.co_status, latestReading.hc_status, systemState, esp32Status.ip]);
    console.log(`📡 ESP32: CO=${co}, HC=${hc}`);
    res.json({ success: true });
});

app.get('/api/esp32/status', (req, res) => res.json({ success: true, ...esp32Status }));
app.get('/api/readings/latest', (req, res) => res.json({ success: true, data: latestReading, esp32Status }));
app.get('/api/readings/history', async (req, res) => {
    if (!pool) return res.json({ success: true, readings: [] });
    const result = await pool.query('SELECT * FROM sensor_readings ORDER BY timestamp DESC LIMIT 100');
    res.json({ success: true, readings: result.rows });
});
app.delete('/api/readings', authenticateToken, async (req, res) => {
    if (pool) await pool.query('DELETE FROM sensor_readings');
    res.json({ success: true });
});

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password, name } = req.body;
    if (!username || !email || !password || !name) return res.status(400).json({ success: false, message: 'Campos requeridos' });
    if (!pool) return res.status(503).json({ success: false, message: 'BD no disponible' });
    const existing = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (existing.rows.length > 0) return res.status(409).json({ success: false, message: 'Usuario ya existe' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query('INSERT INTO users (username, email, password_hash, name) VALUES ($1,$2,$3,$4) RETURNING id', [username, email, hash, name]);
    res.status(201).json({ success: true, message: 'Usuario creado', userId: result.rows[0].id });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'Credenciales requeridas' });
    if (!pool) return res.status(503).json({ success: false, message: 'BD no disponible' });
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, name: user.name } });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => res.json({ success: true, user: req.user }));
app.get('/api/health', (req, res) => res.json({ success: true, server: 'online', database: pool ? 'connected' : 'disconnected', esp32: esp32Status.connected }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initializeDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => console.log(`Servidor en puerto ${PORT}`));
});
