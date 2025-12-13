const API_URL = window.location.origin + '/api';
const WS_URL = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;

const THRESHOLDS = { co: { normal: 150, warning: 500, max: 1000 }, hc: { normal: 150, warning: 500, max: 1000 } };

const state = {
    isAuthenticated: false,
    currentUser: null,
    authToken: null,
    readings: [],
    readingCount: 0,
    isPaused: false,
    websocket: null
};

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('showRegister').addEventListener('click', (e) => { e.preventDefault(); toggleForms('register'); });
    document.getElementById('showLogin').addEventListener('click', (e) => { e.preventDefault(); toggleForms('login'); });
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('clearBtn').addEventListener('click', clearReadings);
    document.getElementById('pdfBtn').addEventListener('click', () => document.getElementById('pdfModal').classList.add('active'));
    document.getElementById('cancelPdfBtn').addEventListener('click', () => document.getElementById('pdfModal').classList.remove('active'));
    document.getElementById('confirmPdfBtn').addEventListener('click', generatePdf);
    
    checkStoredSession();
}

function toggleForms(show) {
    document.getElementById('loginOverlay').style.display = show === 'login' ? 'flex' : 'none';
    document.getElementById('registerOverlay').style.display = show === 'register' ? 'flex' : 'none';
}

function checkStoredSession() {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    if (token && user) {
        state.authToken = token;
        state.currentUser = JSON.parse(user);
        verifyToken();
    }
}

async function verifyToken() {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
        if (response.ok) {
            showApp();
        } else {
            clearSession();
        }
    } catch (error) {
        clearSession();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (data.success) {
            state.authToken = data.token;
            state.currentUser = data.user;
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));
            showApp();
        } else {
            errorEl.textContent = data.message;
        }
    } catch (error) {
        errorEl.textContent = 'Error de conexión';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const username = document.getElementById('regUsername').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const errorEl = document.getElementById('registerError');
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, username, email, password })
        });
        const data = await response.json();
        if (data.success) {
            alert('Cuenta creada. Ahora inicia sesión.');
            toggleForms('login');
            document.getElementById('username').value = username;
        } else {
            errorEl.textContent = data.message;
        }
    } catch (error) {
        errorEl.textContent = 'Error de conexión';
    }
}

function handleLogout() {
    clearSession();
    if (state.websocket) state.websocket.close();
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginOverlay').style.display = 'flex';
}

function clearSession() {
    state.authToken = null;
    state.currentUser = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
}

function showApp() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('registerOverlay').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('currentUser').textContent = state.currentUser?.name || 'Usuario';
    connectWebSocket();
    loadHistory();
}

function connectWebSocket() {
    state.websocket = new WebSocket(WS_URL);
    
    state.websocket.onopen = () => {
        console.log('WebSocket conectado');
        document.getElementById('wsStatus').textContent = 'Conectado';
        document.getElementById('wsStatus').style.color = '#22c55e';
    };
    
    state.websocket.onmessage = (event) => {
        if (state.isPaused) return;
        
        const message = JSON.parse(event.data);
        
        if (message.type === 'init') {
            updateEsp32Status(message.esp32Status);
            if (message.latestReading) processReading(message.latestReading);
        } else if (message.type === 'reading') {
            updateEsp32Status(message.esp32Status);
            processReading(message.data);
        } else if (message.type === 'esp32_status') {
            updateEsp32Status(message);
        }
    };
    
    state.websocket.onclose = () => {
        console.log('WebSocket desconectado, reconectando...');
        document.getElementById('wsStatus').textContent = 'Reconectando...';
        document.getElementById('wsStatus').style.color = '#eab308';
        setTimeout(connectWebSocket, 3000);
    };
    
    state.websocket.onerror = (error) => {
        console.error('Error WebSocket:', error);
    };
}

function updateEsp32Status(status) {
    const icon = document.getElementById('esp32StatusIcon');
    const text = document.getElementById('esp32StatusText');
    const detail = document.getElementById('esp32StatusDetail');
    const systemState = document.getElementById('systemState');
    
    if (status.connected) {
        icon.className = 'status-icon connected';
        text.textContent = 'Conectado';
        text.style.color = '#22c55e';
        detail.textContent = `IP: ${status.ip || 'Desconocida'}`;
        systemState.textContent = status.systemState || '--';
    } else {
        icon.className = 'status-icon disconnected';
        text.textContent = 'Desconectado';
        text.style.color = '#ef4444';
        detail.textContent = 'Esperando datos del ESP32...';
        systemState.textContent = '--';
    }
}

function processReading(data) {
    const timestamp = new Date(data.timestamp || Date.now());
    
    updateSensorDisplay('co', data.co);
    updateSensorDisplay('hc', data.hc);
    
    if (data.avgCO && data.avgCO > 0) document.getElementById('avgCO').textContent = data.avgCO.toFixed(1);
    if (data.avgHC && data.avgHC > 0) document.getElementById('avgHC').textContent = data.avgHC.toFixed(1);
    
    const reading = {
        id: ++state.readingCount,
        timestamp: timestamp,
        co: data.co,
        hc: data.hc,
        coStatus: getStatus('co', data.co),
        hcStatus: getStatus('hc', data.hc)
    };
    
    state.readings.push(reading);
    if (state.readings.length > 100) state.readings.shift();
    
    addToHistory(reading);
    
    document.getElementById('lastUpdate').textContent = formatTime(timestamp);
    document.getElementById('readingCount').textContent = state.readings.length;
}

function updateSensorDisplay(sensor, value) {
    const valueEl = document.getElementById(`${sensor}Value`);
    const statusEl = document.getElementById(`${sensor}Status`);
    const levelEl = document.getElementById(`${sensor}Level`);
    
    valueEl.textContent = value.toFixed(1);
    
    const status = getStatus(sensor, value);
    statusEl.textContent = status.text;
    statusEl.className = `level-status ${status.class}`;
    
    const percentage = Math.min((value / THRESHOLDS[sensor].max) * 100, 100);
    levelEl.style.width = `${percentage}%`;
    levelEl.className = `level-fill ${status.class}`;
}

function getStatus(sensor, value) {
    const t = THRESHOLDS[sensor];
    if (value <= t.normal) return { text: 'Normal', class: 'normal' };
    if (value <= t.warning) return { text: 'Precaución', class: 'warning' };
    return { text: 'Peligro', class: 'danger' };
}

function addToHistory(reading) {
    const tbody = document.getElementById('historyBody');
    if (tbody.querySelector('.empty-history')) tbody.innerHTML = '';
    
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${reading.id}</td>
        <td>${formatTime(reading.timestamp)}</td>
        <td>${reading.co.toFixed(1)}</td>
        <td>${reading.hc.toFixed(1)}</td>
        <td><span class="level-status ${reading.coStatus.class}">${reading.coStatus.text}</span></td>
        <td><span class="level-status ${reading.hcStatus.class}">${reading.hcStatus.text}</span></td>
    `;
    
    tbody.insertBefore(row, tbody.firstChild);
    while (tbody.children.length > 100) tbody.removeChild(tbody.lastChild);
}

async function loadHistory() {
    try {
        const response = await fetch(`${API_URL}/readings/history`);
        const data = await response.json();
        if (data.success && data.readings.length > 0) {
            data.readings.reverse().forEach(r => {
                processReading({
                    co: r.co_value,
                    hc: r.hc_value,
                    timestamp: r.timestamp
                });
            });
        }
    } catch (error) {
        console.log('Error cargando historial');
    }
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function togglePause() {
    state.isPaused = !state.isPaused;
    const btn = document.getElementById('pauseBtn');
    const icon = document.getElementById('pauseIcon');
    const text = document.getElementById('pauseText');
    
    if (state.isPaused) {
        icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
        text.textContent = 'Reanudar';
        btn.classList.add('btn-primary');
    } else {
        icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        text.textContent = 'Pausar';
        btn.classList.remove('btn-primary');
    }
}

async function clearReadings() {
    if (state.readings.length === 0) return;
    if (!confirm('¿Limpiar todo el historial?')) return;
    
    try {
        await fetch(`${API_URL}/readings`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.authToken}` }
        });
    } catch (e) {}
    
    state.readings = [];
    state.readingCount = 0;
    document.getElementById('historyBody').innerHTML = '<tr><td colspan="6" class="empty-history">Esperando datos del ESP32...</td></tr>';
    document.getElementById('readingCount').textContent = '0';
    document.getElementById('coValue').textContent = '---';
    document.getElementById('hcValue').textContent = '---';
    document.getElementById('coStatus').className = 'level-status';
    document.getElementById('hcStatus').className = 'level-status';
    document.getElementById('coStatus').textContent = 'Sin Datos';
    document.getElementById('hcStatus').textContent = 'Sin Datos';
    document.getElementById('coLevel').style.width = '0%';
    document.getElementById('hcLevel').style.width = '0%';
}

function generatePdf() {
    document.getElementById('pdfModal').classList.remove('active');
    if (state.readings.length === 0) { alert('No hay datos'); return; }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('Reporte de Monitoreo de Gases', 20, 20);
    
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 20, 30);
    doc.text(`Usuario: ${state.currentUser?.name || 'N/A'}`, 20, 36);
    doc.text(`Total lecturas: ${state.readings.length}`, 20, 42);
    
    const coVals = state.readings.map(r => r.co);
    const hcVals = state.readings.map(r => r.hc);
    
    doc.setFontSize(12);
    doc.text('Estadísticas CO:', 20, 55);
    doc.setFontSize(10);
    doc.text(`Min: ${Math.min(...coVals).toFixed(1)} | Max: ${Math.max(...coVals).toFixed(1)} | Prom: ${(coVals.reduce((a,b)=>a+b,0)/coVals.length).toFixed(1)}`, 25, 62);
    
    doc.setFontSize(12);
    doc.text('Estadísticas HC:', 20, 75);
    doc.setFontSize(10);
    doc.text(`Min: ${Math.min(...hcVals).toFixed(1)} | Max: ${Math.max(...hcVals).toFixed(1)} | Prom: ${(hcVals.reduce((a,b)=>a+b,0)/hcVals.length).toFixed(1)}`, 25, 82);
    
    let y = 100;
    doc.setFontSize(9);
    doc.text('#', 20, y); doc.text('Hora', 35, y); doc.text('CO', 70, y); doc.text('HC', 95, y); doc.text('Est.CO', 120, y); doc.text('Est.HC', 155, y);
    
    y += 8;
    state.readings.slice(-40).forEach(r => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(String(r.id), 20, y);
        doc.text(formatTime(r.timestamp), 35, y);
        doc.text(r.co.toFixed(1), 70, y);
        doc.text(r.hc.toFixed(1), 95, y);
        doc.text(r.coStatus.text, 120, y);
        doc.text(r.hcStatus.text, 155, y);
        y += 6;
    });
    
    doc.save(`reporte-gases-${Date.now()}.pdf`);
}
