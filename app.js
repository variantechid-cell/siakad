/* ================================================================
   SIAKAD GURU MAPEL - APP.JS V27 PERSONAL WORKSPACE CORE
   ----------------------------------------------------------------
   Frontend sengaja mandiri. Tidak bergantung pada HTML lama V18/V21/V23.
   Cocok untuk localhost Visual Studio Code dan GitHub Pages.

   Yang dipakai:
   Hari Ini -> Pertemuan -> Presensi Guru -> Absensi Siswa
                      -> Jurnal -> Materi/LKPD -> Tugas -> Penilaian
================================================================ */

const API_URL = 'https://script.google.com/macros/s/AKfycbzdFMIw-gjkcGz5b-Ymun8j6-0qS_9OBaHOpH3zgVBzZ1YRBLKeZwZCim7SamZD1d6NZQ/exec';
// V26 memakai JSONP agar dapat diuji dari localhost dan GitHub Pages tanpa
// bergantung pada CORS header dari Google Apps Script Web App.
const TOKEN_KEY = 'siakad_personal_v25_token';
const USER_KEY = 'siakad_personal_v25_user';

let state = {
  token: '',
  user: null,
  schedules: [],
  schedule: null,
  meeting: null,
  students: [],
  lastRecap: null,
  journal: null,
  resources: { MATERI: [], TUGAS: [], PENILAIAN: [] }
};

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));

function saveSession() {
  try {
    localStorage.setItem(TOKEN_KEY, state.token || '');
    localStorage.setItem(USER_KEY, JSON.stringify(state.user || null));
  } catch (_) {}
}

function api(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!API_URL || API_URL.includes('PASTE_SIAKAD')) {
      reject(new Error('API_URL belum diisi di app.js. Masukkan URL Web App Apps Script SIAKAD Anda.'));
      return;
    }

    const callback = '__siakadV26_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    const q = new URLSearchParams({ action, callback, _ts: Date.now().toString() });
    Object.entries(params).forEach(([k,v]) => {
      if (v !== undefined && v !== null && v !== '') {
        q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    });

    const script = document.createElement('script');
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Server terlalu lama merespons. Periksa URL Web App dan deployment Apps Script.')), 20000);

    function cleanup() {
      clearTimeout(timeout);
      try { delete window[callback]; } catch (_) { window[callback] = undefined; }
      script.remove();
    }
    function finish(err, data) {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err); else resolve(data);
    }

    window[callback] = (data) => {
      if (!data || typeof data !== 'object') {
        finish(new Error('Response server tidak valid.'));
        return;
      }
      if (!data.success && data.status === 'SESSION_EXPIRED') {
        state.token = '';
        finish(new Error('Sesi internal berakhir. Silakan refresh halaman.'));
        return;
      }
      finish(null, data);
    };

    script.onerror = () => finish(new Error('NetworkError saat menghubungi Web App Apps Script. Pastikan URL /exec benar, deployment aktif, dan dapat diakses.'));
    script.src = API_URL + (API_URL.includes('?') ? '&' : '?') + q.toString();
    script.async = true;
    document.head.appendChild(script);
  });
}

function showError(message) {
  $('#app').innerHTML = `
    <div class="shell center-page">
      <div class="error-card">
        <div class="error-icon">⚠️</div>
        <h2>Workspace belum dapat dibuka</h2>
        <p>${esc(message)}</p>
        <button class="btn primary" onclick="boot()">↻ Coba Lagi</button>
      </div>
    </div>`;
}

function renderShell(content) {
  const name = state.user?.nama || 'Guru';
  $('#app').innerHTML = `
    <div class="topbar">
      <div class="topbar-inner">
        <div>
          <div class="brand">SIAKAD <span>Personal Workspace</span></div>
          <div class="teacher-name">${esc(name)}</div>
        </div>
        <button class="btn ghost" onclick="loadToday()">↻ Refresh</button>
      </div>
    </div>
    <main class="shell">${content}</main>`;
}

function scheduleCard(s) {
  const m = s.meeting;
  const presence = s.presence;
  return `
    <article class="schedule-card">
      <div class="schedule-time">${esc(s.jamMulai?.slice(0,5))} - ${esc(s.jamSelesai?.slice(0,5))}</div>
      <div class="schedule-main">
        <div class="eyebrow">${esc(s.jamKe ? 'Jam Ke-' + s.jamKe : 'Jadwal Mengajar')}</div>
        <h3>${esc(s.kelas)}</h3>
        <p>${esc(s.mapel)}</p>
        <div class="chips">
          ${m ? `<span class="chip green">Pertemuan ${esc(m.PERTEMUAN_KE)}</span>` : `<span class="chip">Belum dibuka</span>`}
          ${presence ? `<span class="chip ${String(presence.status).toUpperCase()==='HADIR'?'green':'orange'}">Guru: ${esc(presence.status)}</span>` : ''}
        </div>
      </div>
      <button class="btn primary" onclick="openMeeting('${esc(s.jadwalId)}')">Buka Pertemuan →</button>
    </article>`;
}

async function loadToday() {
  renderShell(`<section class="loading-card"><div class="spinner"></div><h2>Memuat jadwal hari ini...</h2><p>Menyiapkan meja kerja Anda.</p></section>`);
  try {
    const r = await api('todaySchedule', { token: state.token });
    if (!r.success) throw new Error(r.message || 'Jadwal gagal dimuat.');
    state.schedules = r.data || [];
    renderToday(r);
  } catch (e) { showError(e.message); }
}

function renderToday(r) {
  const list = state.schedules.length
    ? state.schedules.map(scheduleCard).join('')
    : `<div class="empty-card"><div class="empty-icon">📭</div><h3>Tidak ada jadwal hari ini</h3><p>Jadwal mengajar aktif untuk Anda belum ditemukan.</p></div>`;
  renderShell(`
    <section class="hero">
      <div>
        <div class="eyebrow">WORKSPACE GURU</div>
        <h1>Hari Ini</h1>
        <p>${esc(r.hari || '')} · ${esc(r.tanggal || '')}</p>
      </div>
      <div class="hero-stat"><strong>${state.schedules.length}</strong><span>Jadwal</span></div>
    </section>
    <section class="section-head"><div><h2>Jadwal Mengajar</h2><p>Pilih jadwal untuk membuka satu ruang kerja pertemuan.</p></div></section>
    <section class="schedule-list">${list}</section>`);
}

async function openMeeting(jadwalId) {
  try {
    const r = await api('getOrCreateMeeting', { token: state.token, jadwalId });
    if (!r.success) throw new Error(r.message || 'Pertemuan gagal dibuka.');
    state.schedule = state.schedules.find(x => x.jadwalId === jadwalId) || null;
    state.meeting = r.data;
    await renderMeeting();
  } catch (e) { alert(e.message); }
}

async function renderMeeting() {
  const s = state.schedule, m = state.meeting;
  renderShell(`
    <button class="back" onclick="loadToday()">← Kembali ke Hari Ini</button>
    <section class="meeting-head">
      <div>
        <div class="eyebrow">WORKSPACE PERTEMUAN</div>
        <h1>${esc(s.kelas)}</h1>
        <p>${esc(s.mapel)} · ${esc(s.jamMulai?.slice(0,5))} - ${esc(s.jamSelesai?.slice(0,5))}</p>
      </div>
      <div class="meeting-status ${statusClass(m.STATUS)}">${esc(m.STATUS)}</div>
    </section>

    <section class="action-row">
      <button id="teacherCheckBtn" class="btn primary" onclick="checkInTeacher()">👨‍🏫 Presensi Guru</button>
      <button class="btn secondary" onclick="loadStudents()">👨‍🎓 Absensi Siswa</button>
      <button class="btn secondary" onclick="loadJournal()">📝 Jurnal</button>
      <button class="btn secondary" onclick="loadResources('MATERI')">📚 Materi/LKPD</button>
      <button class="btn secondary" onclick="loadResources('TUGAS')">📋 Tugas</button>
      <button class="btn secondary" onclick="loadResources('PENILAIAN')">📊 Penilaian</button>
      <button class="btn secondary" onclick="loadMonthlyRecap()">📊 Rekap Bulanan</button>
      ${m.STATUS==='BERLANGSUNG' ? `<button class="btn danger" onclick="finishMeeting()">Selesaikan Pertemuan</button>` : ''}
    </section>

    <section id="workspacePanel" class="workspace-panel">
      <div class="welcome-workspace"><div class="big-icon">🧑‍🏫</div><h2>Ruang kerja siap digunakan</h2><p>Mulai dengan presensi guru, lalu kelola absensi siswa dan catatan pembelajaran.</p></div>
    </section>`);
}

function statusClass(s) { const x=String(s||'').toUpperCase(); return x==='BERLANGSUNG'?'green':x==='SELESAI'?'gray':'blue'; }

async function checkInTeacher() {
  const btn=$('#teacherCheckBtn'); if(btn) btn.disabled=true;
  try {
    const r=await api('teacherCheckIn',{token:state.token,jadwalId:state.schedule.jadwalId});
    if(!r.success) throw new Error(r.message||'Presensi guru gagal.');
    if(state.meeting.STATUS!=='BERLANGSUNG') {
      const st=await api('startMeeting',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID});
      if(st.success) state.meeting=st.data;
    }
    await renderMeeting();
    alert(r.message || 'Presensi guru tersimpan.');
  } catch(e){ alert(e.message); if(btn)btn.disabled=false; }
}

async function finishMeeting(){
  if(!confirm('Selesaikan pertemuan ini?')) return;
  try{const r=await api('finishMeeting',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID});if(!r.success)throw new Error(r.message||'Gagal menyelesaikan.');state.meeting=r.data;await renderMeeting();}catch(e){alert(e.message);}
}

async function loadStudents(){
  panelLoading('Memuat daftar siswa...');
  try{const r=await api('teacherAttendance',{token:state.token,jadwalId:state.schedule.jadwalId});if(!r.success)throw new Error(r.message||'Absensi gagal dimuat.');state.students=r.data||[];renderStudents(r);}catch(e){panelError(e.message);}
}
function panelLoading(msg){$('#workspacePanel').innerHTML=`<div class="panel-loading"><div class="spinner"></div><p>${esc(msg)}</p></div>`;}
function panelError(msg){$('#workspacePanel').innerHTML=`<div class="panel-error">⚠️ ${esc(msg)}</div>`;}
function renderStudents(r){
  const rows=state.students.map((x,i)=>`<tr><td>${i+1}</td><td><strong>${esc(x.nama)}</strong><small>${esc(x.studentId)}</small></td><td><select onchange="saveStudent('${esc(x.studentId)}',this.value,'')">${['BELUM ABSEN','Hadir','Terlambat','Izin','Sakit','Alpa','Kegiatan'].map(v=>`<option ${v===x.status?'selected':''}>${v}</option>`).join('')}</select></td><td>${esc(x.jam||'-')}</td><td>${esc(x.catatan||'')}</td></tr>`).join('');
  $('#workspacePanel').innerHTML=`<div class="panel-title"><div><h2>Absensi Siswa</h2><p>${r.total} siswa · Hadir ${r.summary.hadir} · Terlambat ${r.summary.terlambat} · Izin ${r.summary.izin} · Sakit ${r.summary.sakit} · Alpa ${r.summary.alpa}</p></div><button class="btn secondary" onclick="loadStudents()">↻ Refresh</button></div><div class="table-wrap"><table><thead><tr><th>No</th><th>Siswa</th><th>Status</th><th>Jam</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
async function saveStudent(studentId,status,catatan){
  try{const r=await api('updateAttendance',{token:state.token,studentId,jadwalId:state.schedule.jadwalId,status,catatan});if(!r.success)throw new Error(r.message||'Gagal menyimpan.');const x=state.students.find(a=>a.studentId===studentId);if(x)x.status=status;toast('Absensi tersimpan');}catch(e){alert(e.message);loadStudents();}
}


async function loadMonthlyRecap(){
  const now=new Date();
  const month=prompt('Bulan (1-12):',String(now.getMonth()+1));
  if(!month)return;
  const year=prompt('Tahun:',String(now.getFullYear()));
  if(!year)return;
  panelLoading('Memuat rekap absensi bulanan...');
  try{
    const r=await api('monthlyStudentRecap',{
      token:state.token,bulan:month,tahun:year,
      kelasId:state.schedule.kelasId,mapelId:state.schedule.mapelId
    });
    if(!r.success)throw new Error(r.message||'Rekap bulanan gagal dimuat.');
    state.lastRecap=r;
    renderMonthlyRecap(r);
  }catch(e){panelError(e.message);}
}
function renderMonthlyRecap(r){
  const rows=(r.data||[]).map((x,i)=>`<tr>
    <td>${i+1}</td><td><strong>${esc(x.nama)}</strong><small>${esc(x.studentId)}</small></td>
    <td>${x.hadir}</td><td>${x.terlambat}</td><td>${x.izin}</td><td>${x.sakit}</td><td>${x.alpa}</td><td>${x.kegiatan}</td><td>${x.totalTercatat}</td>
  </tr>`).join('');
  $('#workspacePanel').innerHTML=`<div class="panel-title">
    <div><h2>📊 Rekap Absensi Bulanan</h2><p>${esc(state.schedule.kelas)} · ${esc(state.schedule.mapel)} · ${esc(String(r.bulan))}/${esc(String(r.tahun))}</p></div>
    <div><button class="btn secondary" onclick="loadMonthlyRecap()">↻ Ubah Periode</button>
    <button class="btn primary" onclick="downloadRecapCSV()">⬇ CSV</button></div>
  </div>
  <div class="recap-summary">
    <span>Hadir <b>${r.summary.hadir}</b></span><span>Terlambat <b>${r.summary.terlambat}</b></span>
    <span>Izin <b>${r.summary.izin}</b></span><span>Sakit <b>${r.summary.sakit}</b></span>
    <span>Alpa <b>${r.summary.alpa}</b></span><span>Kegiatan <b>${r.summary.kegiatan}</b></span>
  </div>
  <div class="table-wrap"><table><thead><tr><th>No</th><th>Siswa</th><th>Hadir</th><th>Terlambat</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th>Kegiatan</th><th>Tercatat</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="9" style="text-align:center">Belum ada data.</td></tr>'}</tbody></table></div>`;
}
function downloadRecapCSV(){
  const rows=[['No','Student ID','Nama','Kelas','Hadir','Terlambat','Izin','Sakit','Alpa','Kegiatan','Total Tercatat']];
  (state.lastRecap?.data||[]).forEach((x,i)=>rows.push([i+1,x.studentId,x.nama,x.kelas,x.hadir,x.terlambat,x.izin,x.sakit,x.alpa,x.kegiatan,x.totalTercatat]));
  if(rows.length===1){toast('Tidak ada data untuk diunduh');return;}
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(["\ufeff"+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`Rekap_Absensi_${state.schedule.kelas}_${state.schedule.mapel}.csv`;
  a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

async function loadJournal(){
  panelLoading('Memuat jurnal...');
  try{const r=await api('getJournal',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID});state.journal=r.data||{};renderJournal();}catch(e){panelError(e.message);}
}
function renderJournal(){const j=state.journal||{};$('#workspacePanel').innerHTML=`<div class="panel-title"><div><h2>📝 Jurnal Mengajar</h2><p>Data otomatis terikat ke pertemuan ini.</p></div></div><form class="form-grid" onsubmit="saveJournal(event)"><label>Tujuan Pembelajaran<textarea id="jTujuan">${esc(j.TUJUAN_PEMBELAJARAN||'')}</textarea></label><label>Materi<textarea id="jMateri">${esc(j.MATERI||'')}</textarea></label><label>Kegiatan Pembelajaran<textarea id="jKegiatan">${esc(j.KEGIATAN_PEMBELAJARAN||'')}</textarea></label><label>Hasil Pembelajaran<textarea id="jHasil">${esc(j.HASIL_PEMBELAJARAN||'')}</textarea></label><label>Kendala<textarea id="jKendala">${esc(j.KENDALA||'')}</textarea></label><label>Tindak Lanjut<textarea id="jTL">${esc(j.TINDAK_LANJUT||'')}</textarea></label><label>Catatan<textarea id="jCatatan">${esc(j.CATATAN||'')}</textarea></label><div><button class="btn primary">💾 Simpan Jurnal</button></div></form>`;}
async function saveJournal(e){e.preventDefault();const p={tujuan:$('#jTujuan').value,materi:$('#jMateri').value,kegiatan:$('#jKegiatan').value,hasil:$('#jHasil').value,kendala:$('#jKendala').value,tindakLanjut:$('#jTL').value,catatan:$('#jCatatan').value};try{const r=await api('saveJournal',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,payload:p});if(!r.success)throw new Error(r.message||'Gagal menyimpan jurnal.');state.journal=r.data;toast('Jurnal tersimpan');}catch(x){alert(x.message);}}

async function loadResources(type){panelLoading('Memuat '+type.toLowerCase()+'...');try{const r=await api('getResources',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,type});if(!r.success)throw new Error(r.message||'Resource gagal dimuat.');state.resources[type]=r.data||[];renderResources(type);}catch(e){panelError(e.message);}}
function renderResources(type){const items=state.resources[type]||[];const title={MATERI:'📚 Materi / LKPD',TUGAS:'📋 Tugas',PENILAIAN:'📊 Penilaian'}[type];const rows=items.map(x=>`<div class="resource"><div><strong>${esc(x.JUDUL||'-')}</strong><p>${esc(x.DESKRIPSI||x.KRITERIA||x.KETERANGAN||'')}</p></div>${x.URL?`<a class="btn small" href="${esc(x.URL)}" target="_blank" rel="noopener">Buka ↗</a>`:''}</div>`).join('');$('#workspacePanel').innerHTML=`<div class="panel-title"><div><h2>${title}</h2><p>Resource yang terkait langsung dengan pertemuan.</p></div></div><div class="resource-list">${rows||'<div class="empty-inline">Belum ada data.</div>'}</div><button class="btn secondary" onclick="addResource('${type}')">＋ Tambah</button>`;}
async function addResource(type){const judul=prompt('Judul '+type+':');if(!judul)return;const url=prompt('URL Google Drive / Learning Hub (opsional):')||'';const p={judul,url,sumber:url?'GOOGLE_DRIVE':'MANUAL',jenis:type==='MATERI'?'LINK':'TUGAS',deskripsi:judul,kriteria:judul,nilaiMaksimal:100};try{const r=await api('saveResource',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,type,payload:p});if(!r.success)throw new Error(r.message||'Gagal menyimpan.');await loadResources(type);}catch(e){alert(e.message);}}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),1800);}

async function boot(){
  $('#app').innerHTML=`<div class="shell center-page"><div class="loading-card"><div class="spinner"></div><h2>Menyiapkan Personal Workspace...</h2><p>Menghubungkan ke Google Apps Script.</p></div></div>`;
  try{
    const r=await api('v24Bootstrap');
    if(!r.success)throw new Error(r.message||'Bootstrap gagal. Jalankan SETUP_PERSONAL_WORKSPACE() di Apps Script jika diperlukan.');
    state.token=r.token;state.user=r.user;saveSession();await loadToday();
  }catch(e){showError(e.message);}
}

function injectCSS(){
  if($('#v25css'))return;
  const s=document.createElement('style');s.id='v25css';s.textContent=`
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f7fb;color:#14213d}button,input,textarea,select{font:inherit}.topbar{background:linear-gradient(135deg,#123c48,#0e2538);color:#fff}.topbar-inner{max-width:1120px;margin:auto;padding:20px 24px;display:flex;justify-content:space-between;align-items:center}.brand{font-size:20px;font-weight:900}.brand span{font-weight:500;opacity:.75}.teacher-name{font-size:13px;opacity:.8;margin-top:4px}.shell{max-width:1120px;margin:auto;padding:28px 24px 60px}.hero{background:linear-gradient(135deg,#fff,#eef7fa);border:1px solid #dbe5ec;border-radius:24px;padding:28px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 12px 35px #17324a12}.eyebrow{font-size:11px;font-weight:900;letter-spacing:.14em;color:#237487}.hero h1,.meeting-head h1{margin:5px 0;font-size:34px}.hero p,.meeting-head p{margin:0;color:#68778b}.hero-stat{width:90px;height:90px;border-radius:20px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #dbe5ec}.hero-stat strong{font-size:30px}.hero-stat span{font-size:12px;color:#718096}.section-head{margin:30px 0 14px}.section-head h2,.panel-title h2{margin:0}.section-head p,.panel-title p{margin:5px 0;color:#718096}.schedule-list{display:grid;gap:14px}.schedule-card{background:#fff;border:1px solid #dce5ed;border-radius:18px;padding:20px;display:grid;grid-template-columns:130px 1fr auto;gap:20px;align-items:center}.schedule-time{font-weight:900;font-size:20px;color:#173f4a}.schedule-main h3{margin:4px 0;font-size:21px}.schedule-main p{margin:0;color:#617083}.chips{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap}.chip{padding:5px 9px;border-radius:999px;background:#edf2f6;font-size:11px;font-weight:800}.chip.green{background:#dcfce7;color:#166534}.chip.orange{background:#ffedd5;color:#9a3412}.btn{border:0;border-radius:11px;padding:10px 15px;font-weight:800;cursor:pointer}.btn.primary{background:#2563eb;color:white}.btn.secondary{background:#eaf0f5;color:#17324a}.btn.ghost{background:#ffffff1c;color:#fff}.btn.danger{background:#dc2626;color:#fff}.btn.small{padding:7px 10px;text-decoration:none;background:#eaf0f5;color:#17324a;font-size:12px}.back{border:0;background:none;color:#2563eb;font-weight:800;cursor:pointer;padding:0;margin-bottom:15px}.meeting-head{background:#fff;border:1px solid #dce5ed;border-radius:20px;padding:24px;display:flex;justify-content:space-between;align-items:center}.meeting-status{padding:8px 13px;border-radius:999px;font-weight:900;font-size:12px}.meeting-status.blue{background:#dbeafe;color:#1d4ed8}.meeting-status.green{background:#dcfce7;color:#166534}.meeting-status.gray{background:#e5e7eb;color:#374151}.action-row{display:flex;gap:9px;flex-wrap:wrap;margin:16px 0}.workspace-panel{background:#fff;border:1px solid #dce5ed;border-radius:20px;padding:22px;min-height:260px}.welcome-workspace{text-align:center;padding:45px 20px;color:#718096}.big-icon{font-size:48px}.loading-card,.error-card,.empty-card{background:#fff;border:1px solid #dce5ed;border-radius:20px;padding:45px;text-align:center;max-width:680px;margin:80px auto}.center-page{min-height:75vh;display:flex;align-items:center;justify-content:center}.error-card{margin:0}.error-icon,.empty-icon{font-size:42px}.spinner{width:32px;height:32px;border:4px solid #dbe5ed;border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 15px}@keyframes spin{to{transform:rotate(360deg)}}.panel-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px}.table-wrap{overflow:auto;border:1px solid #e3e9ef;border-radius:14px}table{width:100%;border-collapse:collapse;min-width:700px}th,td{padding:11px 12px;border-bottom:1px solid #edf1f4;text-align:left;font-size:13px}th{background:#f7fafc;font-size:11px;text-transform:uppercase;letter-spacing:.04em}td small{display:block;color:#8995a3;margin-top:2px}select{padding:7px 9px;border:1px solid #cfd9e2;border-radius:8px;background:#fff}.panel-loading{text-align:center;padding:60px}.panel-error{padding:18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;color:#9a3412}.form-grid{display:grid;gap:14px}.form-grid label{display:grid;gap:6px;font-size:13px;font-weight:800}.form-grid textarea{min-height:90px;resize:vertical;border:1px solid #ccd7e0;border-radius:10px;padding:10px}.resource-list{display:grid;gap:10px;margin-bottom:15px}.resource{border:1px solid #e0e7ee;border-radius:13px;padding:14px;display:flex;justify-content:space-between;gap:15px;align-items:center}.resource p{margin:4px 0 0;color:#718096;font-size:13px}.empty-inline{padding:25px;text-align:center;color:#8995a3;background:#f8fafc;border-radius:12px}.recap-summary{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.recap-summary span{background:#eef4f8;border:1px solid #dce6ed;padding:8px 11px;border-radius:10px;font-size:12px}.recap-summary b{margin-left:4px}.toast{position:fixed;right:22px;bottom:22px;background:#14213d;color:white;padding:11px 15px;border-radius:10px;box-shadow:0 8px 25px #0003;font-size:13px}@media(max-width:760px){.shell{padding:18px 14px 40px}.schedule-card{grid-template-columns:1fr}.hero h1,.meeting-head h1{font-size:28px}.hero-stat{width:70px;height:70px}.meeting-head{gap:15px;align-items:flex-start}.schedule-card .btn{width:100%}}
  `;document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded',()=>{injectCSS();boot();});
