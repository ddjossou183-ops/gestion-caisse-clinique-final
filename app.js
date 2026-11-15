/* js/app.js - Clinique Medica Kpondéhou (offline) */
/* French UI. Requires CryptoJS and jsPDF (included in index.html). */

const LS_USERS = "ck_users";         // users: admin/hashes + cashiers (we'll store cashiers with hashed pass)
const LS_SERVICES = "ck_services";
const LS_INVOICES = "ck_invoices";
const LS_INVCOUNT = "ck_invcount";

// Default admin password: zomonnou (hashed for storage)
function sha256Hex(txt){ return CryptoJS.SHA256(txt).toString(); }

function load(key, fallback = []) { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

// Initialize storage and default admin
function initStorage(){
  let users = load(LS_USERS, []);
  // ensure admin exists (store as {username, passwordHash, role})
  if(!users.find(u=>u.role==='admin')){
    users.push({ username: 'admin', passwordHash: sha256Hex('zomonnou'), role: 'admin' });
    save(LS_USERS, users);
  } else {
    // if admin exists but password not hashed (legacy), re-hash plain (rare)
    let changed = false;
    users = users.map(u=>{
      if(u.role==='admin' && !u.passwordHash && u.password){
        u.passwordHash = sha256Hex(u.password); delete u.password; changed = true;
      }
      return u;
    });
    if(changed) save(LS_USERS, users);
  }
  if(!localStorage.getItem(LS_SERVICES)){
    save(LS_SERVICES, [
      { name: "Consultation Générale", price: 5000 },
      { name: "Analyse de Sang", price: 7000 },
      { name: "Échographie", price: 15000 }
    ]);
  }
  if(!localStorage.getItem(LS_INVOICES)) save(LS_INVOICES, []);
  if(!localStorage.getItem(LS_INVCOUNT)) localStorage.setItem(LS_INVCOUNT, "1");
}

// UI helpers
const $ = id => document.getElementById(id);
function show(id){ $(id).classList.remove('hidden'); }
function hide(id){ $(id).classList.add('hidden'); }
function clearChildren(el){ while(el.firstChild) el.removeChild(el.firstChild); }

// Session data
let currentUser = null;        // { username, role }
let selectedItems = [];        // for invoice building

// ---------- LOGIN ----------
function login(){
  const user = $('loginUser').value.trim();
  const pass = $('loginPass').value;
  if(!user || !pass){ $('loginError').innerText = 'Remplissez nom et mot de passe.'; return; }

  const users = load(LS_USERS, []);
  // check admin (compare username, hashed pass)
  const admin = users.find(u=>u.role==='admin' && u.username === user);
  if(admin){
    if(admin.passwordHash === sha256Hex(pass)){
      currentUser = { username: admin.username, role: 'admin' };
      onLoginSuccess();
      return;
    }
  }
  // check cashiers (store as {username, passwordHash, role:'cashier'})
  const cashier = users.find(u=>u.role==='cashier' && u.username === user);
  if(cashier && cashier.passwordHash === sha256Hex(pass)){
    currentUser = { username: cashier.username, role: 'cashier' };
    onLoginSuccess();
    return;
  }
  // Not found
  $('loginError').innerText = 'Identifiants incorrects.';
}

function onLoginSuccess(){
  $('loginError').innerText = '';
  $('loginUser').value=''; $('loginPass').value='';
  hide('loginSection');
  show('dashboard');
  $('welcomeTitle').innerText = `Bienvenue, ${currentUser.username}`;
  if(currentUser.role === 'admin'){
    show('adminPanel'); hide('cashierPanel');
    renderCashiersList(); renderServicesList(); renderAllInvoices();
  } else {
    show('cashierPanel'); hide('adminPanel');
    renderAvailableServices(); renderMyInvoices();
  }
}

// ---------- LOGOUT ----------
function logout(){
  currentUser = null;
  selectedItems = [];
  hide('dashboard');
  show('loginSection');
  // clear dashboard lists
  clearChildren($('cashiersList')); clearChildren($('servicesList')); clearChildren($('allInvoicesList'));
  clearChildren($('availableServices')); clearChildren($('selectedServicesList')); clearChildren($('myInvoicesList'));
}

// ---------- ADMIN: manage cashiers ----------
function createCashier(){
  const name = $('newCashierUser').value.trim();
  const pass = $('newCashierPass').value;
  if(!name || !pass){ alert('Nom et mot de passe requis'); return; }
  const users = load(LS_USERS, []);
  if(users.find(u=>u.username===name)) { alert('Utilisateur existe déjà'); return; }
  users.push({ username: name, passwordHash: sha256Hex(pass), role: 'cashier' });
  save(LS_USERS, users);
  $('newCashierUser').value=''; $('newCashierPass').value='';
  renderCashiersList();
  alert('Caissier créé.');
}

function renderCashiersList(){
  const tbody = $('cashiersList'); tbody.innerHTML = '';
  const users = load(LS_USERS, []).filter(u=>u.role==='cashier');
  if(users.length===0){ tbody.innerHTML = '<tr><td colspan="2" class="muted">Aucun caissier</td></tr>'; return; }
  users.forEach((u, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.username}</td><td><button class="btn danger" onclick="deleteCashier('${u.username}')">Supprimer</button></td>`;
    tbody.appendChild(tr);
  });
}

function deleteCashier(username){
  if(!confirm(`Supprimer le caissier ${username} ?`)) return;
  let users = load(LS_USERS, []);
  users = users.filter(u => !(u.role==='cashier' && u.username === username));
  save(LS_USERS, users);
  renderCashiersList();
  alert('Caissier supprimé.');
}

// ---------- ADMIN: services (add/edit/delete) ----------
function addService(){
  const name = $('serviceName').value.trim();
  const price = parseFloat($('servicePrice').value);
  if(!name || isNaN(price)){ alert('Nom et prix requis.'); return; }
  const list = load(LS_SERVICES, []);
  list.push({ name, price });
  save(LS_SERVICES, list);
  $('serviceName').value=''; $('servicePrice').value='';
  renderServicesList();
  renderAvailableServices();
  alert('Service ajouté.');
}

function renderServicesList(){
  const tbody = $('servicesList'); tbody.innerHTML = '';
  const list = load(LS_SERVICES, []);
  if(list.length===0){ tbody.innerHTML = '<tr><td colspan="3" class="muted">Aucun service</td></tr>'; return; }
  list.forEach((s, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${s.price} FCFA</td>
      <td>
        <button class="btn" onclick="editService(${idx})">Modifier</button>
        <button class="btn danger" onclick="deleteService(${idx})">Supprimer</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function editService(idx){
  const list = load(LS_SERVICES, []);
  if(!list[idx]) return alert('Service introuvable.');
  const newName = prompt('Nom du service', list[idx].name);
  if(newName === null) return;
  const newPriceStr = prompt('Prix (FCFA)', list[idx].price);
  if(newPriceStr === null) return;
  const newPrice = parseFloat(newPriceStr);
  if(!newName.trim() || isNaN(newPrice)) return alert('Données invalides.');
  list[idx].name = newName.trim();
  list[idx].price = newPrice;
  save(LS_SERVICES, list);
  renderServicesList(); renderAvailableServices();
  alert('Service mis à jour.');
}

function deleteService(idx){
  if(!confirm('Supprimer ce service ?')) return;
  const list = load(LS_SERVICES, []);
  list.splice(idx,1);
  save(LS_SERVICES, list);
  renderServicesList(); renderAvailableServices();
  alert('Service supprimé.');
}

// ---------- CASHIER: services selection / remove ----------
function renderAvailableServices(){
  const container = $('availableServices'); container.innerHTML = '';
  const list = load(LS_SERVICES, []);
  list.forEach((s, idx)=>{
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.margin = '4px';
    btn.textContent = `${s.name} — ${s.price} FCFA`;
    btn.onclick = ()=> { selectedItems.push({ name: s.name, price: s.price }); renderSelectedItems(); };
    container.appendChild(btn);
  });
}

function renderSelectedItems(){
  const tbody = $('selectedServicesList'); tbody.innerHTML = '';
  if(selectedItems.length===0){ tbody.innerHTML = '<tr><td colspan="3" class="muted">Aucun service sélectionné</td></tr>'; updateInvoiceTotal(); return; }
  selectedItems.forEach((it, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="text-align:left">${it.name}</td><td>${it.price} FCFA</td><td><button class="btn danger" onclick="removeSelectedItem(${idx})">Retirer</button></td>`;
    tbody.appendChild(tr);
  });
  updateInvoiceTotal();
}

function removeSelectedItem(index){
  if(index < 0 || index >= selectedItems.length) return;
  selectedItems.splice(index,1);
  renderSelectedItems();
}

function updateInvoiceTotal(){
  const total = selectedItems.reduce((s,i)=>s+i.price,0);
  $('invoiceTotal').innerText = total;
}

// ---------- INVOICE: save into LS and PDF ----------
async function saveInvoice(){
  const patient = $('patientName').value.trim();
  const contact = $('patientContact').value.trim();
  if(!patient) return alert('Nom du patient requis.');
  if(selectedItems.length===0) return alert('Ajoutez au moins un service.');

  const invoices = load(LS_INVOICES, []);
  let counter = parseInt(localStorage.getItem(LS_INVCOUNT) || '1', 10);
  const invoiceNum = 'INV-' + String(counter).padStart(4,'0');
  const dateISO = new Date().toISOString().slice(0,10);
  const total = selectedItems.reduce((s,i)=>s+i.price,0);

  const inv = { invoiceNum, patient, contact, items: selectedItems.slice(), total, date: dateISO, cashier: currentUser.username };
  invoices.push(inv); save(LS_INVOICES, invoices);
  counter++; localStorage.setItem(LS_INVCOUNT, String(counter));

  // reset selections
  selectedItems = []; renderSelectedItems(); $('patientName').value=''; $('patientContact').value='';

  // generate pdf and offer download
  await generatePDFAndDownload(inv);
  renderMyInvoices(); renderAllInvoices();
  alert('Facture enregistrée: ' + invoiceNum);
}

async function generatePDFAndDownload(inv){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const pageW = 595.28, margin = 40;
  let y = margin;

  // embed logo image
  const logoEl = $('pdfLogo');
  let imgData = null;
  if(logoEl && logoEl.src) imgData = await imgToDataUrl(logoEl, 150, 80);
  if(imgData) doc.addImage(imgData, 'JPEG', pageW - margin - 120, y, 120, 60);

  doc.setFontSize(16); doc.setFont("helvetica","bold");
  doc.text("CABINET MEDICAL KPONDEHOU", margin, y + 20);
  doc.setFontSize(10); doc.setFont("helvetica","normal");
  doc.text("AKPAKPA GANGBODO, COTONOU", margin, y + 38);
  doc.text("Tél: (+229) 0197238875 / 0157389298", margin, y + 52);
  doc.text("Email: jesuisdocteur@gmail.com", margin, y + 66);

  y += 90;
  doc.setDrawColor(200); doc.setFillColor(245);
  doc.rect(margin, y, pageW - margin*2, 28, 'F');
  doc.setFontSize(12); doc.setTextColor(20);
  doc.text("FACTURE", margin + 6, y + 18);
  doc.text(`N°: ${inv.invoiceNum}`, margin + 140, y + 18);
  doc.text(`Date: ${inv.date}`, margin + 320, y + 18);

  y += 44;
  doc.setFontSize(11);
  doc.text(`Patient: ${inv.patient}`, margin, y);
  doc.text(`Contact: ${inv.contact || ''}`, margin, y + 14);
  doc.text(`Caissier: ${inv.cashier}`, margin, y + 28);
  y += 48;

  // table header
  const tableX = margin;
  const col1 = 360;
  doc.setFontSize(11);
  doc.setFillColor(245);
  doc.rect(tableX, y, pageW - margin*2, 22, 'F');
  doc.text("Description", tableX + 6, y + 15);
  doc.text("Prix (FCFA)", tableX + col1 + 6, y + 15);

  y += 34;
  doc.setFontSize(10);
  inv.items.forEach(it=>{
    if(y > 740){ doc.addPage(); y = margin; }
    doc.text(it.name, tableX + 6, y);
    doc.text(String(it.price), tableX + col1 + 6, y, { align: 'right' });
    y += 16;
  });

  y += 12;
  doc.setFontSize(12);
  doc.text("Total:", tableX + 6, y + 12);
  doc.text(`${inv.total} FCFA`, pageW - margin - 10, y + 12, { align: 'right' });

  y += 36;
  doc.setFontSize(10);
  doc.text("Merci pour votre confiance.", tableX + 6, y);

  // filename: last name + date
  const tokens = inv.patient.trim().split(/\s+/);
  const last = tokens.length ? tokens[tokens.length-1] : inv.patient.replace(/\s/g,'_');
  const filename = `${last}_${inv.date}.pdf`;

  doc.save(filename);
}

function imgToDataUrl(imgEl, maxW=400, maxH=200){
  return new Promise(resolve=>{
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function(){
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxW/img.width, maxH/img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0,0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = ()=> resolve(null);
    img.src = imgEl.src;
  });
}

// ---------- INVOICES rendering ----------
function renderAllInvoices(){
  const tbody = $('allInvoicesList'); tbody.innerHTML = '';
  const q = $('searchAllInvoices').value ? $('searchAllInvoices').value.toLowerCase() : '';
  const arr = load(LS_INVOICES, []);
  const filtered = arr.slice().reverse().filter(inv=>{
    if(!q) return true;
    return inv.invoiceNum.toLowerCase().includes(q) || (inv.patient && inv.patient.toLowerCase().includes(q)) || (inv.cashier && inv.cashier.toLowerCase().includes(q));
  });
  if(filtered.length===0){ tbody.innerHTML = '<tr><td colspan="6" class="muted">Aucune facture</td></tr>'; return; }
  filtered.forEach(inv=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${inv.invoiceNum}</td><td>${inv.patient}</td><td>${inv.cashier}</td><td>${inv.total}</td><td>${inv.date}</td>
      <td><button class="btn" onclick="generatePDFByNum('${inv.invoiceNum}')">Télécharger PDF</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderMyInvoices(){
  const tbody = $('myInvoicesList'); tbody.innerHTML = '';
  const q = $('searchMyInvoices').value ? $('searchMyInvoices').value.toLowerCase() : '';
  const arr = load(LS_INVOICES, []).filter(i => i.cashier === currentUser.username).slice().reverse();
  const filtered = q ? arr.filter(inv=> inv.invoiceNum.toLowerCase().includes(q) || (inv.patient && inv.patient.toLowerCase().includes(q))) : arr;
  if(filtered.length===0){ tbody.innerHTML = '<tr><td colspan="5" class="muted">Aucune facture</td></tr>'; return; }
  filtered.forEach(inv=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${inv.invoiceNum}</td><td>${inv.patient}</td><td>${inv.total}</td><td>${inv.date}</td>
      <td><button class="btn" onclick="generatePDFByNum('${inv.invoiceNum}')">Télécharger PDF</button></td>`;
    tbody.appendChild(tr);
  });
}

function generatePDFByNum(num){
  const inv = load(LS_INVOICES, []).find(i=> i.invoiceNum === num);
  if(!inv) return alert('Facture introuvable');
  generatePDFAndDownload(inv);
}

// ---------- REPORTS and CSV ----------
function generateReportAdmin(dateVal){
  const date = dateVal || $('reportDateAdmin').value;
  if(!date) return alert('Sélectionnez une date.');
  const arr = load(LS_INVOICES, []).filter(i=> i.date === date);
  $('reportAdminResult').classList.remove('hidden');
  $('reportAdminTotal').innerText = arr.reduce((s,i)=>s + Number(i.total),0).toFixed(0);
  $('reportAdminCount').innerText = arr.length;
  const tbody = $('reportAdminList'); tbody.innerHTML = '';
  arr.forEach(inv=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${inv.invoiceNum}</td><td>${inv.patient}</td><td>${inv.cashier}</td><td>${inv.total}</td><td>${inv.date}</td>`;
    tbody.appendChild(tr);
  });
  window._lastAdminReport = arr;
}

function generateReportCashier(dateVal){
  const date = dateVal || $('reportDateCashier').value;
  if(!date) return alert('Sélectionnez une date.');
  const arr = load(LS_INVOICES, []).filter(i=> i.date === date && i.cashier === currentUser.username);
  $('reportCashierResult').classList.remove('hidden');
  $('reportCashierTotal').innerText = arr.reduce((s,i)=>s + Number(i.total),0).toFixed(0);
  $('reportCashierCount').innerText = arr.length;
  const tbody = $('reportCashierList'); tbody.innerHTML = '';
  arr.forEach(inv=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${inv.invoiceNum}</td><td>${inv.patient}</td><td>${inv.total}</td><td>${inv.date}</td>`;
    tbody.appendChild(tr);
  });
  window._lastCashierReport = arr;
}

function exportCsvFromArray(rows, filename){
  const csv = rows.map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c.replace(/"/g,'""')}"` : c).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function exportAllInvoicesCsv(){
  const arr = load(LS_INVOICES, []);
  if(arr.length===0) return alert('Aucune facture à exporter.');
  const rows = [['invoiceNum','patient','contact','cashier','date','total']];
  arr.forEach(i => rows.push([i.invoiceNum, i.patient, i.contact||'', i.cashier, i.date, i.total]));
  exportCsvFromArray(rows, `factures_${new Date().toISOString().slice(0,10)}.csv`);
}

function exportLastAdminReportCsv(){
  const arr = window._lastAdminReport || [];
  if(arr.length===0) return alert('Aucun rapport généré.');
  const rows = [['invoiceNum','patient','cashier','total','date']];
  arr.forEach(i=> rows.push([i.invoiceNum, i.patient, i.cashier, i.total, i.date]));
  exportCsvFromArray(rows, `rapport_admin_${new Date().toISOString().slice(0,10)}.csv`);
}

function exportLastCashierReportCsv(){
  const arr = window._lastCashierReport || [];
  if(arr.length===0) return alert('Aucun rapport généré.');
  const rows = [['invoiceNum','patient','total','date']];
  arr.forEach(i=> rows.push([i.invoiceNum, i.patient, i.total, i.date]));
  exportCsvFromArray(rows, `rapport_caissier_${new Date().toISOString().slice(0,10)}.csv`);
}

// ---------- Utility renders ----------
function renderAvailableServices(){
  renderAvailableServices(); // kept for compatibility (some functions call it)
}

// ---------- Wire events and boot ----------
document.addEventListener('DOMContentLoaded', ()=> {
  initStorage();

  // bind UI
  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', logout);

  // admin controls
  $('createCashierBtn').addEventListener('click', createCashier);
  $('addServiceBtn').addEventListener('click', addService);
  $('searchAllInvoices').addEventListener('input', renderAllInvoices);
  $('exportAllCsvBtn').addEventListener('click', exportAllInvoicesCsv);
  $('generateReportAdminBtn').addEventListener('click', ()=>generateReportAdmin());
  $('todayReportAdminBtn').addEventListener('click', ()=>generateReportAdmin(new Date().toISOString().slice(0,10)));
  $('exportAdminReportCsv').addEventListener('click', exportLastAdminReportCsv);

  // cashier
  $('saveInvoiceBtn')?.addEventListener('click', saveInvoice);
  $('generateReportCashierBtn')?.addEventListener('click', ()=>generateReportCashier());
  $('todayReportCashierBtn')?.addEventListener('click', ()=>generateReportCashier(new Date().toISOString().slice(0,10)));
  $('exportCashierReportCsv')?.addEventListener('click', exportLastCashierReportCsv);
  $('searchMyInvoices')?.addEventListener('input', renderMyInvoices);

  // render lists if already logged in (persisted)
  if(currentUser){
    onLoginSuccess();
  } else {
    // show login only
    hide('dashboard');
    show('loginSection');
  }

  // initial render helpers
  renderServicesList();
  renderAvailableServices = function(){ // implement properly here
    const container = $('availableServices'); container.innerHTML = '';
    const list = load(LS_SERVICES, []);
    list.forEach((s, idx)=>{
      const b = document.createElement('button');
      b.className = 'btn';
      b.style.margin = '4px';
      b.textContent = `${s.name} — ${s.price} FCFA`;
      b.addEventListener('click', ()=>{ selectedItems.push({ name: s.name, price: s.price }); renderSelectedItems(); });
      container.appendChild(b);
    });
  };
  renderAvailableServices();
  renderSelectedItems();
});
