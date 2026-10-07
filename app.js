/* ================================================================
   SIAKAD GURU MAPEL - APP.JS V30 PERSONAL WORKSPACE
   ----------------------------------------------------------------
   Frontend sengaja mandiri. Tidak bergantung pada HTML lama V18/V21/V23.
   Cocok untuk localhost Visual Studio Code dan GitHub Pages.

   Yang dipakai:
   Hari Ini -> Pertemuan -> Presensi Guru -> Absensi Siswa
                      -> Jurnal -> Materi/LKPD -> Tugas -> Penilaian
================================================================ */

const API_URL = 'PASTE_SIAKAD_WEB_APP_URL_HERE';

// Untuk Kelas XI/XII TJKT pada mata pelajaran Pilihan / Pilihan Lanjutan,
// Materi/LKPD dikelola langsung di TJKT Learning Hub. SIAKAD tidak menyalin file.
const TJKT_LEARNING_HUB_URL = 'https://script.google.com/a/macros/guru.smk.belajar.id/s/AKfycbxZWP_UNHqaUAn_qdObh0rNKP4Re2ArKLIXechffHD7QCyC_73CY_qqVSnzfKlJppdx/exec';

// V26 memakai JSONP agar dapat diuji dari localhost dan GitHub Pages tanpa
// bergantung pada CORS header dari Google Apps Script Web App.
const TOKEN_KEY = 'siakad_personal_v25_token';
const USER_KEY = 'siakad_personal_v25_user';

let state = {
  token: '',
  user: null,
  schedules: [],
  tomorrowSchedules: [],
  previousLearning: [],
  schedule: null,
  meeting: null,
  students: [],
  lastRecap: null,
  materials: [],
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

function api(action, params = {}, options = {}) {
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
    const timeoutMs = Number(options.timeoutMs || 20000);
    const timeout = setTimeout(() => finish(new Error('Server terlalu lama merespons. Periksa URL Web App dan deployment Apps Script.')), timeoutMs);

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

function tomorrowScheduleCard(s) {
  return `
    <article class="schedule-card tomorrow-card">
      <div class="schedule-time">${esc(s.jamMulai?.slice(0,5))} - ${esc(s.jamSelesai?.slice(0,5))}</div>
      <div class="schedule-main">
        <div class="eyebrow">JADWAL BESOK · ${esc(s.jamKe ? 'Jam Ke-' + s.jamKe : 'Jadwal Mengajar')}</div>
        <h3>${esc(s.kelas)}</h3>
        <p>${esc(s.mapel)}</p>
        <div class="chips"><span class="chip">${esc(s.hari)}</span></div>
      </div>
      <div class="tomorrow-note">Siap mengajar</div>
    </article>`;
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

let LOAD_TODAY_IN_FLIGHT = null;
let BOOT_IN_FLIGHT = null;
let SECONDARY_LOAD_ID = 0;

async function loadToday(options = {}) {
  if (LOAD_TODAY_IN_FLIGHT && !options.force) return LOAD_TODAY_IN_FLIGHT;

  LOAD_TODAY_IN_FLIGHT = (async () => {
    const hasExistingWorkspace = !!(state.user && state.token);
    if (!hasExistingWorkspace || options.showLoading !== false) {
      renderShell(`<section class="loading-card"><div class="spinner"></div><h2>Memuat jadwal hari ini...</h2><p>Menyiapkan meja kerja Anda.</p></section>`);
    }

    try {
      /*
       * V31.8:
       * Jangan lagi menunggu today + tomorrow + previousLearning sekaligus.
       * Jadwal hari ini adalah data kritis untuk first paint.
       */
      let today = await apiWithRetry('todaySchedule', { token: state.token }, {
        retries: 1,
        timeoutMs: 15000,
        retryDelayMs: 900
      });

      if (!today.success && today.status === 'SESSION_EXPIRED') {
        await bootstrapSession_(true);
        today = await apiWithRetry('todaySchedule', { token: state.token }, {
          retries: 1,
          timeoutMs: 15000,
          retryDelayMs: 900
        });
      }

      if (!today.success) throw new Error(today.message || 'Jadwal hari ini gagal dimuat.');

      state.schedules = today.data || [];
      state.tomorrowSchedules = state.tomorrowSchedules || [];
      state.previousLearning = state.previousLearning || [];
      renderToday(today, null, null);

      /*
       * Data sekunder tidak boleh menghalangi dashboard tampil.
       * Dijalankan setelah first paint.
       */
      const loadId = ++SECONDARY_LOAD_ID;
      Promise.allSettled([
        apiWithRetry('tomorrowSchedule', { token: state.token }, { retries: 1, timeoutMs: 12000, retryDelayMs: 700 }),
        apiWithRetry('previousLearning', { token: state.token }, { retries: 1, timeoutMs: 12000, retryDelayMs: 700 })
      ]).then(results => {
        if (loadId !== SECONDARY_LOAD_ID) return;

        const tomorrow = results[0];
        const previous = results[1];
        if (tomorrow.status === 'fulfilled' && tomorrow.value && tomorrow.value.success) {
          state.tomorrowSchedules = tomorrow.value.data || [];
          state._tomorrowMeta = tomorrow.value;
        }
        if (previous.status === 'fulfilled' && previous.value && previous.value.success) {
          state.previousLearning = previous.value.data || [];
        }

        /* Hanya refresh tampilan jika data sekunder berhasil masuk. */
        renderToday(today, state._tomorrowMeta || null, previous.status === 'fulfilled' ? previous.value : null);
      }).catch(() => {
        /* Dashboard utama sudah tampil, jadi error sekunder tidak boleh merusaknya. */
      });
    } catch (e) {
      showError(e.message);
    } finally {
      LOAD_TODAY_IN_FLIGHT = null;
    }
  })();

  return LOAD_TODAY_IN_FLIGHT;
}

function apiWithRetry(action, params = {}, options = {}) {
  const retries = Number(options.retries ?? 1);
  const timeoutMs = Number(options.timeoutMs ?? 15000);
  const retryDelayMs = Number(options.retryDelayMs ?? 800);

  return new Promise((resolve, reject) => {
    let attempt = 0;

    const run = () => {
      api(action, params, { timeoutMs })
        .then(resolve)
        .catch(err => {
          if (attempt < retries) {
            attempt++;
            setTimeout(run, retryDelayMs);
          } else {
            reject(err);
          }
        });
    };

    run();
  });
}

function previousLearningCard(x){
  const j=x.jurnal||{};
  const hasJournal=Object.values(j).some(v=>String(v??'').trim() && v!=='updatedAt');
  return `<article class="previous-card">
    <div class="previous-top">
      <div><div class="eyebrow">PEMBELAJARAN SEBELUMNYA</div><h3>${esc(x.kelas||'-')}</h3><p>${esc(x.mapel||'-')}</p></div>
      <div class="previous-date">${esc(formatDateLabel(x.tanggal))}<br><small>Pertemuan ${esc(x.pertemuanKe||'-')}</small></div>
    </div>
    <div class="previous-grid">
      <div><b>📚 Materi</b><p>${esc(j.materi||x.keterangan||'Belum ada catatan materi.')}</p></div>
      <div><b>🏫 Kegiatan</b><p>${esc(j.kegiatan||'Belum ada catatan kegiatan pembelajaran.')}</p></div>
      <div><b>🎯 Hasil</b><p>${esc(j.hasil||'Belum ada catatan hasil pembelajaran.')}</p></div>
      <div><b>📝 Catatan</b><p>${esc(j.catatan||'Tidak ada catatan tambahan.')}</p></div>
    </div>
    ${j.tindakLanjut?`<div class="previous-followup"><b>↪ Tindak lanjut:</b> ${esc(j.tindakLanjut)}</div>`:''}
    ${j.kendala?`<div class="previous-warning"><b>⚠ Kendala:</b> ${esc(j.kendala)}</div>`:''}
    ${!hasJournal?'<div class="previous-empty-note">Pertemuan tercatat, tetapi jurnal belum diisi.</div>':''}
  </article>`;
}
function formatDateLabel(v){
  if(!v)return '-';
  const d=new Date(String(v)+'T00:00:00');
  return isNaN(d.getTime())?String(v):d.toLocaleDateString('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
}
function renderToday(r, tomorrow, previous) {
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
    <section class="schedule-list">${list}</section>

    <section class="previous-section">
      <div class="previous-header">
        <div>
          <div class="eyebrow">RIWAYAT PEMBELAJARAN</div>
          <h2>🕘 Pembelajaran Sebelumnya</h2>
          <p>${state.schedules.length ? 'Catatan terakhir untuk jadwal/kelas yang akan Anda ajar hari ini.' : 'Karena hari ini tidak ada jadwal, berikut beberapa kegiatan pembelajaran terakhir Anda.'}</p>
        </div>
        <div class="previous-count"><strong>${state.previousLearning.length}</strong><span>Catatan</span></div>
      </div>
      <section class="previous-list">
        ${state.previousLearning.length ? state.previousLearning.map(previousLearningCard).join('') : `<div class="empty-card previous-empty"><div class="empty-icon">📚</div><h3>Belum ada riwayat pembelajaran</h3><p>Jurnal atau pertemuan sebelumnya belum ditemukan.</p></div>`}
      </section>
    </section>

    <section class="tomorrow-section">
      <div class="tomorrow-header">
        <div>
          <div class="eyebrow">NEXT TEACHING DAY</div>
          <h2>📅 Jadwal Besok</h2>
          <p>${esc(tomorrow?.hari || '')} · ${esc(tomorrow?.tanggal || '')}</p>
        </div>
        <div class="tomorrow-count"><strong>${state.tomorrowSchedules.length}</strong><span>Jadwal</span></div>
      </div>
      <section class="schedule-list">
        ${state.tomorrowSchedules.length
          ? state.tomorrowSchedules.map(tomorrowScheduleCard).join('')
          : `<div class="empty-card tomorrow-empty"><div class="empty-icon">🌤️</div><h3>Besok tidak ada jadwal</h3><p>Tidak ada jadwal mengajar aktif untuk Anda pada hari ${esc(tomorrow?.hari || 'besok')}.</p></div>`}
      </section>
    </section>`);
}

function isTjktLearningHubSchedule(s){
  if(!s)return false;
  const kelas=String(s.kelas||'').toUpperCase().replace(/\s+/g,' ').trim();
  const mapel=String(s.mapel||'').toUpperCase().replace(/\s+/g,' ').trim();
  const kelasTjkt=(kelas.includes('XI')||kelas.includes('XII')) && kelas.includes('TJKT');
  const mapelPilihan=mapel.includes('PILIHAN');
  return kelasTjkt && mapelPilihan;
}

function openMaterials(){
  if(isTjktLearningHubSchedule(state.schedule)){
    const w=window.open(TJKT_LEARNING_HUB_URL,'_blank','noopener,noreferrer');
    if(!w) alert('Browser memblokir tab baru. Izinkan pop-up untuk membuka TJKT Learning Hub.');
    return;
  }
  loadMaterials();
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
      <button class="btn secondary" onclick="openMaterials()">📚 Materi/LKPD ${isTjktLearningHubSchedule(s)?'↗':''}</button>
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
  try{
    const r=await api('getJournal',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID});
    if(!r.success)throw new Error(r.message||'Jurnal gagal dimuat.');
    state.journal=r.data||{};
    renderJournal();
  }catch(e){panelError(e.message);}
}
function renderJournal(){
  const j=state.journal||{}, s=state.schedule||{}, m=state.meeting||{};
  const savedAt=j.UPDATED_AT ? formatDateTime(j.UPDATED_AT) : 'Belum pernah disimpan';
  $('#workspacePanel').innerHTML=`
    <div class="journal-head">
      <div>
        <div class="eyebrow">CATATAN PEMBELAJARAN</div>
        <h2>📝 Jurnal Mengajar</h2>
        <p>Identitas pertemuan terisi otomatis. Anda cukup mencatat proses pembelajaran.</p>
      </div>
      <div class="journal-meta">
        <span>${esc(s.kelas||'-')}</span>
        <span>${esc(s.mapel||'-')}</span>
        <span>Pertemuan ${esc(m.PERTEMUAN_KE||'-')}</span>
        <span>${esc(savedAt)}</span>
      </div>
    </div>

    <form class="journal-form" onsubmit="saveJournal(event)">
      <div class="journal-section">
        <h3>🎯 Perencanaan</h3>
        <label>Tujuan Pembelajaran
          <textarea id="jTujuan" placeholder="Apa yang diharapkan siswa capai pada pertemuan ini?">${esc(j.TUJUAN_PEMBELAJARAN||'')}</textarea>
        </label>
        <label>Materi
          <textarea id="jMateri" placeholder="Materi/topik yang dibahas">${esc(j.MATERI||'')}</textarea>
        </label>
      </div>

      <div class="journal-section">
        <h3>🏫 Pelaksanaan</h3>
        <label>Kegiatan Pembelajaran
          <textarea id="jKegiatan" class="tall" placeholder="Ringkas kegiatan awal, inti, praktik/diskusi, dan penutup">${esc(j.KEGIATAN_PEMBELAJARAN||'')}</textarea>
        </label>
        <label>Hasil Pembelajaran
          <textarea id="jHasil" placeholder="Apa yang berhasil dicapai siswa?">${esc(j.HASIL_PEMBELAJARAN||'')}</textarea>
        </label>
      </div>

      <div class="journal-section">
        <h3>🔎 Refleksi</h3>
        <div class="journal-two">
          <label>Kendala
            <textarea id="jKendala" placeholder="Kendala selama pembelajaran">${esc(j.KENDALA||'')}</textarea>
          </label>
          <label>Tindak Lanjut
            <textarea id="jTL" placeholder="Remedial, pengayaan, pertemuan berikutnya, dll.">${esc(j.TINDAK_LANJUT||'')}</textarea>
          </label>
        </div>
        <label>Catatan
          <textarea id="jCatatan" placeholder="Catatan tambahan">${esc(j.CATATAN||'')}</textarea>
        </label>
      </div>

      <div class="journal-footer">
        <span id="journalSaveInfo">Terakhir disimpan: ${esc(savedAt)}</span>
        <button id="journalSaveBtn" class="btn primary" type="submit">💾 Simpan Jurnal</button>
      </div>
    </form>`;
}
function formatDateTime(v){
  if(!v)return '';
  const d=new Date(v);
  return isNaN(d.getTime())?String(v):d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
}
async function saveJournal(e){
  e.preventDefault();
  const btn=$('#journalSaveBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Menyimpan...';}
  const p={
    tujuan:$('#jTujuan').value.trim(),
    materi:$('#jMateri').value.trim(),
    kegiatan:$('#jKegiatan').value.trim(),
    hasil:$('#jHasil').value.trim(),
    kendala:$('#jKendala').value.trim(),
    tindakLanjut:$('#jTL').value.trim(),
    catatan:$('#jCatatan').value.trim()
  };
  try{
    const r=await api('saveJournal',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,payload:p});
    if(!r.success)throw new Error(r.message||'Gagal menyimpan jurnal.');
    state.journal=r.data||{};
    const info=$('#journalSaveInfo');
    if(info)info.textContent='✓ Jurnal berhasil disimpan sekarang';
    toast(r.message||'Jurnal tersimpan');
  }catch(x){alert(x.message);}
  finally{
    if(btn){btn.disabled=false;btn.textContent='💾 Simpan Jurnal';}
  }
}

async function loadMaterials(){
  panelLoading('Memuat materi dan LKPD...');
  try{
    const r=await api('getMeetingMaterials',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID});
    if(!r.success)throw new Error(r.message||'Materi gagal dimuat.');
    state.materials=r.data||[];renderMaterials();
  }catch(e){panelError(e.message);}
}
function renderMaterials(){
  const list=state.materials||[];
  const cards=list.map(x=>`<div class="resource-card"><div><strong>${esc(x.JUDUL)}</strong><div class="muted">${esc(x.JENIS||'Materi')} · ${esc(x.SUMBER||'')}</div><div class="muted">${esc(x.KETERANGAN||'')}</div></div><div class="resource-actions"><a class="btn primary" href="${esc(x.URL)}" target="_blank" rel="noopener">🔗 Buka</a><button class="btn danger" onclick="deleteMaterial('${esc(x.MATERI_ID)}')">Hapus</button></div></div>`).join('');
  $('#workspacePanel').innerHTML=`<div class="panel-title"><div><h2>📚 Materi & LKPD</h2><p>File tetap berada di Google Drive atau platform sumber.</p></div><button class="btn primary" onclick="showMaterialForm()">＋ Tambah</button></div><div class="resource-list">${cards||'<div class="empty">Belum ada materi.</div>'}</div>`;
}
function showMaterialForm(){
  $('#workspacePanel').innerHTML=`<div class="panel-title"><div><h2>＋ Tambah Materi / LKPD</h2><p>Workspace menyimpan referensi, bukan menyalin file.</p></div></div>
  <form class="material-form" onsubmit="saveMaterial(event)">
  <label>Judul<input id="mJudul" required placeholder="Contoh: LKPD 01"></label>
  <div class="material-two"><label>Jenis<select id="mJenis"><option>Materi</option><option>LKPD</option><option>Video</option><option>Presentasi</option><option>Link Pembelajaran</option><option>Lainnya</option></select></label>
  <label>Sumber<select id="mSumber"><option>Google Drive</option><option>TJKT Learning Hub</option><option>YouTube</option><option>Website</option><option>Lainnya</option></select></label></div>
  <label>Link / URL<input id="mUrl" type="url" required placeholder="https://..."></label>
  <label>Google Drive File ID<input id="mDriveId" placeholder="Opsional"></label>
  <label>Keterangan<textarea id="mKet" placeholder="Keterangan singkat"></textarea></label>
  <div class="journal-footer"><button type="button" class="btn secondary" onclick="loadMaterials()">Batal</button><button class="btn primary">💾 Simpan</button></div></form>`;
}
async function saveMaterial(e){
  e.preventDefault();
  try{
    const r=await api('saveMaterial',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,payload:{judul:$('#mJudul').value.trim(),jenis:$('#mJenis').value,sumber:$('#mSumber').value,url:$('#mUrl').value.trim(),driveFileId:$('#mDriveId').value.trim(),keterangan:$('#mKet').value.trim()}});
    if(!r.success)throw new Error(r.message||'Materi gagal disimpan.');
    state.materials=r.data||[];renderMaterials();toast('Materi berhasil ditambahkan');
  }catch(e){alert(e.message);}
}
async function deleteMaterial(id){
  if(!confirm('Hapus referensi ini? File asli di Google Drive tidak akan dihapus.'))return;
  try{
    const r=await api('deleteMaterial',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,materialId:id});
    if(!r.success)throw new Error(r.message||'Gagal menghapus.');
    state.materials=r.data||[];renderMaterials();toast('Referensi dihapus');
  }catch(e){alert(e.message);}
}

async function loadResources(type){
  panelLoading('Memuat '+(type==='TUGAS'?'tugas':'penilaian')+'...');
  try{
    const r=await api('getResources',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,type});
    if(!r.success)throw new Error(r.message||'Data gagal dimuat.');
    state.resources[type]=r.data||[];
    renderResources(type);
  }catch(e){panelError(e.message);}
}
function renderResources(type){
  const items=state.resources[type]||[];
  const title=type==='TUGAS'?'📋 Tugas Pertemuan':'📊 Penilaian Pertemuan';
  const rows=items.map(x=>{
    const sub=type==='TUGAS'
      ? `${esc(x.JENIS_TUGAS||'INDIVIDU')} · ${esc(x.DEADLINE||'Tanpa deadline')} · Bobot ${esc(x.BOBOT||'-')}`
      : `${esc(x.JENIS||'TUGAS')} · Bobot ${esc(x.BOBOT||'-')} · Maks ${esc(x.NILAI_MAKSIMAL||100)}`;
    const desc=type==='TUGAS'?(x.DESKRIPSI||x.KETERANGAN):(x.KRITERIA||x.KETERANGAN);
    return `<div class="resource-card"><div class="resource-main"><strong>${esc(x.JUDUL||'-')}</strong><div class="muted">${sub}</div><div class="muted">${esc(desc||'')}</div></div><div class="resource-actions">${x.URL?`<a class="btn small" href="${esc(x.URL)}" target="_blank" rel="noopener">🔗 Buka</a>`:''}<button class="btn secondary" onclick="editResource('${type}','${esc(type==='TUGAS'?x.TUGAS_ID:x.PENILAIAN_ID)}')">✏️ Edit</button><button class="btn danger" onclick="deleteResource('${type}','${esc(type==='TUGAS'?x.TUGAS_ID:x.PENILAIAN_ID)}')">Hapus</button></div></div>`;
  }).join('');
  $('#workspacePanel').innerHTML=`<div class="panel-title"><div><h2>${title}</h2><p>${type==='TUGAS'?'Kelola tugas, sumber, deadline, dan bobot.':'Kelola instrumen penilaian dan kriteria untuk tugas/pertemuan ini.'}</p></div><button class="btn primary" onclick="showResourceForm('${type}')">＋ Tambah</button></div><div class="resource-list">${rows||'<div class="empty-inline">Belum ada data.</div>'}</div>`;
}
function findResource(type,id){return (state.resources[type]||[]).find(x=>String(type==='TUGAS'?x.TUGAS_ID:x.PENILAIAN_ID)===String(id))||null;}
function showResourceForm(type,item=null){
  const isTask=type==='TUGAS';
  const x=item||{};
  const taskOptions=(state.resources.TUGAS||[]).map(t=>`<option value="${esc(t.TUGAS_ID)}" ${String(x.TUGAS_ID||x.TUGAS_ID)===String(t.TUGAS_ID)?'selected':''}>${esc(t.JUDUL)}</option>`).join('');
  $('#workspacePanel').innerHTML=`<div class="panel-title"><div><h2>${item?'✏️ Edit':'＋ Tambah'} ${isTask?'Tugas':'Penilaian'}</h2><p>Data terhubung langsung dengan pertemuan ini.</p></div></div>
  <form class="resource-form" onsubmit="saveResourceForm(event,'${type}')">
    <input type="hidden" id="rId" value="${esc(isTask?x.TUGAS_ID||'':x.PENILAIAN_ID||'')}">
    <label>Judul<input id="rJudul" required value="${esc(x.JUDUL||'')}" placeholder="${isTask?'Contoh: LKPD Praktik Konfigurasi Router':'Contoh: Penilaian Praktik Konfigurasi Router'}"></label>
    ${isTask?`<label>Deskripsi<textarea id="rDeskripsi" placeholder="Instruksi singkat tugas">${esc(x.DESKRIPSI||'')}</textarea></label>
    <div class="resource-two"><label>Jenis Tugas<select id="rJenis"><option ${x.JENIS_TUGAS==='INDIVIDU'?'selected':''}>INDIVIDU</option><option ${x.JENIS_TUGAS==='KELOMPOK'?'selected':''}>KELOMPOK</option><option ${x.JENIS_TUGAS==='PRAKTIK'?'selected':''}>PRAKTIK</option><option ${x.JENIS_TUGAS==='PROYEK'?'selected':''}>PROYEK</option></select></label>
    <label>Sumber<select id="rSumber"><option>GOOGLE_DRIVE</option><option>TJKT_LEARNING_HUB</option><option>YOUTUBE</option><option>WEBSITE</option><option>LAINNYA</option></select></label></div>
    <label>Link / URL<input id="rUrl" type="url" value="${esc(x.URL||'')}" placeholder="https://..."></label>
    <label>Google Drive File ID<input id="rDriveId" value="${esc(x.DRIVE_FILE_ID||'')}" placeholder="Opsional"></label>
    <div class="resource-two"><label>Deadline<input id="rDeadline" type="datetime-local" value="${esc(toDatetimeLocal(x.DEADLINE||''))}"></label><label>Bobot<input id="rBobot" type="number" min="0" max="100" step="0.01" value="${esc(x.BOBOT||'')}" placeholder="Contoh 20"></label></div>
    <label>Keterangan<textarea id="rKet">${esc(x.KETERANGAN||'')}</textarea></label>`:
    `<div class="resource-two"><label>Jenis<select id="rJenis"><option ${x.JENIS==='TUGAS'?'selected':''}>TUGAS</option><option ${x.JENIS==='PRAKTIK'?'selected':''}>PRAKTIK</option><option ${x.JENIS==='PROYEK'?'selected':''}>PROYEK</option><option ${x.JENIS==='QUIZ'?'selected':''}>QUIZ</option><option ${x.JENIS==='PRESENTASI'?'selected':''}>PRESENTASI</option></select></label>
    <label>Bobot<input id="rBobot" type="number" min="0" max="100" step="0.01" value="${esc(x.BOBOT||'')}" placeholder="Contoh 30"></label></div>
    <label>Tugas terkait<select id="rTugas"><option value="">Tidak dikaitkan ke tugas tertentu</option>${taskOptions}</select></label>
    <label>Kriteria Penilaian<textarea id="rKriteria" required placeholder="Contoh: Ketepatan konfigurasi, kerapian dokumentasi, troubleshooting">${esc(x.KRITERIA||'')}</textarea></label>
    <label>Nilai Maksimal<input id="rMax" type="number" min="1" value="${esc(x.NILAI_MAKSIMAL||100)}"></label>
    <label>Keterangan<textarea id="rKet">${esc(x.KETERANGAN||'')}</textarea></label>`}
    <div class="journal-footer"><button type="button" class="btn secondary" onclick="loadResources('${type}')">Batal</button><button class="btn primary">💾 Simpan</button></div>
  </form>`;
}
function toDatetimeLocal(v){if(!v)return '';const d=new Date(v);if(isNaN(d.getTime()))return String(v).replace(' ','T').slice(0,16);const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;}
function editResource(type,id){const item=findResource(type,id);if(item)showResourceForm(type,item);}
async function saveResourceForm(e,type){
  e.preventDefault();
  const isTask=type==='TUGAS';
  const p={id:$('#rId').value.trim(),judul:$('#rJudul').value.trim(),status:'AKTIF',bobot:$('#rBobot').value.trim(),keterangan:$('#rKet').value.trim()};
  if(isTask){p.deskripsi=$('#rDeskripsi').value.trim();p.jenisTugas=$('#rJenis').value;p.sumber=$('#rSumber').value;p.url=$('#rUrl').value.trim();p.driveFileId=$('#rDriveId').value.trim();p.deadline=$('#rDeadline').value;}
  else {p.jenis=$('#rJenis').value;p.tugasId=$('#rTugas').value;p.kriteria=$('#rKriteria').value.trim();p.nilaiMaksimal=$('#rMax').value;}
  try{const r=await api('saveResource',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,type,payload:p});if(!r.success)throw new Error(r.message||'Gagal menyimpan.');state.resources[type]=r.data||[];renderResources(type);toast(r.message||'Data tersimpan');}catch(e){alert(e.message);}
}
async function deleteResource(type,id){
  if(!confirm('Hapus data ini dari pertemuan?'))return;
  try{const r=await api('deleteResource',{token:state.token,meetingId:state.meeting.PERTEMUAN_ID,type,resourceId:id});if(!r.success)throw new Error(r.message||'Gagal menghapus.');state.resources[type]=r.data||[];renderResources(type);toast('Data berhasil dihapus');}catch(e){alert(e.message);}
}

function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),1800);}

async function bootstrapSession_(force = false) {
  if (BOOT_IN_FLIGHT && !force) return BOOT_IN_FLIGHT;

  BOOT_IN_FLIGHT = (async () => {
    try {
      const r = await apiWithRetry('v24Bootstrap', {}, {
        retries: 2,
        timeoutMs: 15000,
        retryDelayMs: 900
      });
      if (!r.success) throw new Error(r.message || 'Bootstrap gagal.');
      state.token = r.token;
      state.user = r.user;
      saveSession();
      return r;
    } finally {
      BOOT_IN_FLIGHT = null;
    }
  })();

  return BOOT_IN_FLIGHT;
}

async function boot(){
  if (BOOT_IN_FLIGHT || LOAD_TODAY_IN_FLIGHT) return;

  $('#app').innerHTML=`<div class="shell center-page"><div class="loading-card"><div class="spinner"></div><h2>Menyiapkan Personal Workspace...</h2><p>Menghubungkan ke Google Apps Script.</p></div></div>`;

  try{
    /*
     * V31.8: refresh browser tidak perlu membuat session baru setiap kali.
     * Gunakan session localStorage terlebih dahulu.
     */
    let restored = false;
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY) || '';
      const savedUser = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      if (savedToken && savedUser) {
        state.token = savedToken;
        state.user = savedUser;
        restored = true;
      }
    } catch (_) {}

    if (!restored) {
      await bootstrapSession_(false);
    }

    await loadToday({showLoading:false});
  }catch(e){
    showError(e.message);
  }
}

function injectCSS(){
  if($('#v25css'))return;
  const s=document.createElement('style');s.id='v25css';s.textContent=`
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f7fb;color:#14213d}button,input,textarea,select{font:inherit}.topbar{background:linear-gradient(135deg,#123c48,#0e2538);color:#fff}.topbar-inner{max-width:1120px;margin:auto;padding:20px 24px;display:flex;justify-content:space-between;align-items:center}.brand{font-size:20px;font-weight:900}.brand span{font-weight:500;opacity:.75}.teacher-name{font-size:13px;opacity:.8;margin-top:4px}.shell{max-width:1120px;margin:auto;padding:28px 24px 60px}.hero{background:linear-gradient(135deg,#fff,#eef7fa);border:1px solid #dbe5ec;border-radius:24px;padding:28px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 12px 35px #17324a12}.eyebrow{font-size:11px;font-weight:900;letter-spacing:.14em;color:#237487}.hero h1,.meeting-head h1{margin:5px 0;font-size:34px}.hero p,.meeting-head p{margin:0;color:#68778b}.hero-stat{width:90px;height:90px;border-radius:20px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #dbe5ec}.hero-stat strong{font-size:30px}.hero-stat span{font-size:12px;color:#718096}.section-head{margin:30px 0 14px}.section-head h2,.panel-title h2{margin:0}.section-head p,.panel-title p{margin:5px 0;color:#718096}.schedule-list{display:grid;gap:14px}.schedule-card{background:#fff;border:1px solid #dce5ed;border-radius:18px;padding:20px;display:grid;grid-template-columns:130px 1fr auto;gap:20px;align-items:center}.schedule-time{font-weight:900;font-size:20px;color:#173f4a}.schedule-main h3{margin:4px 0;font-size:21px}.schedule-main p{margin:0;color:#617083}.chips{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap}.chip{padding:5px 9px;border-radius:999px;background:#edf2f6;font-size:11px;font-weight:800}.chip.green{background:#dcfce7;color:#166534}.chip.orange{background:#ffedd5;color:#9a3412}.btn{border:0;border-radius:11px;padding:10px 15px;font-weight:800;cursor:pointer}.btn.primary{background:#2563eb;color:white}.btn.secondary{background:#eaf0f5;color:#17324a}.btn.ghost{background:#ffffff1c;color:#fff}.btn.danger{background:#dc2626;color:#fff}.btn.small{padding:7px 10px;text-decoration:none;background:#eaf0f5;color:#17324a;font-size:12px}.back{border:0;background:none;color:#2563eb;font-weight:800;cursor:pointer;padding:0;margin-bottom:15px}.meeting-head{background:#fff;border:1px solid #dce5ed;border-radius:20px;padding:24px;display:flex;justify-content:space-between;align-items:center}.meeting-status{padding:8px 13px;border-radius:999px;font-weight:900;font-size:12px}.meeting-status.blue{background:#dbeafe;color:#1d4ed8}.meeting-status.green{background:#dcfce7;color:#166534}.meeting-status.gray{background:#e5e7eb;color:#374151}.action-row{display:flex;gap:9px;flex-wrap:wrap;margin:16px 0}.workspace-panel{background:#fff;border:1px solid #dce5ed;border-radius:20px;padding:22px;min-height:260px}.welcome-workspace{text-align:center;padding:45px 20px;color:#718096}.big-icon{font-size:48px}.loading-card,.error-card,.empty-card{background:#fff;border:1px solid #dce5ed;border-radius:20px;padding:45px;text-align:center;max-width:680px;margin:80px auto}.center-page{min-height:75vh;display:flex;align-items:center;justify-content:center}.error-card{margin:0}.error-icon,.empty-icon{font-size:42px}.spinner{width:32px;height:32px;border:4px solid #dbe5ed;border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 15px}@keyframes spin{to{transform:rotate(360deg)}}.panel-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px}.table-wrap{overflow:auto;border:1px solid #e3e9ef;border-radius:14px}table{width:100%;border-collapse:collapse;min-width:700px}th,td{padding:11px 12px;border-bottom:1px solid #edf1f4;text-align:left;font-size:13px}th{background:#f7fafc;font-size:11px;text-transform:uppercase;letter-spacing:.04em}td small{display:block;color:#8995a3;margin-top:2px}select{padding:7px 9px;border:1px solid #cfd9e2;border-radius:8px;background:#fff}.panel-loading{text-align:center;padding:60px}.panel-error{padding:18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;color:#9a3412}.form-grid{display:grid;gap:14px}.form-grid label{display:grid;gap:6px;font-size:13px;font-weight:800}.form-grid textarea{min-height:90px;resize:vertical;border:1px solid #ccd7e0;border-radius:10px;padding:10px}.resource-list{display:grid;gap:10px;margin-bottom:15px}.resource{border:1px solid #e0e7ee;border-radius:13px;padding:14px;display:flex;justify-content:space-between;gap:15px;align-items:center}.resource p{margin:4px 0 0;color:#718096;font-size:13px}.empty-inline{padding:25px;text-align:center;color:#8995a3;background:#f8fafc;border-radius:12px}.resource-list{display:grid;gap:10px}.resource-card{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid #e2e8ef;border-radius:14px;padding:14px;background:#fff}.resource-card strong{font-size:14px}.resource-card .muted{font-size:12px;color:#718096;margin-top:4px}.resource-actions{display:flex;gap:7px}.material-form{display:grid;gap:12px}.material-form label{display:grid;gap:6px;font-size:13px;font-weight:800}.material-form input,.material-form select,.material-form textarea{border:1px solid #ccd7e0;border-radius:10px;padding:10px;background:#fff}.material-form textarea{min-height:80px;resize:vertical}.material-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.journal-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.journal-head h2{margin:4px 0}.journal-head p{margin:5px 0;color:#718096}.journal-meta{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}.journal-meta span{background:#f1f5f9;border:1px solid #dbe4eb;padding:7px 10px;border-radius:9px;font-size:11px;font-weight:800;color:#536579}.journal-form{display:grid;gap:14px}.journal-section{border:1px solid #e2e8ef;border-radius:15px;padding:16px;background:#fbfdff}.journal-section h3{margin:0 0 12px;font-size:15px}.journal-form label{display:grid;gap:6px;font-size:13px;font-weight:800;margin-bottom:12px}.journal-form textarea{min-height:82px;resize:vertical;border:1px solid #ccd7e0;border-radius:10px;padding:11px;background:#fff}.journal-form textarea.tall{min-height:125px}.journal-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.journal-footer{display:flex;justify-content:space-between;align-items:center;gap:15px;color:#718096;font-size:12px}.recap-summary{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.recap-summary span{background:#eef4f8;border:1px solid #dce6ed;padding:8px 11px;border-radius:10px;font-size:12px}.recap-summary b{margin-left:4px}.resource-form{display:grid;gap:12px}.resource-form label{display:grid;gap:6px;font-size:13px;font-weight:800}.resource-form input,.resource-form select,.resource-form textarea{border:1px solid #ccd7e0;border-radius:10px;padding:10px;background:#fff}.resource-form textarea{min-height:90px;resize:vertical}.resource-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.resource-main{flex:1}.resource-actions{display:flex;gap:7px;flex-wrap:wrap}.muted{font-size:12px;color:#718096;margin-top:4px}.empty{padding:30px;text-align:center;color:#8995a3;background:#f8fafc;border-radius:12px}.toast{position:fixed;right:22px;bottom:22px;background:#14213d;color:white;padding:11px 15px;border-radius:10px;box-shadow:0 8px 25px #0003;font-size:13px}.previous-section{margin-top:34px}.previous-header{background:linear-gradient(135deg,#eef6ff,#fff);border:1px solid #cfe0f5;border-radius:20px;padding:20px 24px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}.previous-header h2{margin:4px 0}.previous-header p{margin:4px 0 0;color:#718096}.previous-count{width:70px;height:70px;border-radius:16px;background:#fff;border:1px solid #cfe0f5;display:flex;flex-direction:column;align-items:center;justify-content:center}.previous-count strong{font-size:25px}.previous-count span{font-size:11px;color:#2563eb}.previous-list{display:grid;gap:12px}.previous-card{background:#fff;border:1px solid #dbe5ef;border-radius:18px;padding:18px}.previous-top{display:flex;justify-content:space-between;gap:15px;align-items:flex-start}.previous-top h3{margin:4px 0;font-size:18px}.previous-top p{margin:0;color:#617083}.previous-date{text-align:right;font-size:12px;font-weight:800;color:#2563eb}.previous-date small{color:#718096}.previous-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.previous-grid>div{background:#f8fafc;border:1px solid #e7edf2;border-radius:12px;padding:12px}.previous-grid b{font-size:12px}.previous-grid p{margin:6px 0 0;color:#526274;font-size:13px;line-height:1.5;white-space:pre-wrap}.previous-followup,.previous-warning,.previous-empty-note{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:12px}.previous-followup{background:#eff6ff;color:#1d4ed8}.previous-warning{background:#fff7ed;color:#9a3412}.previous-empty-note{background:#f8fafc;color:#718096}.tomorrow-section{margin-top:34px}.tomorrow-header{background:linear-gradient(135deg,#fff7ed,#fff);border:1px solid #fed7aa;border-radius:20px;padding:20px 24px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}.tomorrow-header h2{margin:4px 0}.tomorrow-header p{margin:4px 0 0;color:#718096}.tomorrow-count{width:70px;height:70px;border-radius:16px;background:#fff;border:1px solid #fed7aa;display:flex;flex-direction:column;align-items:center;justify-content:center}.tomorrow-count strong{font-size:25px}.tomorrow-count span{font-size:11px;color:#9a3412}.tomorrow-card{border-color:#fed7aa;background:#fffdf9}.tomorrow-note{padding:8px 11px;border-radius:999px;background:#ffedd5;color:#9a3412;font-size:11px;font-weight:900;white-space:nowrap}@media(max-width:760px){.previous-header{align-items:flex-start;gap:15px}.previous-top{flex-direction:column}.previous-date{text-align:left}.previous-grid{grid-template-columns:1fr}.journal-head{flex-direction:column}.journal-meta{justify-content:flex-start}.journal-two{grid-template-columns:1fr}.resource-two{grid-template-columns:1fr}.resource-card{align-items:flex-start}.shell{padding:18px 14px 40px}.schedule-card{grid-template-columns:1fr}.hero h1,.meeting-head h1{font-size:28px}.hero-stat{width:70px;height:70px}.meeting-head{gap:15px;align-items:flex-start}.schedule-card .btn{width:100%}}
  `;document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded',()=>{injectCSS();boot();});
