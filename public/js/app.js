// ESTADO GLOBAL
let ws = null;
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let readings = [];
let isPaused = false;
let readingCounter = 0;

// ELEMENTOS DEL DOM
const $ = id => document.getElementById(id);

const elements = {
    loginOverlay: $('loginOverlay'),
    appContainer: $('appContainer'),
    loginForm: $('loginForm'),
    loginError: $('loginError'),
    username: $('username'),
    password: $('password'),
    currentUser: $('currentUser'),
    userRole: $('userRole'),
    logoutBtn: $('logoutBtn'),
    adminBtn: $('adminBtn'),
    
    esp32StatusIcon: $('esp32StatusIcon'),
    esp32StatusText: $('esp32StatusText'),
    esp32StatusDetail: $('esp32StatusDetail'),
    systemState: $('systemState'),
    lastUpdate: $('lastUpdate'),
    wsStatus: $('wsStatus'),
    
    coValue: $('coValue'),
    hcValue: $('hcValue'),
    coStatus: $('coStatus'),
    hcStatus: $('hcStatus'),
    coLevel: $('coLevel'),
    hcLevel: $('hcLevel'),
    avgCO: $('avgCO'),
    avgHC: $('avgHC'),
    
    pauseBtn: $('pauseBtn'),
    pauseText: $('pauseText'),
    pauseIcon: $('pauseIcon'),
    clearBtn: $('clearBtn'),
    pdfBtn: $('pdfBtn'),
    readingCount: $('readingCount'),
    historyBody: $('historyBody'),
    
    pdfModal: $('pdfModal'),
    cancelPdfBtn: $('cancelPdfBtn'),
    confirmPdfBtn: $('confirmPdfBtn'),
    
    adminModal: $('adminModal'),
    closeAdminModal: $('closeAdminModal'),
    addUserBtn: $('addUserBtn'),
    usersTableBody: $('usersTableBody'),
    
    userFormModal: $('userFormModal'),
    closeUserFormModal: $('closeUserFormModal'),
    userFormTitle: $('userFormTitle'),
    userForm: $('userForm'),
    editUserId: $('editUserId'),
    userFormName: $('userFormName'),
    userFormUsername: $('userFormUsername'),
    userFormEmail: $('userFormEmail'),
    userFormPassword: $('userFormPassword'),
    userFormRole: $('userFormRole'),
    userFormError: $('userFormError'),
    cancelUserForm: $('cancelUserForm'),
    passwordHint: $('passwordHint'),
    
    deleteModal: $('deleteModal'),
    deleteUserName: $('deleteUserName'),
    deleteUserId: $('deleteUserId'),
    cancelDeleteBtn: $('cancelDeleteBtn'),
    confirmDeleteBtn: $('confirmDeleteBtn')
};

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        verifyToken();
    } else {
        showLogin();
    }
    setupEventListeners();
});

function setupEventListeners() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.logoutBtn.addEventListener('click', handleLogout);
    
    elements.pauseBtn.addEventListener('click', togglePause);
    elements.clearBtn.addEventListener('click', clearHistory);
    elements.pdfBtn.addEventListener('click', () => elements.pdfModal.classList.add('active'));
    elements.cancelPdfBtn.addEventListener('click', () => elements.pdfModal.classList.remove('active'));
    elements.confirmPdfBtn.addEventListener('click', generatePDF);
    
    elements.adminBtn.addEventListener('click', openAdminModal);
    elements.closeAdminModal.addEventListener('click', () => elements.adminModal.classList.remove('active'));
    elements.addUserBtn.addEventListener('click', () => openUserForm());
    
    elements.closeUserFormModal.addEventListener('click', () => elements.userFormModal.classList.remove('active'));
    elements.cancelUserForm.addEventListener('click', () => elements.userFormModal.classList.remove('active'));
    elements.userForm.addEventListener('submit', handleUserFormSubmit);
    
    elements.cancelDeleteBtn.addEventListener('click', () => elements.deleteModal.classList.remove('active'));
    elements.confirmDeleteBtn.addEventListener('click', handleDeleteUser);
    
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });
}

// AUTENTICACIÓN
async function verifyToken() {
    try {
        const res = await fetch('/api/auth/verify', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        
        if (data.success) {
            currentUser = data.user;
            showApp();
        } else {
            throw new Error('Token inválido');
        }
    } catch (error) {
        localStorage.removeItem('authToken');
        authToken = null;
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    elements.loginError.textContent = '';
    
    const username = elements.username.value.trim();
    const password = elements.password.value;
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showApp();
        } else {
            elements.loginError.textContent = data.message || 'Error al iniciar sesión';
        }
    } catch (error) {
        elements.loginError.textContent = 'Error de conexión';
    }
}

function handleLogout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    if (ws) ws.close();
    showLogin();
}

function showLogin() {
    elements.loginOverlay.style.display = 'flex';
    elements.appContainer.style.display = 'none';
    elements.username.value = '';
    elements.password.value = '';
}

function showApp() {
    elements.loginOverlay.style.display = 'none';
    elements.appContainer.style.display = 'block';
    elements.currentUser.textContent = currentUser.name;
    
    elements.userRole.textContent = currentUser.role === 'admin' ? 'Admin' : 'Usuario';
    elements.userRole.className = 'user-role ' + currentUser.role;
    
    elements.adminBtn.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none';
    
    connectWebSocket();
    loadHistory();
}

// WEBSOCKET
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);
    
    ws.onopen = () => {
        elements.wsStatus.textContent = 'Conectado';
        elements.wsStatus.style.color = '#22c55e';
    };
    
    ws.onclose = () => {
        elements.wsStatus.textContent = 'Desconectado';
        elements.wsStatus.style.color = '#ef4444';
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = () => {
        elements.wsStatus.textContent = 'Error';
        elements.wsStatus.style.color = '#ef4444';
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
            case 'init':
                if (message.esp32Status) updateESP32Status(message.esp32Status);
                if (message.latestReading) updateSensorDisplay(message.latestReading);
                break;
            case 'reading':
                if (!isPaused) {
                    updateSensorDisplay(message.data);
                    addToHistory(message.data);
                }
                if (message.esp32Status) updateESP32Status(message.esp32Status);
                break;
            case 'esp32_status':
                updateESP32Status(message);
                break;
        }
    };
}

// ACTUALIZAR UI
function updateESP32Status(status) {
    const connected = status.connected;
    
    elements.esp32StatusIcon.className = 'status-icon ' + (connected ? 'connected' : 'disconnected');
    elements.esp32StatusText.textContent = connected ? 'Conectado' : 'Desconectado';
    elements.esp32StatusText.style.color = connected ? '#22c55e' : '#ef4444';
    elements.esp32StatusDetail.textContent = connected ? 
        `IP: ${status.ip || 'N/A'}` : 'Esperando datos del ESP32...';
    elements.systemState.textContent = status.systemState || '--';
}

function updateSensorDisplay(data) {
    if (!data) return;
    
    elements.coValue.textContent = data.co?.toFixed(1) || '---';
    elements.coStatus.textContent = data.co_status || 'Sin Datos';
    elements.coStatus.className = 'level-status ' + getStatusClass(data.co_status);
    elements.coLevel.style.width = `${Math.min((data.co / 1000) * 100, 100)}%`;
    elements.coLevel.className = 'level-fill ' + getStatusClass(data.co_status);
    
    elements.hcValue.textContent = data.hc?.toFixed(1) || '---';
    elements.hcStatus.textContent = data.hc_status || 'Sin Datos';
    elements.hcStatus.className = 'level-status ' + getStatusClass(data.hc_status);
    elements.hcLevel.style.width = `${Math.min((data.hc / 1000) * 100, 100)}%`;
    elements.hcLevel.className = 'level-fill ' + getStatusClass(data.hc_status);
    
    if (data.avgCO !== undefined) elements.avgCO.textContent = data.avgCO.toFixed(1);
    if (data.avgHC !== undefined) elements.avgHC.textContent = data.avgHC.toFixed(1);
    
    elements.lastUpdate.textContent = new Date(data.timestamp).toLocaleTimeString('es-MX');
}

function getStatusClass(status) {
    switch (status?.toLowerCase()) {
        case 'normal': return 'normal';
        case 'precaución': return 'warning';
        case 'peligro': return 'danger';
        default: return '';
    }
}

function addToHistory(data) {
    readingCounter++;
    readings.unshift({ ...data, num: readingCounter });
    if (readings.length > 100) readings.pop();
    elements.readingCount.textContent = readingCounter;
    renderHistory();
}

async function loadHistory() {
    try {
        const res = await fetch('/api/readings/history');
        const data = await res.json();
        if (data.success && data.readings) {
            readings = data.readings.map((r, i) => ({ ...r, num: data.readings.length - i }));
            readingCounter = readings.length;
            elements.readingCount.textContent = readingCounter;
            renderHistory();
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

function renderHistory() {
    if (readings.length === 0) {
        elements.historyBody.innerHTML = '<tr><td colspan="6" class="empty-history">Esperando datos del ESP32...</td></tr>';
        return;
    }
    
    const html = readings.slice(0, 50).map((r, i) => `
        <tr>
            <td>${readings.length - i}</td>
            <td>${new Date(r.timestamp).toLocaleTimeString('es-MX')}</td>
            <td>${r.co?.toFixed(1) || r.co_value || '--'}</td>
            <td>${r.hc?.toFixed(1) || r.hc_value || '--'}</td>
            <td><span class="level-status ${getStatusClass(r.co_status)}">${r.co_status || '--'}</span></td>
            <td><span class="level-status ${getStatusClass(r.hc_status)}">${r.hc_status || '--'}</span></td>
        </tr>
    `).join('');
    
    elements.historyBody.innerHTML = html;
}

// CONTROLES
function togglePause() {
    isPaused = !isPaused;
    elements.pauseText.textContent = isPaused ? 'Reanudar' : 'Pausar';
    elements.pauseIcon.innerHTML = isPaused ? 
        '<polygon points="5 3 19 12 5 21 5 3"/>' : 
        '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

async function clearHistory() {
    if (!confirm('¿Estás seguro de limpiar el historial?')) return;
    
    try {
        await fetch('/api/readings', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        readings = [];
        readingCounter = 0;
        elements.readingCount.textContent = '0';
        renderHistory();
    } catch (error) {
        alert('Error al limpiar historial');
    }
}

// PDF
function generatePDF() {
    elements.pdfModal.classList.remove('active');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Reporte de Monitoreo de Gases', 20, 20);
    
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 20, 30);
    doc.text(`Usuario: ${currentUser.name}`, 20, 36);
    doc.text(`Total de lecturas: ${readings.length}`, 20, 42);
    
    let y = 55;
    doc.setFontSize(10);
    doc.text('#', 20, y);
    doc.text('Hora', 35, y);
    doc.text('CO', 70, y);
    doc.text('HC', 95, y);
    doc.text('Estado CO', 120, y);
    doc.text('Estado HC', 160, y);
    
    y += 7;
    doc.setFontSize(9);
    
    readings.slice(0, 40).forEach((r, i) => {
        if (y > 280) {
            doc.addPage();
            y = 20;
        }
        doc.text(String(i + 1), 20, y);
        doc.text(new Date(r.timestamp).toLocaleTimeString('es-MX'), 35, y);
        doc.text(String(r.co?.toFixed(1) || r.co_value || '--'), 70, y);
        doc.text(String(r.hc?.toFixed(1) || r.hc_value || '--'), 95, y);
        doc.text(r.co_status || '--', 120, y);
        doc.text(r.hc_status || '--', 160, y);
        y += 6;
    });
    
    doc.save(`reporte_gases_${Date.now()}.pdf`);
}

// ADMINISTRACIÓN DE USUARIOS
async function openAdminModal() {
    elements.adminModal.classList.add('active');
    await loadUsers();
}

async function loadUsers() {
    try {
        elements.usersTableBody.innerHTML = '<tr><td colspan="6" class="empty-history">Cargando usuarios...</td></tr>';
        
        const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await res.json();
        
        if (data.success) {
            renderUsersTable(data.users);
        } else {
            elements.usersTableBody.innerHTML = '<tr><td colspan="6" class="empty-history">Error al cargar usuarios</td></tr>';
        }
    } catch (error) {
        elements.usersTableBody.innerHTML = '<tr><td colspan="6" class="empty-history">Error de conexión</td></tr>';
    }
}

function renderUsersTable(users) {
    if (users.length === 0) {
        elements.usersTableBody.innerHTML = '<tr><td colspan="6" class="empty-history">No hay usuarios</td></tr>';
        return;
    }
    
    const html = users.map(user => `
        <tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="user-role ${user.role}">${user.role === 'admin' ? 'Admin' : 'Usuario'}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-small btn-warning" onclick="openUserForm(${user.id}, '${user.username}', '${user.name}', '${user.email}', '${user.role}')">Editar</button>
                    ${user.username !== 'admin' ? `<button class="btn btn-small btn-danger" onclick="openDeleteModal(${user.id}, '${user.username}')">Eliminar</button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
    
    elements.usersTableBody.innerHTML = html;
}

function openUserForm(id = null, username = '', name = '', email = '', role = 'user') {
    elements.userFormModal.classList.add('active');
    elements.userFormError.textContent = '';
    
    if (id) {
        elements.userFormTitle.textContent = 'Editar Usuario';
        elements.editUserId.value = id;
        elements.userFormName.value = name;
        elements.userFormUsername.value = username;
        elements.userFormEmail.value = email;
        elements.userFormRole.value = role;
        elements.userFormPassword.value = '';
        elements.userFormPassword.required = false;
        elements.passwordHint.textContent = '(dejar vacío para mantener actual)';
    } else {
        elements.userFormTitle.textContent = 'Nuevo Usuario';
        elements.editUserId.value = '';
        elements.userFormName.value = '';
        elements.userFormUsername.value = '';
        elements.userFormEmail.value = '';
        elements.userFormRole.value = 'user';
        elements.userFormPassword.value = '';
        elements.userFormPassword.required = true;
        elements.passwordHint.textContent = '(mínimo 8 caracteres)';
    }
}

async function handleUserFormSubmit(e) {
    e.preventDefault();
    elements.userFormError.textContent = '';
    
    const userId = elements.editUserId.value;
    const userData = {
        name: elements.userFormName.value.trim(),
        username: elements.userFormUsername.value.trim(),
        email: elements.userFormEmail.value.trim(),
        role: elements.userFormRole.value
    };
    
    const password = elements.userFormPassword.value;
    if (password) {
        if (password.length < 8) {
            elements.userFormError.textContent = 'La contraseña debe tener mínimo 8 caracteres';
            return;
        }
        userData.password = password;
    } else if (!userId) {
        elements.userFormError.textContent = 'La contraseña es requerida para nuevos usuarios';
        return;
    }
    
    try {
        const url = userId ? `/api/admin/users/${userId}` : '/api/admin/users';
        const method = userId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(userData)
        });
        
        const data = await res.json();
        
        if (data.success) {
            elements.userFormModal.classList.remove('active');
            await loadUsers();
        } else {
            elements.userFormError.textContent = data.message || 'Error al guardar usuario';
        }
    } catch (error) {
        elements.userFormError.textContent = 'Error de conexión';
    }
}

function openDeleteModal(id, username) {
    elements.deleteModal.classList.add('active');
    elements.deleteUserId.value = id;
    elements.deleteUserName.textContent = username;
}

async function handleDeleteUser() {
    const userId = elements.deleteUserId.value;
    
    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await res.json();
        
        if (data.success) {
            elements.deleteModal.classList.remove('active');
            await loadUsers();
        } else {
            alert(data.message || 'Error al eliminar usuario');
        }
    } catch (error) {
        alert('Error de conexión');
    }
}
