// ============================================================
// SPECIALIST.JS — Lógica da área do especialista
// ============================================================

let currentSpecialist = null;
let specialistData    = null;
let cachedMensagens   = null;
let _specAllApts      = [];
let _specPeriod       = 'semana';

const MSG_DEFAULTS = {
  confirmado: `Olá! A J&E ESTÉTICA agradece a preferência. ✅ Seu agendamento foi *confirmado*!\n\nCompareça com até *10 min de antecedência* para vistoria junto ao especialista.\nTolerância de atrasos de até 15 min.`,
  concluido:  `Olá! A J&E ESTÉTICA agradece a preferência. 🎉 O serviço em seu veículo foi *concluído*!\n\nObrigado e volte sempre! 🚗✨`
};

function getEarningsDate(a) {
  if (a.status === 'concluido' && a.updatedAt) {
    try {
      const d = a.updatedAt.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
      return d.toISOString().split('T')[0];
    } catch(e) {}
  }
  return a.data;
}

async function loadCachedMensagens() {
  try {
    const doc = await db.collection('settings').doc('mensagens').get();
    cachedMensagens = doc.exists ? doc.data() : {};
  } catch(e) { cachedMensagens = {}; }
}

function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentSpecialist = await checkSession('specialist');
    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push(async function(OneSignal) {
        OneSignal.User.addTag('role', 'specialist');
      });
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    await Promise.all([loadSpecialistProfile(), loadCachedMensagens()]);
    await loadMyAppointments();
    setupNav();
    setupStatCards();
  } catch (e) {
    console.error('Specialist init:', e);
  }
});

// ---- Perfil ----
async function loadSpecialistProfile() {
  const nomeEl = document.getElementById('prof-nome');
  try {
    if (!currentSpecialist.specialistId) {
      if (nomeEl) nomeEl.textContent = 'Erro: perfil não vinculado. Fale com o ADM.';
      return;
    }
    const doc = await db.collection('specialists').doc(currentSpecialist.specialistId).get();
    if (!doc.exists) {
      if (nomeEl) nomeEl.textContent = 'Erro: especialista não encontrado.';
      return;
    }
    specialistData = { id: doc.id, ...doc.data() };
    renderProfile();
    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push(async function(OneSignal) {
        OneSignal.User.addTag('specialistId', specialistData.id);
      });
    }
  } catch(e) {
    console.error('[ESP] Erro ao carregar perfil:', e);
    if (nomeEl) nomeEl.textContent = 'Erro: ' + e.message;
  }
}



// ============================================================
// MEUS GANHOS
// ============================================================



function changeGanhosPeriod(btn, period) {
  _specPeriod = period;
  document.querySelectorAll('#ganhos-period-btns .filter-btn')
    .forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGanhos(_specAllApts, period);
}

function getSpecPeriodRange(period) {
  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  if (period === 'total') return { ini: '0000-00-00', fim: '9999-99-99' };

  if (period === 'semana') {
    const dow = now.getDay();
    const ini = new Date(now); ini.setDate(now.getDate() - dow);
    const fim = new Date(now); fim.setDate(now.getDate() + (6 - dow));
    return { ini: ini.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] };
  }

  if (period === 'mes') {
    const ini = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    return { ini, fim: today };
  }

  if (period === 'ano') {
    const ini = `${now.getFullYear()}-01-01`;
    return { ini, fim: today };
  }

  return { ini: '0000-00-00', fim: '9999-99-99' };
}

function renderGanhos(all, period) {
  const valorEl   = document.getElementById('ganhos-valor');
  const subEl     = document.getElementById('ganhos-sub');
  const labelEl   = document.getElementById('ganhos-label');
  const detalheEl = document.getElementById('ganhos-detalhe');
  if (!valorEl) return;

  const labels = { semana:'Esta Semana', mes:'Este Mês', ano:'Este Ano', total:'Total Geral' };
  if (labelEl) labelEl.textContent = labels[period] || '';

  const { ini, fim } = getSpecPeriodRange(period);

  // Filtra todos os agendamentos concluídos do especialista (sem restrição de período)
  const todosConc = all.filter(a => a.status === 'concluido');

  // Filtra pelo período selecionado (para o hero)
  const concluidos = todosConc.filter(a => a.data >= ini && a.data <= fim);

  const totalVal = concluidos.reduce((s, a) => s + (Number(a.preco) || 0), 0);
  valorEl.textContent = 'R$ ' + totalVal.toFixed(2);
  subEl.textContent   = `${concluidos.length} serviço${concluidos.length !== 1 ? 's' : ''} concluído${concluidos.length !== 1 ? 's' : ''}`;

  if (!detalheEl) return;

  // ---- Sempre monta as barras do período, independente de ter dados ----
  let linhas = [];

  if (period === 'semana') {
    const dias   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const now    = new Date();
    const dow    = now.getDay();
    const semIni = new Date(now); semIni.setDate(now.getDate() - dow);
    const todayIso = now.toISOString().split('T')[0];

    linhas = Array.from({ length: 7 }, (_, i) => {
      const d   = new Date(semIni); d.setDate(semIni.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const apts = todosConc.filter(a => a.data === iso);  // usa todosConc (sem filtro de período)
      const val  = apts.reduce((s, a) => s + (Number(a.preco) || 0), 0);
      return { label: dias[d.getDay()] + ' ' + d.getDate(), val, qtd: apts.length, today: iso === todayIso };
    });

  } else if (period === 'mes') {
    const now = new Date();
    const ano = now.getFullYear();
    const mes = now.getMonth() + 1;
    // Quantas semanas tem o mês atual
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const numSemanas = Math.ceil(diasNoMes / 7);
    const weeks = {};

    // Usa concluidos filtrados pelo mês
    concluidos.forEach(a => {
      const day = parseInt(a.data.slice(8, 10));
      const wk  = Math.ceil(day / 7);
      const key = `Sem ${wk}`;
      if (!weeks[key]) weeks[key] = { val: 0, qtd: 0 };
      weeks[key].val += Number(a.preco) || 0;
      weeks[key].qtd++;
    });

    linhas = Array.from({ length: numSemanas }, (_, i) => {
      const key = `Sem ${i+1}`;
      const dIni = i * 7 + 1;
      const dFim = Math.min((i+1) * 7, diasNoMes);
      return {
        label: `${dIni}–${dFim}`,
        val:   weeks[key]?.val || 0,
        qtd:   weeks[key]?.qtd || 0
      };
    });

  } else if (period === 'ano') {
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const curMes = new Date().getMonth() + 1;
    const byMes  = {};

    // Usa todos os concluídos do ano atual
    const anoAtual = String(new Date().getFullYear());
    todosConc
      .filter(a => a.data.startsWith(anoAtual))
      .forEach(a => {
        const m = a.data.slice(5, 7);
        if (!byMes[m]) byMes[m] = { val: 0, qtd: 0 };
        byMes[m].val += Number(a.preco) || 0;
        byMes[m].qtd++;
      });

    linhas = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      return {
        label:  meses[i],
        val:    byMes[m]?.val || 0,
        qtd:    byMes[m]?.qtd || 0,
        future: (i + 1) > curMes
      };
    });

  } else {
    // Total: agrupa por ano
    const byAno = {};
    todosConc.forEach(a => {
      const ano = a.data ? a.data.slice(0, 4) : 'N/A';
      if (!byAno[ano]) byAno[ano] = { val: 0, qtd: 0 };
      byAno[ano].val += Number(a.preco) || 0;
      byAno[ano].qtd++;
    });

    linhas = Object.entries(byAno)
      .sort()
      .map(([ano, { val, qtd }]) => ({ label: ano, val, qtd }));

    // Se nunca houve nenhum concluído, mostra mensagem
    if (!linhas.length) {
      detalheEl.innerHTML = '<p style="color:var(--text-2);font-size:13px;text-align:center;padding:20px">Nenhum serviço concluído ainda.</p>';
      return;
    }
  }

  const maxVal = Math.max(...linhas.map(l => l.val), 1);

  detalheEl.innerHTML = `
    <div class="ganhos-bars">
      ${linhas.map(l => `
        <div class="ganhos-bar-col ${l.today ? 'today' : ''} ${l.future ? 'future' : ''}">
          <div class="ganhos-bar-label-val">${l.val > 0 ? 'R$&nbsp;' + l.val.toFixed(0) : ''}</div>
          <div class="ganhos-bar-outer">
            <div class="ganhos-bar-inner" style="height:${l.val > 0 ? Math.max((l.val / maxVal) * 100, 4) : 0}%"></div>
          </div>
          <div class="ganhos-bar-label">${l.label}</div>
          <div class="ganhos-bar-qtd">${l.qtd > 0 ? l.qtd + '×' : ''}</div>
        </div>`
      ).join('')}
    </div>`;
}

async function loadGanhos() {
  if (!specialistData) return;
  try {
    const snap = await db.collection('appointments')
      .where('specialistId', '==', specialistData.id)
      .get();
    _specAllApts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGanhos(_specAllApts, _specPeriod);
  } catch(e) {
    const el = document.getElementById('ganhos-detalhe');
    if (el) el.innerHTML = '<p style="color:var(--danger);font-size:13px">Erro ao carregar ganhos.</p>';
    console.error(e);
  }
}

function renderProfile() {
  const sp = specialistData;
  const fotoEl = document.getElementById('prof-foto');
  const nomeEl = document.getElementById('prof-nome');
  const espEl  = document.getElementById('prof-esp');
  const foneEl = document.getElementById('prof-fone');
  const navNome = document.getElementById('nav-spec-nome');

  if (fotoEl) fotoEl.src = sp.fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(sp.nome)}&background=1A1F2E&color=00D4FF&bold=true&size=128`;
  if (nomeEl) nomeEl.textContent = sp.nome;
  if (espEl)  espEl.textContent  = (sp.especialidades || []).join(' · ') || 'Especialista';
  if (foneEl) foneEl.textContent = sp.fone || '—';
  if (navNome) navNome.textContent = sp.nome?.split(' ')[0] || 'Especialista';
}

// ---- Alterar foto de perfil ----
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('foto-input')?.addEventListener('change', async function() {
    if (!this.files[0] || !specialistData) return;
    const btn = document.getElementById('btn-change-foto');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try {
      const url = await uploadToCloudinary(this.files[0], 'specialists');
      await db.collection('specialists').doc(specialistData.id).update({ fotoUrl: url });
      specialistData.fotoUrl = url;
      renderProfile();
      toast('Foto atualizada!', 'success');
    } catch (e) {
      toast('Erro ao atualizar foto: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '📷 Alterar Foto'; }
    }
  });

  document.getElementById('btn-logout-spec')?.addEventListener('click', logoutUser);
});

// ---- Meus agendamentos ----
async function loadMyAppointments(filter = 'todos') {
  const tbody = document.getElementById('my-appointments-tbody');
  if (!tbody || !specialistData) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px"><span class="spinner"></span></td></tr>';
  try {
    const snap = await db.collection('appointments')
      .where('specialistId', '==', specialistData.id).get();
    _specAllApts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _specAllApts.sort((a, b) => {
      const dc = (b.data || '').localeCompare(a.data || '');
      return dc !== 0 ? dc : (b.hora || '').localeCompare(a.hora || '');
    });
    const today = new Date().toISOString().split('T')[0];
    const todayDate = today;
    const totalPendentes = _specAllApts.filter(a => a.status === 'pendente').length;
    setVal('spec-total',    _specAllApts.length);
    setVal('spec-hoje',     _specAllApts.filter(a => a.data === today).length);
    setVal('spec-pendentes', totalPendentes);
    atualizarBadge(totalPendentes);
    renderGanhos(_specAllApts, _specPeriod);
    const filtered = filter === 'todos'  ? _specAllApts
                   : filter === 'hoje'   ? _specAllApts.filter(a => a.data === todayDate)
                   : _specAllApts.filter(a => a.status === filter);
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-2);padding:24px">Nenhum agendamento</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(a => {
      const acoes = [
        a.status === 'pendente'
          ? `<button class="btn btn-primary btn-sm" onclick="specUpdateStatus('${a.id}','confirmado','${a.clienteFone}')">✔ Confirmar</button>`
          : '',
        a.status === 'confirmado'
          ? `<button class="btn btn-success btn-sm" onclick="specUpdateStatus('${a.id}','concluido','${a.clienteFone}')">✅ Concluir</button>`
          : '',
      ].filter(Boolean).join('');
      return `
      <tr>
        <td>${formatDate(a.data)} <strong>${a.hora}</strong></td>
        <td>${a.clienteNome}</td>
        <td>${a.clienteFone}</td>
        <td>${a.serviceNome}</td>
        <td><span class="badge badge-${a.status}">${labelStatus(a.status)}</span></td>
        <td><div style="display:flex;gap:6px">${acoes}</div></td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--danger);padding:16px">Erro ao carregar</td></tr>';
    console.error(e);
  }
}

async function specUpdateStatus(id, status, phone) {
  // ⚡ WhatsApp ANTES de qualquer await (mobile bloqueia window.open após async)
  if (phone && (status === 'confirmado' || status === 'concluido')) {
    const phoneNum = phone.replace(/\D/g, '');
    const phoneWA  = phoneNum.startsWith('55') ? phoneNum : '55' + phoneNum;
    const msgs     = cachedMensagens || {};
    const msg      = status === 'confirmado'
      ? (msgs.confirmado || MSG_DEFAULTS.confirmado)
      : (msgs.concluido  || MSG_DEFAULTS.concluido);
    window.open(`https://wa.me/${phoneWA}?text=${encodeURIComponent(msg)}`, '_blank');
  }
  try {
    await db.collection('appointments').doc(id).update({
      status,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast(status === 'confirmado' ? 'Agendamento confirmado! ✔' : 'Serviço concluído! ✅', 'success');
    const activeFilter = document.querySelector('#page-agendamentos .filter-btn.active')?.getAttribute('data-filter') || 'todos';
    await loadMyAppointments(activeFilter);
  } catch(e) {
    toast('Erro ao atualizar: ' + e.message, 'error');
  }
}

function goToAppointments(filter) {
  showPage('agendamentos');
  document.querySelectorAll('#page-agendamentos .filter-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-filter') === filter);
  });
  loadMyAppointments(filter);
}

function setupStatCards() {
  [{ id:'spec-hoje', filter:'hoje' }, { id:'spec-pendentes', filter:'pendente' }, { id:'spec-total', filter:'todos' }]
  .forEach(({ id, filter }) => {
    const el = document.getElementById(id)?.closest('.stat-card');
    if (!el) return;
    el.style.cursor = 'pointer';
    el.style.transition = 'transform 0.15s';
    el.addEventListener('click', () => goToAppointments(filter));
    el.addEventListener('mouseenter', () => el.style.transform = 'translateY(-2px)');
    el.addEventListener('mouseleave', () => el.style.transform = '');
  });
}

function atualizarBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(() => {});
    else navigator.clearAppBadge().catch(() => {});
  }
  // Atualizar título da aba como fallback
  if (count > 0) document.title = `(${count}) J&E Estética — Especialista`;
  else document.title = 'J&E Estética Automotiva — Especialista';
}

function setupNav() {
  document.querySelectorAll('.sidebar-item[data-page]').forEach(item => {
    item.addEventListener('click', () => showPage(item.getAttribute('data-page')));
  });
  document.querySelectorAll('#page-agendamentos .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-agendamentos .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadMyAppointments(btn.getAttribute('data-filter'));
    });
  });
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('visible');
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('visible');
  });
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(i =>
    i.classList.toggle('active', i.getAttribute('data-page') === name));
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function labelStatus(s) {
  return { pendente:'Pendente', confirmado:'Confirmado', concluido:'Concluído', cancelado:'Cancelado' }[s] || s;
}
function formatDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;

// ============================================================
// NOTIFICAÇÃO EM TEMPO REAL — Novos agendamentos via Firestore
// ============================================================
function tocarSomAlerta() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 150, 300].forEach(delay => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay/1000);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay/1000 + 0.3);
      osc.start(ctx.currentTime + delay/1000);
      osc.stop(ctx.currentTime + delay/1000 + 0.3);
    });
  } catch(e) {}
}

function setupNovosAgendamentosListener(specialistId) {
  let primeiraVez = true;
  db.collection('appointments')
    .where('specialistId', '==', specialistId)
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      if (primeiraVez) { primeiraVez = false; return; }
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const apt = change.doc.data();
          tocarSomAlerta();
          toast(`📅 Novo agendamento! ${apt.clienteNome} — ${apt.serviceNome} ${apt.data} às ${apt.hora}`, 'info');
          loadMyAppointments().then(() => {
            const pendentes = (_specAllApts || []).filter(a => a.status === 'pendente').length;
            atualizarBadge(pendentes);
          });
          setupStatCards();
        }
      });
    });
}

}
