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
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_jwt_2024';
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
let currentVehicleId = null;
const connectedClients = new Set();

// Catálogo de Marcas y Modelos
const CATALOGO_VEHICULOS = {
    "Nissan": ["Versa", "Sentra", "March", "Kicks", "X-Trail", "Frontier", "NP300", "Altima", "Maxima", "Pathfinder", "Otro"],
    "Chevrolet": ["Aveo", "Spark", "Beat", "Cavalier", "Onix", "Trax", "Equinox", "Silverado", "Colorado", "Tahoe", "Suburban", "Otro"],
    "Volkswagen": ["Jetta", "Vento", "Polo", "Golf", "Tiguan", "Taos", "Virtus", "Passat", "Beetle", "CrossFox", "Otro"],
    "Toyota": ["Yaris", "Corolla", "Camry", "RAV4", "Hilux", "Tacoma", "Prius", "Highlander", "4Runner", "Sienna", "Otro"],
    "Honda": ["Civic", "City", "HR-V", "CR-V", "Accord", "Fit", "Pilot", "Odyssey", "BR-V", "Otro"],
    "Ford": ["Fiesta", "Focus", "Fusion", "Escape", "Explorer", "Ranger", "F-150", "Mustang", "Edge", "Expedition", "Otro"],
    "Mazda": ["Mazda 2", "Mazda 3", "Mazda 6", "CX-3", "CX-30", "CX-5", "CX-9", "MX-5", "Otro"],
    "Hyundai": ["Grand i10", "Accent", "Elantra", "Tucson", "Santa Fe", "Creta", "Palisade", "Sonata", "Otro"],
    "Kia": ["Rio", "Forte", "Seltos", "Sportage", "Sorento", "Telluride", "Soul", "Carnival", "Otro"],
    "Suzuki": ["Swift", "Ignis", "Vitara", "S-Cross", "Jimny", "Ciaz", "Ertiga", "Otro"],
    "Renault": ["Kwid", "Logan", "Duster", "Koleos", "Oroch", "Captur", "Stepway", "Otro"],
    "SEAT": ["Ibiza", "Arona", "Ateca", "Leon", "Tarraco", "Toledo", "Otro"],
    "Audi": ["A1", "A3", "A4", "A5", "Q3", "Q5", "Q7", "Q8", "TT", "Otro"],
    "BMW": ["Serie 1", "Serie 2", "Serie 3", "Serie 4", "X1", "X3", "X5", "X6", "Z4", "Otro"],
    "Mercedes-Benz": ["Clase A", "Clase C", "Clase E", "GLA", "GLC", "GLE", "GLS", "Sprinter", "Otro"],
    "Jeep": ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Gladiator", "Otro"],
    "RAM": ["700", "1200", "1500", "2500", "ProMaster", "Otro"],
    "Mitsubishi": ["Mirage", "Lancer", "Outlander", "L200", "Eclipse Cross", "Montero", "Otro"],
    "Peugeot": ["208", "301", "2008", "3008", "5008", "Partner", "Otro"],
    "Fiat": ["Uno", "Mobi", "500", "Pulse", "Strada", "Ducato", "Otro"],
    "Otro": ["Especificar en observaciones"]
};

async function initializeDatabase() {
    if (!pool) { console.log('⚠ No DATABASE_URL'); return; }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
                    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
                END IF;
            END $$;
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vehiculos (
                id SERIAL PRIMARY KEY,
                placas VARCHAR(20) UNIQUE NOT NULL,
                vin VARCHAR(50),
                marca VARCHAR(50) NOT NULL,
                submarca VARCHAR(50),
                linea VARCHAR(50),
                anio INTEGER,
                tipo_combustible VARCHAR(30),
                num_cilindros INTEGER,
                cilindrada VARCHAR(20),
                tipo_carroceria VARCHAR(30),
                clase VARCHAR(30),
                tipo_servicio VARCHAR(30),
                traccion VARCHAR(20),
                peso_bruto VARCHAR(20),
                tarjeta_circulacion VARCHAR(50),
                folio_anterior VARCHAR(50),
                vigencia_anterior DATE,
                tiene_multa BOOLEAN DEFAULT FALSE,
                fecha_pago_multa DATE,
                folio_multa VARCHAR(50),
                lectura_odometro VARCHAR(20),
                observaciones TEXT,
                propietario_nombre VARCHAR(150),
                propietario_telefono VARCHAR(20),
                propietario_domicilio TEXT,
                base_concesionaria VARCHAR(150),
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehiculos' AND column_name='propietario_nombre') THEN
                    ALTER TABLE vehiculos ADD COLUMN propietario_nombre VARCHAR(150);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehiculos' AND column_name='propietario_telefono') THEN
                    ALTER TABLE vehiculos ADD COLUMN propietario_telefono VARCHAR(20);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehiculos' AND column_name='propietario_domicilio') THEN
                    ALTER TABLE vehiculos ADD COLUMN propietario_domicilio TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vehiculos' AND column_name='base_concesionaria') THEN
                    ALTER TABLE vehiculos ADD COLUMN base_concesionaria VARCHAR(150);
                END IF;
            END $$;
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id SERIAL PRIMARY KEY,
                vehiculo_id INTEGER REFERENCES vehiculos(id),
                co_value DECIMAL(10,2) NOT NULL,
                hc_value DECIMAL(10,2) NOT NULL,
                co_status VARCHAR(20),
                hc_status VARCHAR(20),
                system_state VARCHAR(50),
                esp32_ip VARCHAR(50),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sensor_readings' AND column_name='vehiculo_id') THEN
                    ALTER TABLE sensor_readings ADD COLUMN vehiculo_id INTEGER REFERENCES vehiculos(id);
                END IF;
            END $$;
        `);
        
        const adminExists = await pool.query("SELECT id FROM users WHERE username = 'admin'");
        if (adminExists.rows.length === 0) {
            const adminHash = await bcrypt.hash('adminTec176', 10);
            await pool.query(
                "INSERT INTO users (username, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)",
                ['admin', 'admin@cmec.app', adminHash, 'Administrador', 'admin']
            );
            console.log('✓ Admin creado (usuario: admin)');
        }
        
        console.log('✓ Conectado a PostgreSQL');
        console.log('✓ Tablas verificadas (users, vehiculos, sensor_readings)');
    } catch (error) { 
        console.log('✗ Error BD:', error.message); 
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
    ws.send(JSON.stringify({ type: 'init', esp32Status, latestReading, currentVehicleId }));
    ws.on('close', () => connectedClients.delete(ws));
});

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-ESP32-Token'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token requerido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Token inválido' });
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acceso denegado. Se requiere rol de administrador.' });
    }
    next();
}

app.post('/api/esp32/data', (req, res) => {
    const token = req.headers['x-esp32-token'];
    if (token !== ESP32_TOKEN) return res.status(401).json({ success: false, message: 'Token inválido' });
    
    const { co, hc, state: systemState, avgCO, avgHC } = req.body;
    esp32Status = { connected: true, lastSeen: Date.now(), ip: req.headers['x-forwarded-for'] || req.ip, systemState: systemState || 'ACTIVO' };
    latestReading = { co: parseFloat(co), hc: parseFloat(hc), co_status: getStatus('co', co), hc_status: getStatus('hc', hc), system_state: systemState, avgCO, avgHC, timestamp: new Date().toISOString(), vehiculo_id: currentVehicleId };
    broadcastToClients({ type: 'reading', data: latestReading, esp32Status });
    
    if (pool) {
        pool.query(
            'INSERT INTO sensor_readings (vehiculo_id, co_value, hc_value, co_status, hc_status, system_state, esp32_ip) VALUES ($1,$2,$3,$4,$5,$6,$7)', 
            [currentVehicleId, co, hc, latestReading.co_status, latestReading.hc_status, systemState, esp32Status.ip]
        );
    }
    console.log(`📡 ESP32: CO=${co}, HC=${hc}, Vehículo=${currentVehicleId || 'Sin asignar'}`);
    res.json({ success: true });
});

app.get('/api/esp32/status', (req, res) => res.json({ success: true, ...esp32Status }));

app.get('/api/readings/latest', (req, res) => res.json({ success: true, data: latestReading, esp32Status }));

app.get('/api/readings/history', async (req, res) => {
    if (!pool) return res.json({ success: true, readings: [] });
    const { vehiculo_id } = req.query;
    let query = 'SELECT sr.*, v.placas, v.marca, v.submarca FROM sensor_readings sr LEFT JOIN vehiculos v ON sr.vehiculo_id = v.id';
    let params = [];
    
    if (vehiculo_id) {
        query += ' WHERE sr.vehiculo_id = $1';
        params.push(vehiculo_id);
    }
    query += ' ORDER BY sr.timestamp DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json({ success: true, readings: result.rows });
});

app.delete('/api/readings', authenticateToken, async (req, res) => {
    if (pool) await pool.query('DELETE FROM sensor_readings');
    res.json({ success: true });
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
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role } });
});

app.get('/api/auth/verify', authenticateToken, async (req, res) => {
    if (pool) {
        const result = await pool.query('SELECT id, username, email, name, role FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length > 0) return res.json({ success: true, user: result.rows[0] });
    }
    res.json({ success: true, user: req.user });
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email, name, role, created_at FROM users ORDER BY created_at DESC');
        res.json({ success: true, users: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener usuarios' });
    }
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, email, password, name, role } = req.body;
        if (!username || !email || !password || !name) {
            return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
        }
        const existing = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Usuario o correo ya existe' });
        }
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, name, role, created_at',
            [username, email, hash, name, role || 'user']
        );
        res.status(201).json({ success: true, message: 'Usuario creado', user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al crear usuario' });
    }
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, password, name, role } = req.body;
        const userExists = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
        if (userExists.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        let query = 'UPDATE users SET username = $1, email = $2, name = $3, role = $4';
        let params = [username, email, name, role || 'user'];
        if (password && password.trim() !== '') {
            const hash = await bcrypt.hash(password, 10);
            query += ', password_hash = $5 WHERE id = $6 RETURNING id, username, email, name, role';
            params.push(hash, id);
        } else {
            query += ' WHERE id = $5 RETURNING id, username, email, name, role';
            params.push(id);
        }
        const result = await pool.query(query, params);
        res.json({ success: true, message: 'Usuario actualizado', user: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al actualizar usuario' });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const user = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
        if (user.rows.length > 0 && user.rows[0].username === 'admin') {
            return res.status(403).json({ success: false, message: 'No se puede eliminar al administrador principal' });
        }
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true, message: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al eliminar usuario' });
    }
});

app.get('/api/vehiculos/catalogo', (req, res) => {
    res.json({ success: true, catalogo: CATALOGO_VEHICULOS });
});

app.get('/api/vehiculos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.*, u.name as created_by_name,
                   (SELECT COUNT(*) FROM sensor_readings WHERE vehiculo_id = v.id) as total_lecturas
            FROM vehiculos v 
            LEFT JOIN users u ON v.created_by = u.id 
            ORDER BY v.created_at DESC
        `);
        res.json({ success: true, vehiculos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener vehículos' });
    }
});

app.get('/api/vehiculos/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM vehiculos WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        }
        res.json({ success: true, vehiculo: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener vehículo' });
    }
});

app.get('/api/vehiculos/buscar/:placas', authenticateToken, async (req, res) => {
    try {
        const { placas } = req.params;
        const result = await pool.query('SELECT * FROM vehiculos WHERE UPPER(placas) = UPPER($1)', [placas]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        }
        res.json({ success: true, vehiculo: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al buscar vehículo' });
    }
});

app.post('/api/vehiculos', authenticateToken, async (req, res) => {
    try {
        const { 
            placas, vin, marca, submarca, linea, anio, tipo_combustible, 
            num_cilindros, cilindrada, tipo_carroceria, clase, tipo_servicio,
            traccion, peso_bruto, tarjeta_circulacion, folio_anterior,
            vigencia_anterior, tiene_multa, fecha_pago_multa, folio_multa,
            lectura_odometro, observaciones, propietario_nombre, 
            propietario_telefono, propietario_domicilio, base_concesionaria
        } = req.body;
        
        if (!placas || !marca) {
            return res.status(400).json({ success: false, message: 'Placas y marca son requeridos' });
        }
        
        const existing = await pool.query('SELECT id FROM vehiculos WHERE UPPER(placas) = UPPER($1)', [placas]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Ya existe un vehículo con esas placas' });
        }
        
        const result = await pool.query(`
            INSERT INTO vehiculos (
                placas, vin, marca, submarca, linea, anio, tipo_combustible,
                num_cilindros, cilindrada, tipo_carroceria, clase, tipo_servicio,
                traccion, peso_bruto, tarjeta_circulacion, folio_anterior,
                vigencia_anterior, tiene_multa, fecha_pago_multa, folio_multa,
                lectura_odometro, observaciones, propietario_nombre,
                propietario_telefono, propietario_domicilio, base_concesionaria, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
            RETURNING *
        `, [
            placas.toUpperCase(), vin, marca, submarca, linea, anio, tipo_combustible,
            num_cilindros, cilindrada, tipo_carroceria, clase, tipo_servicio,
            traccion, peso_bruto, tarjeta_circulacion, folio_anterior,
            vigencia_anterior || null, tiene_multa || false, fecha_pago_multa || null, folio_multa,
            lectura_odometro, observaciones, propietario_nombre,
            propietario_telefono, propietario_domicilio, base_concesionaria, req.user.id
        ]);
        
        res.status(201).json({ success: true, message: 'Vehículo registrado', vehiculo: result.rows[0] });
    } catch (error) {
        console.error('Error creando vehículo:', error);
        res.status(500).json({ success: false, message: 'Error al registrar vehículo' });
    }
});

app.put('/api/vehiculos/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            placas, vin, marca, submarca, linea, anio, tipo_combustible, 
            num_cilindros, cilindrada, tipo_carroceria, clase, tipo_servicio,
            traccion, peso_bruto, tarjeta_circulacion, folio_anterior,
            vigencia_anterior, tiene_multa, fecha_pago_multa, folio_multa,
            lectura_odometro, observaciones, propietario_nombre,
            propietario_telefono, propietario_domicilio, base_concesionaria
        } = req.body;
        
        const result = await pool.query(`
            UPDATE vehiculos SET
                placas = $1, vin = $2, marca = $3, submarca = $4, linea = $5,
                anio = $6, tipo_combustible = $7, num_cilindros = $8, cilindrada = $9,
                tipo_carroceria = $10, clase = $11, tipo_servicio = $12, traccion = $13,
                peso_bruto = $14, tarjeta_circulacion = $15, folio_anterior = $16,
                vigencia_anterior = $17, tiene_multa = $18, fecha_pago_multa = $19,
                folio_multa = $20, lectura_odometro = $21, observaciones = $22,
                propietario_nombre = $23, propietario_telefono = $24,
                propietario_domicilio = $25, base_concesionaria = $26,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $27 RETURNING *
        `, [
            placas.toUpperCase(), vin, marca, submarca, linea, anio, tipo_combustible,
            num_cilindros, cilindrada, tipo_carroceria, clase, tipo_servicio,
            traccion, peso_bruto, tarjeta_circulacion, folio_anterior,
            vigencia_anterior || null, tiene_multa || false, fecha_pago_multa || null, folio_multa,
            lectura_odometro, observaciones, propietario_nombre,
            propietario_telefono, propietario_domicilio, base_concesionaria, id
        ]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        }
        
        res.json({ success: true, message: 'Vehículo actualizado', vehiculo: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al actualizar vehículo' });
    }
});

app.delete('/api/vehiculos/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM sensor_readings WHERE vehiculo_id = $1', [id]);
        await pool.query('DELETE FROM vehiculos WHERE id = $1', [id]);
        res.json({ success: true, message: 'Vehículo eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al eliminar vehículo' });
    }
});

app.post('/api/vehiculos/seleccionar/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM vehiculos WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Vehículo no encontrado' });
        }
        currentVehicleId = parseInt(id);
        broadcastToClients({ type: 'vehiculo_seleccionado', vehiculo: result.rows[0] });
        res.json({ success: true, message: 'Vehículo seleccionado', vehiculo: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al seleccionar vehículo' });
    }
});

app.post('/api/vehiculos/deseleccionar', authenticateToken, (req, res) => {
    currentVehicleId = null;
    broadcastToClients({ type: 'vehiculo_deseleccionado' });
    res.json({ success: true, message: 'Vehículo deseleccionado' });
});

app.get('/api/vehiculos/:id/lecturas', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT * FROM sensor_readings WHERE vehiculo_id = $1 ORDER BY timestamp DESC LIMIT 100',
            [id]
        );
        res.json({ success: true, lecturas: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener lecturas' });
    }
});

app.get('/api/health', (req, res) => res.json({ 
    success: true, 
    server: 'online', 
    database: pool ? 'connected' : 'disconnected', 
    esp32: esp32Status.connected,
    currentVehicle: currentVehicleId
}));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initializeDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => console.log(`🚀 ESP32 Gas Monitor V2.0 en puerto ${PORT}`));
});
