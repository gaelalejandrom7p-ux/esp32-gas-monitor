const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_v2_2024';
const ESP32_TOKEN = process.env.ESP32_TOKEN || 'esp32_token_seguro_2024';

const dbConfig = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'ESP32Monitor',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let pool;
let latestReading = null;
let esp32Status = {
    connected: false,
    lastSeen: null,
    ip: null,
    systemState: 'DESCONOCIDO'
};

const connectedClients = new Set();

async function initializeDatabase() {
    try {
        pool = await sql.connect(dbConfig);
        console.log('✓ Conectado a SQL Server');
        await createTables();
    } catch (error) {
        console.log('✗ BD no disponible, funcionando en modo memoria');
    }
}

async function createTables() {
    try {
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
            CREATE TABLE Users (
                id INT IDENTITY(1,1) PRIMARY KEY,
                username NVARCHAR(50) UNIQUE NOT NULL,
                email NVARCHAR(100) UNIQUE NOT NULL,
                password_hash NVARCHAR(255) NOT NULL,
                name NVARCHAR(100) NOT NULL,
                created_at DATETIME DEFAULT GETDATE()
            );
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SensorReadings' AND xtype='U')
            CREATE TABLE SensorReadings (
                id INT IDENTITY(1,1) PRIMARY KEY,
                co_value DECIMAL(10,2) NOT NULL,
                hc_value DECIMAL(10,2) NOT NULL,
                co_status NVARCHAR(20),
                hc_status NVARCHAR(20),
                system_state NVARCHAR(50),
                esp32_ip NVARCHAR(50),
                timestamp DATETIME DEFAULT GETDATE()
            );
        `);
        console.log('✓ Tablas verificadas');
    } catch (error) {
        console.log('Error en tablas:', error.message);
    }
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
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function checkEsp32Connection() {
    if (esp32Status.lastSeen) {
        const secondsSinceLastSeen = (Date.now() - esp32Status.lastSeen) / 1000;
        if (secondsSinceLastSeen > 15) {
            esp32Status.connected = false;
            broadcastToClients({ type: 'esp32_status', connected: false });
        }
    }
}

setInterval(checkEsp32Connection, 5000);

wss.on('connection', (ws) => {
    console.log('Cliente WebSocket conectado');
    connectedClients.add(ws);
    
    ws.send(JSON.stringify({
        type: 'init',
        esp32Status: esp32Status,
        latestReading: latestReading
    }));
    
    ws.on('close', () => {
        connectedClients.delete(ws);
        console.log('Cliente WebSocket desconectado');
    });
});

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-ESP32-Token'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token requerido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token inválido' });
        req.user = user;
        next();
    });
}

function authenticateESP32(req, res, next) {
    const token = req.headers['x-esp32-token'];
    if (token !== ESP32_TOKEN) {
        return res.status(401).json({ success: false, message: 'Token ESP32 inválido' });
    }
    next();
}

app.post('/api/esp32/data', authenticateESP32, async (req, res) => {
    try {
        const { co, hc, state: systemState, avgCO, avgHC } = req.body;
        const esp32Ip = req.headers['x-forwarded-for'] || req.ip;
        
        esp32Status = {
            connected: true,
            lastSeen: Date.now(),
            ip: esp32Ip,
            systemState: systemState || 'ACTIVO'
        };
        
        latestReading = {
            co: parseFloat(co),
            hc: parseFloat(hc),
            co_status: getStatus('co', co),
            hc_status: getStatus('hc', hc),
            system_state: systemState,
            avgCO: avgCO,
            avgHC: avgHC,
            timestamp: new Date().toISOString()
        };
        
        broadcastToClients({
            type: 'reading',
            data: latestReading,
            esp32Status: esp32Status
        });
        
        if (pool) {
            await pool.request()
                .input('co', sql.Decimal(10,2), co)
                .input('hc', sql.Decimal(10,2), hc)
                .input('co_status', sql.NVarChar, latestReading.co_status)
                .input('hc_status', sql.NVarChar, latestReading.hc_status)
                .input('system_state', sql.NVarChar, systemState)
                .input('esp32_ip', sql.NVarChar, esp32Ip)
                .query('INSERT INTO SensorReadings (co_value, hc_value, co_status, hc_status, system_state, esp32_ip) VALUES (@co, @hc, @co_status, @hc_status, @system_state, @esp32_ip)');
        }
        
        console.log(`📡 ESP32 [${esp32Ip}]: CO=${co}, HC=${hc}, Estado=${systemState}`);
        res.json({ success: true, message: 'Datos recibidos' });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.get('/api/esp32/status', (req, res) => {
    res.json({ success: true, ...esp32Status });
});

app.get('/api/readings/latest', (req, res) => {
    res.json({ success: true, data: latestReading, esp32Status: esp32Status });
});

app.get('/api/readings/history', async (req, res) => {
    try {
        if (!pool) return res.json({ success: true, readings: [] });
        const result = await pool.request().query('SELECT TOP 100 * FROM SensorReadings ORDER BY timestamp DESC');
        res.json({ success: true, readings: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

app.delete('/api/readings', authenticateToken, async (req, res) => {
    try {
        if (pool) await pool.request().query('DELETE FROM SensorReadings');
        res.json({ success: true, message: 'Historial limpiado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, name } = req.body;
        if (!username || !email || !password || !name) {
            return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
        }
        if (!pool) return res.status(503).json({ success: false, message: 'BD no disponible' });
        
        const existing = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('email', sql.NVarChar, email)
            .query('SELECT id FROM Users WHERE username = @username OR email = @email');
        
        if (existing.recordset.length > 0) {
            return res.status(409).json({ success: false, message: 'Usuario o correo ya existe' });
        }
        
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .input('email', sql.NVarChar, email)
            .input('hash', sql.NVarChar, hash)
            .input('name', sql.NVarChar, name)
            .query('INSERT INTO Users (username, email, password_hash, name) OUTPUT INSERTED.id VALUES (@username, @email, @hash, @name)');
        
        res.status(201).json({ success: true, message: 'Usuario creado', userId: result.recordset[0].id });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Credenciales requeridas' });
        }
        if (!pool) return res.status(503).json({ success: false, message: 'BD no disponible' });
        
        const result = await pool.request()
            .input('username', sql.NVarChar, username)
            .query('SELECT * FROM Users WHERE username = @username');
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
        
        const user = result.recordset[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
        
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username, email: user.email, name: user.name }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        server: 'online',
        database: pool ? 'connected' : 'disconnected',
        esp32: esp32Status.connected ? 'connected' : 'disconnected',
        clients: connectedClients.size,
        timestamp: new Date().toISOString()
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
    await initializeDatabase();
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 ESP32 Gas Monitor V2.0`);
        console.log(`   Servidor: http://localhost:${PORT}`);
        console.log(`   WebSocket: ws://localhost:${PORT}`);
        console.log(`\n📡 El ESP32 debe enviar datos a:`);
        console.log(`   POST /api/esp32/data`);
        console.log(`   Header: X-ESP32-Token: ${ESP32_TOKEN}\n`);
    });
}

start();
