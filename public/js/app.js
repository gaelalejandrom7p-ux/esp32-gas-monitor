// =====================
// ESTADO GLOBAL
// =====================
let ws = null;
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let readings = [];
let isPaused = false;
let readingCounter = 0;
let catalogoVehiculos = {};
let vehiculoSeleccionado = null;
let currentStep = 1;

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
    seccionMonitoreo: $('seccionMonitoreo'),
    seccionVehiculos: $('seccionVehiculos'),
    seccionHistorial: $('seccionHistorial'),
    vehiculoActivo: $('vehiculoActivo'),
    vehiculoActivoText: $('vehiculoActivoText'),
    deseleccionarVehiculo: $('deseleccionarVehiculo'),
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
    confirmDeleteBtn: $('confirmDeleteBtn'),
    buscarPlacas: $('buscarPlacas'),
    btnBuscarVehiculo: $('btnBuscarVehiculo'),
    btnNuevoVehiculo: $('btnNuevoVehiculo'),
    btnCancelarForm: $('btnCancelarForm'),
    vehicleFormContainer: $('vehicleFormContainer'),
    vehiculoForm: $('vehiculoForm'),
    vehiculoId: $('vehiculoId'),
    vehiclesGrid: $('vehiclesGrid'),
    vehiclesList: $('vehiclesList'),
    vPlacas: $('vPlacas'),
    vVin: $('vVin'),
    vMarca: $('vMarca'),
    vSubmarca: $('vSubmarca'),
    vLinea: $('vLinea'),
    vAnio: $('vAnio'),
    vPropietarioNombre: $('vPropietarioNombre'),
    vPropietarioTelefono: $('vPropietarioTelefono'),
    vPropietarioDomicilio: $('vPropietarioDomicilio'),
    vServicio: $('vServicio'),
    vBaseConcesionaria: $('vBaseConcesionaria'),
    vCombustible: $('vCombustible'),
    vCilindros: $('vCilindros'),
    vCilindrada: $('vCilindrada'),
    vCarroceria: $('vCarroceria'),
    vClase: $('vClase'),
    vTraccion: $('vTraccion'),
    vPeso: $('vPeso'),
    vTarjeta: $('vTarjeta'),
    vOdometro: $('vOdometro'),
    vFolioAnterior: $('vFolioAnterior'),
    vVigencia: $('vVigencia'),
    vTieneMulta: $('vTieneMulta'),
    vFechaMulta: $('vFechaMulta'),
    vFolioMulta: $('vFolioMulta'),
    vObservaciones: $('vObservaciones'),
    selectVehicleModal: $('selectVehicleModal'),
    vehiclePreview: $('vehiclePreview'),
    selectVehicleId: $('selectVehicleId'),
    cancelSelectVehicle: $('cancelSelectVehicle'),
    confirmSelectVehicle: $('confirmSelectVehicle'),
    filtroVehiculo: $('filtroVehiculo'),
    btnFiltrarHistorial: $('btnFiltrarHistorial'),
    historialCompleto: $('historialCompleto')
};

document.addEventListener('DOMContentLoaded', () => {
    if (authToken) verifyToken();
    else showLogin();
    setupEventListeners();
    loadCatalogo();
    populateYears();
});

function setupEventListeners() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.logoutBtn.addEventListener('click', handleLogout);
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchSection(btn.dataset.section));
    });
    
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
    
    elements.btnBuscarVehiculo.addEventListener('click', buscarVehiculo);
    elements.buscarPlacas.addEventListener('keypress', (e) => { if (e.key === 'Enter') buscarVehiculo(); });
    elements.btnNuevoVehiculo.addEventListener('click', mostrarFormularioNuevo);
    elements.btnCancelarForm.addEventListener('click', ocultarFormulario);
    elements.vehiculoForm.addEventListener('submit', handleVehiculoSubmit);
    elements.vMarca.addEventListener('change', actualizarSubmarcas);
    elements.vTieneMulta.addEventListener('change', toggleMultaFields);
    elements.vServicio.addEventListener('change', toggleConcesionariaField);
    
    document.querySelectorAll('.btn-next').forEach(btn => {
        btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.next)));
    });
    document.querySelectorAll('.btn-prev').forEach(btn => {
        btn.addEventListener('click', () => goToStep(parseInt(btn.dataset.prev)));
    });
    
    elements.deseleccionarVehiculo.addEventListener('click', deseleccionarVehiculo);
    elements.cancelSelectVehicle.addEventListener('click', () => elements.selectVehicleModal.classList.remove('active'));
    elements.confirmSelectVehicle.addEventListener('click', confirmarSeleccionVehiculo);
    
    elements.btnFiltrarHistorial.addEventListener('click', filtrarHistorial);
    
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });
}

function switchSection(section) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.nav-btn[data-section="${section}"]`).classList.add('active');
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    
    switch(section) {
        case 'monitoreo': elements.seccionMonitoreo.classList.add('active'); break;
        case 'vehiculos': elements.seccionVehiculos.classList.add('active'); loadVehiculos(); break;
        case 'historial': elements.seccionHistorial.classList.add('active'); loadVehiculosParaFiltro(); break;
    }
}

async function verifyToken() {
    try {
        const res = await fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) { currentUser = data.user; showApp(); }
        else throw new Error('Token inválido');
    } catch (error) {
        localStorage.removeItem('authToken');
        authToken = null;
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    elements.loginError.textContent = '';
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: elements.username.value.trim(), password: elements.password.value })
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
    loadVehiculos();
}

function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);
    
    ws.onopen = () => { elements.wsStatus.textContent = 'Conectado'; elements.wsStatus.style.color = '#22c55e'; };
    ws.onclose = () => { elements.wsStatus.textContent = 'Desconectado'; elements.wsStatus.style.color = '#ef4444'; setTimeout(connectWebSocket, 3000); };
    ws.onerror = () => { elements.wsStatus.textContent = 'Error'; elements.wsStatus.style.color = '#ef4444'; };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        switch (message.type) {
            case 'init':
                if (message.esp32Status) updateESP32Status(message.esp32Status);
                if (message.latestReading) updateSensorDisplay(message.latestReading);
                if (message.currentVehicleId) loadVehiculoActivo(message.currentVehicleId);
                break;
            case 'reading':
                if (!isPaused) { updateSensorDisplay(message.data); addToHistory(message.data); }
                if (message.esp32Status) updateESP32Status(message.esp32Status);
                break;
            case 'esp32_status': updateESP32Status(message); break;
            case 'vehiculo_seleccionado': mostrarVehiculoActivo(message.vehiculo); break;
            case 'vehiculo_deseleccionado': ocultarVehiculoActivo(); break;
        }
    };
}

function updateESP32Status(status) {
    const connected = status.connected;
    elements.esp32StatusIcon.className = 'status-icon ' + (connected ? 'connected' : 'disconnected');
    elements.esp32StatusText.textContent = connected ? 'Conectado' : 'Desconectado';
    elements.esp32StatusText.style.color = connected ? '#22c55e' : '#ef4444';
    elements.esp32StatusDetail.textContent = connected ? `IP: ${status.ip || 'N/A'}` : 'Esperando datos del ESP32...';
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
    } catch (error) { console.error('Error loading history:', error); }
}

function renderHistory() {
    if (readings.length === 0) {
        elements.historyBody.innerHTML = '<tr><td colspan="6" class="empty-history">Esperando datos del ESP32...</td></tr>';
        return;
    }
    elements.historyBody.innerHTML = readings.slice(0, 50).map((r, i) => `
        <tr>
            <td>${readings.length - i}</td>
            <td>${new Date(r.timestamp).toLocaleTimeString('es-MX')}</td>
            <td>${r.co?.toFixed(1) || r.co_value || '--'}</td>
            <td>${r.hc?.toFixed(1) || r.hc_value || '--'}</td>
            <td><span class="level-status ${getStatusClass(r.co_status)}">${r.co_status || '--'}</span></td>
            <td><span class="level-status ${getStatusClass(r.hc_status)}">${r.hc_status || '--'}</span></td>
        </tr>
    `).join('');
}

function togglePause() {
    isPaused = !isPaused;
    elements.pauseText.textContent = isPaused ? 'Reanudar' : 'Pausar';
    elements.pauseIcon.innerHTML = isPaused ? '<polygon points="5 3 19 12 5 21 5 3"/>' : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

async function clearHistory() {
    if (!confirm('¿Estás seguro de limpiar el historial?')) return;
    try {
        await fetch('/api/readings', { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` } });
        readings = [];
        readingCounter = 0;
        elements.readingCount.textContent = '0';
        renderHistory();
    } catch (error) { alert('Error al limpiar historial'); }
}

function generatePDF() {
    elements.pdfModal.classList.remove('active');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Reporte de Monitoreo de Gases', 20, 20);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 20, 30);
    doc.text(`Usuario: ${currentUser.name}`, 20, 36);
    if (vehiculoSeleccionado) {
        doc.text(`Vehículo: ${vehiculoSeleccionado.placas} - ${vehiculoSeleccionado.marca} ${vehiculoSeleccionado.submarca || ''}`, 20, 42);
        doc.text(`Propietario: ${vehiculoSeleccionado.propietario_nombre || 'N/A'}`, 20, 48);
    }
    doc.text(`Total de lecturas: ${readings.length}`, 20, 54);
    let y = 65;
    doc.setFontSize(10);
    doc.text('#', 20, y); doc.text('Hora', 35, y); doc.text('CO', 70, y); doc.text('HC', 95, y); doc.text('Estado CO', 120, y); doc.text('Estado HC', 160, y);
    y += 7;
    doc.setFontSize(9);
    readings.slice(0, 40).forEach((r, i) => {
        if (y > 280) { doc.addPage(); y = 20; }
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

async function loadCatalogo() {
    try {
        const res = await fetch('/api/vehiculos/catalogo');
        const data = await res.json();
        if (data.success) { catalogoVehiculos = data.catalogo; populateMarcas(); }
    } catch (error) { console.error('Error cargando catálogo:', error); }
}

function populateMarcas() {
    const marcas = Object.keys(catalogoVehiculos).sort();
    elements.vMarca.innerHTML = '<option value="">Selecciona una Marca</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');
}

function actualizarSubmarcas() {
    const marca = elements.vMarca.value;
    if (!marca || !catalogoVehiculos[marca]) { elements.vSubmarca.innerHTML = '<option value="">Primero selecciona Marca</option>'; return; }
    const modelos = catalogoVehiculos[marca];
    elements.vSubmarca.innerHTML = '<option value="">Selecciona Modelo</option>' + modelos.map(m => `<option value="${m}">${m}</option>`).join('');
}

function populateYears() {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear + 1; y >= 1990; y--) years.push(y);
    elements.vAnio.innerHTML = '<option value="">Selecciona Año</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
}

function toggleMultaFields() {
    const tieneMulta = elements.vTieneMulta.checked;
    document.querySelectorAll('.multa-fields').forEach(el => { el.style.display = tieneMulta ? 'block' : 'none'; });
}

function toggleConcesionariaField() {
    const servicio = elements.vServicio.value;
    const concesionariaField = document.querySelector('.concesionaria-field');
    if (servicio === 'Público') { concesionariaField.style.display = 'block'; elements.vBaseConcesionaria.required = true; }
    else { concesionariaField.style.display = 'none'; elements.vBaseConcesionaria.required = false; elements.vBaseConcesionaria.value = ''; }
}

async function loadVehiculos() {
    try {
        const res = await fetch('/api/vehiculos', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) renderVehiculos(data.vehiculos);
    } catch (error) { elements.vehiclesGrid.innerHTML = '<p class="empty-message">Error al cargar vehículos</p>'; }
}

function renderVehiculos(vehiculos) {
    if (vehiculos.length === 0) { elements.vehiclesGrid.innerHTML = '<p class="empty-message">No hay vehículos registrados. Haga clic en "Nuevo" para agregar uno.</p>'; return; }
    elements.vehiclesGrid.innerHTML = vehiculos.map(v => `
        <div class="vehicle-card">
            <div class="vehicle-card-header">
                <div>
                    <div class="vehicle-card-title">${v.marca} ${v.submarca || ''}</div>
                    <div class="vehicle-card-subtitle">${v.linea || ''} ${v.anio || ''}</div>
                </div>
                <span class="vehicle-card-placas">${v.placas}</span>
            </div>
            <div class="vehicle-card-owner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${v.propietario_nombre || 'Sin propietario'}
                <span class="vehicle-card-badge ${v.tipo_servicio === 'Público' ? 'publico' : 'particular'}">${v.tipo_servicio || 'N/A'}</span>
            </div>
            <div class="vehicle-card-details">
                <div class="vehicle-detail"><span class="vehicle-detail-label">Combustible:</span> <span class="vehicle-detail-value">${v.tipo_combustible || 'N/A'}</span></div>
                <div class="vehicle-detail"><span class="vehicle-detail-label">Cilindros:</span> <span class="vehicle-detail-value">${v.num_cilindros || 'N/A'}</span></div>
            </div>
            <div class="vehicle-card-stats">
                <div class="vehicle-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>${v.total_lecturas || 0} lecturas</div>
            </div>
            <div class="vehicle-card-actions">
                <button class="btn btn-primary btn-small" onclick="abrirModalSeleccion(${v.id}, '${v.placas}', '${v.marca}', '${v.submarca || ''}', '${v.propietario_nombre || ''}')">Iniciar Prueba</button>
                <button class="btn btn-small" onclick="editarVehiculo(${v.id})">Editar</button>
            </div>
        </div>
    `).join('');
}

async function buscarVehiculo() {
    const placas = elements.buscarPlacas.value.trim();
    if (!placas) { alert('Ingresa las placas a buscar'); return; }
    try {
        const res = await fetch(`/api/vehiculos/buscar/${encodeURIComponent(placas)}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) { llenarFormularioVehiculo(data.vehiculo); elements.vehicleFormContainer.style.display = 'block'; elements.vehiclesList.style.display = 'none'; }
        else { if (confirm('Vehículo no encontrado. ¿Desea registrarlo?')) { mostrarFormularioNuevo(); elements.vPlacas.value = placas.toUpperCase(); } }
    } catch (error) { alert('Error al buscar vehículo'); }
}

function mostrarFormularioNuevo() {
    elements.vehiculoForm.reset();
    elements.vehiculoId.value = '';
    elements.vehicleFormContainer.style.display = 'block';
    elements.vehiclesList.style.display = 'none';
    toggleConcesionariaField();
    toggleMultaFields();
    goToStep(1);
}

function ocultarFormulario() {
    elements.vehicleFormContainer.style.display = 'none';
    elements.vehiclesList.style.display = 'block';
    elements.vehiculoForm.reset();
}

function llenarFormularioVehiculo(v) {
    elements.vehiculoId.value = v.id || '';
    elements.vPlacas.value = v.placas || '';
    elements.vVin.value = v.vin || '';
    elements.vMarca.value = v.marca || '';
    actualizarSubmarcas();
    setTimeout(() => { elements.vSubmarca.value = v.submarca || ''; }, 100);
    elements.vLinea.value = v.linea || '';
    elements.vAnio.value = v.anio || '';
    elements.vPropietarioNombre.value = v.propietario_nombre || '';
    elements.vPropietarioTelefono.value = v.propietario_telefono || '';
    elements.vPropietarioDomicilio.value = v.propietario_domicilio || '';
    elements.vServicio.value = v.tipo_servicio || '';
    toggleConcesionariaField();
    elements.vBaseConcesionaria.value = v.base_concesionaria || '';
    elements.vCombustible.value = v.tipo_combustible || '';
    elements.vCilindros.value = v.num_cilindros || '';
    elements.vCilindrada.value = v.cilindrada || '';
    elements.vCarroceria.value = v.tipo_carroceria || '';
    elements.vClase.value = v.clase || '';
    elements.vTraccion.value = v.traccion || '';
    elements.vPeso.value = v.peso_bruto || '';
    elements.vTarjeta.value = v.tarjeta_circulacion || '';
    elements.vOdometro.value = v.lectura_odometro || '';
    elements.vFolioAnterior.value = v.folio_anterior || '';
    elements.vVigencia.value = v.vigencia_anterior ? v.vigencia_anterior.split('T')[0] : '';
    elements.vTieneMulta.checked = v.tiene_multa || false;
    toggleMultaFields();
    elements.vFechaMulta.value = v.fecha_pago_multa ? v.fecha_pago_multa.split('T')[0] : '';
    elements.vFolioMulta.value = v.folio_multa || '';
    elements.vObservaciones.value = v.observaciones || '';
    goToStep(1);
}

async function editarVehiculo(id) {
    try {
        const res = await fetch(`/api/vehiculos/${id}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) { llenarFormularioVehiculo(data.vehiculo); elements.vehicleFormContainer.style.display = 'block'; elements.vehiclesList.style.display = 'none'; }
    } catch (error) { alert('Error al cargar vehículo'); }
}

function goToStep(step) {
    currentStep = step;
    document.querySelectorAll('.steps-indicator .step').forEach(s => {
        const stepNum = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (stepNum === step) s.classList.add('active');
        else if (stepNum < step) s.classList.add('completed');
    });
    document.querySelectorAll('.form-step').forEach(s => {
        s.classList.remove('active');
        if (parseInt(s.dataset.step) === step) s.classList.add('active');
    });
}

async function handleVehiculoSubmit(e) {
    e.preventDefault();
    if (elements.vServicio.value === 'Público' && !elements.vBaseConcesionaria.value.trim()) { alert('La Base Concesionaria es requerida para vehículos de servicio público'); goToStep(2); return; }
    const vehiculoData = {
        placas: elements.vPlacas.value.trim(), vin: elements.vVin.value.trim(), marca: elements.vMarca.value, submarca: elements.vSubmarca.value, linea: elements.vLinea.value.trim(), anio: elements.vAnio.value ? parseInt(elements.vAnio.value) : null,
        propietario_nombre: elements.vPropietarioNombre.value.trim(), propietario_telefono: elements.vPropietarioTelefono.value.trim(), propietario_domicilio: elements.vPropietarioDomicilio.value.trim(), tipo_servicio: elements.vServicio.value, base_concesionaria: elements.vBaseConcesionaria.value.trim(),
        tipo_combustible: elements.vCombustible.value, num_cilindros: elements.vCilindros.value ? parseInt(elements.vCilindros.value) : null, cilindrada: elements.vCilindrada.value.trim(), tipo_carroceria: elements.vCarroceria.value, clase: elements.vClase.value, traccion: elements.vTraccion.value, peso_bruto: elements.vPeso.value.trim(), tarjeta_circulacion: elements.vTarjeta.value.trim(),
        lectura_odometro: elements.vOdometro.value.trim(), folio_anterior: elements.vFolioAnterior.value.trim(), vigencia_anterior: elements.vVigencia.value || null, tiene_multa: elements.vTieneMulta.checked, fecha_pago_multa: elements.vFechaMulta.value || null, folio_multa: elements.vFolioMulta.value.trim(), observaciones: elements.vObservaciones.value.trim()
    };
    const id = elements.vehiculoId.value;
    const url = id ? `/api/vehiculos/${id}` : '/api/vehiculos';
    const method = id ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify(vehiculoData) });
        const data = await res.json();
        if (data.success) { alert(id ? 'Vehículo actualizado correctamente' : 'Vehículo registrado correctamente'); ocultarFormulario(); loadVehiculos(); }
        else { alert(data.message || 'Error al guardar vehículo'); }
    } catch (error) { alert('Error de conexión'); }
}

function abrirModalSeleccion(id, placas, marca, submarca, propietario) {
    elements.selectVehicleId.value = id;
    elements.vehiclePreview.innerHTML = `<strong>${placas}</strong><br>${marca} ${submarca}<br><small style="color: #a3a3a3;">Propietario: ${propietario || 'N/A'}</small>`;
    elements.selectVehicleModal.classList.add('active');
}

async function confirmarSeleccionVehiculo() {
    const id = elements.selectVehicleId.value;
    try {
        const res = await fetch(`/api/vehiculos/seleccionar/${id}`, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) { elements.selectVehicleModal.classList.remove('active'); mostrarVehiculoActivo(data.vehiculo); switchSection('monitoreo'); }
        else { alert(data.message || 'Error al seleccionar vehículo'); }
    } catch (error) { alert('Error de conexión'); }
}

function mostrarVehiculoActivo(vehiculo) {
    vehiculoSeleccionado = vehiculo;
    elements.vehiculoActivoText.textContent = `${vehiculo.placas} - ${vehiculo.marca} ${vehiculo.submarca || ''} (${vehiculo.propietario_nombre || 'Sin propietario'})`;
    elements.vehiculoActivo.style.display = 'flex';
}

function ocultarVehiculoActivo() { vehiculoSeleccionado = null; elements.vehiculoActivo.style.display = 'none'; }

async function deseleccionarVehiculo() {
    if (!confirm('¿Desea terminar la prueba de este vehículo?')) return;
    try { await fetch('/api/vehiculos/deseleccionar', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` } }); ocultarVehiculoActivo(); }
    catch (error) { alert('Error al deseleccionar vehículo'); }
}

async function loadVehiculoActivo(id) {
    try {
        const res = await fetch(`/api/vehiculos/${id}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) mostrarVehiculoActivo(data.vehiculo);
    } catch (error) { console.error('Error loading vehículo activo:', error); }
}

async function loadVehiculosParaFiltro() {
    try {
        const res = await fetch('/api/vehiculos', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) { elements.filtroVehiculo.innerHTML = '<option value="">Todos los vehículos</option>' + data.vehiculos.map(v => `<option value="${v.id}">${v.placas} - ${v.marca} ${v.submarca || ''}</option>`).join(''); }
    } catch (error) { console.error('Error cargando vehículos para filtro:', error); }
}

async function filtrarHistorial() {
    const vehiculoId = elements.filtroVehiculo.value;
    try {
        const url = vehiculoId ? `/api/readings/history?vehiculo_id=${vehiculoId}` : '/api/readings/history';
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) renderHistorialCompleto(data.readings);
    } catch (error) { alert('Error al cargar historial'); }
}

function renderHistorialCompleto(lecturas) {
    if (lecturas.length === 0) { elements.historialCompleto.innerHTML = '<tr><td colspan="6" class="empty-history">No hay lecturas registradas</td></tr>'; return; }
    elements.historialCompleto.innerHTML = lecturas.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${r.placas || 'Sin vehículo'}</td>
            <td>${new Date(r.timestamp).toLocaleString('es-MX')}</td>
            <td>${parseFloat(r.co_value).toFixed(1)}</td>
            <td>${parseFloat(r.hc_value).toFixed(1)}</td>
            <td><span class="level-status ${getStatusClass(r.co_status)}">${r.co_status}</span></td>
        </tr>
    `).join('');
}

async function openAdminModal() { elements.adminModal.classList.add('active'); await loadUsers(); }

async function loadUsers() {
    try {
        const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) renderUsersTable(data.users);
    } catch (error) { elements.usersTableBody.innerHTML = '<tr><td colspan="6" class="empty-history">Error al cargar usuarios</td></tr>'; }
}

function renderUsersTable(users) {
    if (users.length === 0) { elements.usersTableBody.innerHTML = '<tr><td colspan="6" class="empty-history">No hay usuarios</td></tr>'; return; }
    elements.usersTableBody.innerHTML = users.map(user => `
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
    const userData = { name: elements.userFormName.value.trim(), username: elements.userFormUsername.value.trim(), email: elements.userFormEmail.value.trim(), role: elements.userFormRole.value };
    const password = elements.userFormPassword.value;
    if (password) { if (password.length < 8) { elements.userFormError.textContent = 'La contraseña debe tener mínimo 8 caracteres'; return; } userData.password = password; }
    else if (!userId) { elements.userFormError.textContent = 'La contraseña es requerida'; return; }
    try {
        const url = userId ? `/api/admin/users/${userId}` : '/api/admin/users';
        const method = userId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify(userData) });
        const data = await res.json();
        if (data.success) { elements.userFormModal.classList.remove('active'); await loadUsers(); }
        else { elements.userFormError.textContent = data.message || 'Error al guardar'; }
    } catch (error) { elements.userFormError.textContent = 'Error de conexión'; }
}

function openDeleteModal(id, username) { elements.deleteModal.classList.add('active'); elements.deleteUserId.value = id; elements.deleteUserName.textContent = username; }

async function handleDeleteUser() {
    const userId = elements.deleteUserId.value;
    try {
        const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.success) { elements.deleteModal.classList.remove('active'); await loadUsers(); }
        else { alert(data.message || 'Error al eliminar'); }
    } catch (error) { alert('Error de conexión'); }
}
