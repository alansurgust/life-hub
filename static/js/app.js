
window.switchMobileKanbanCol = function(colName) {
  const cols = ['unclassified', 'categorized', 'other'];
  cols.forEach(c => {
    const colEl = document.getElementById(kanbanCol_);
    const btnEl = document.getElementById(mColBtn_);
    if (colEl) {
      if (c === colName) {
        colEl.classList.remove('max-md:hidden');
        colEl.classList.remove('hidden');
        colEl.classList.add('flex');
      } else {
        colEl.classList.add('max-md:hidden');
        colEl.classList.add('hidden');
      }
      colEl.classList.add('md:flex');
    }
    if (btnEl) {
      if (c === colName) {
        btnEl.className = 'flex-1 py-2 text-xs font-bold rounded-xl transition bg-[#233329] text-[#FFFDF9] shadow-xs cursor-pointer';
      } else {
        btnEl.className = 'flex-1 py-2 text-xs font-bold rounded-xl transition text-[#786B60] hover:text-[#2B231D] cursor-pointer';
      }
    }
  });
};
/**
 * Finance - Client-side Application Logic v2.0
 * Features:
 * - 3-Column Categorization Board (Đã phân loại, Chưa phân loại < 65%, Khác)
 * - Instant automatic column transition on category change
 * - One-click Header Reload
 * - Instant offline startup & D:\app\finance data storage
 */

// Global State
let state = {
  selectedMonth: null, // Auto-selects latest uploaded month on load
  availableMonths: [],
  selectedCategory: 'all',
  selectedType: 'all',
  searchQuery: '',
  columnSearchQuery: '',
  viewMode: 'columns', // 'columns' or 'table'
  currentPage: 1,
  pageSize: 25,
  totalTransactions: 0,
  categories: [],
  selectedFile: null,
  activeChartTab: 'weekly',
  columnsData: {
    categorized: [],
    unclassified: [],
    other: [],
    stats: {}
  }
};

// Chart.js Instances
let charts = {
  pie: null,
  weekly: null,
  monthly: null
};

// ----------------- UTILITY FUNCTIONS -----------------

function formatMoney(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Math.round(Number(val)).toLocaleString('vi-VN');
}

function formatCurrency(val) {
  return `${formatMoney(val)} ₫`;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  let bgClass = 'bg-[#2B231D] text-[#FFFDF9] border border-[#1E1712] shadow-lg';
  let iconName = 'info';

  if (type === 'success') {
    bgClass = 'bg-[#5F7465] text-[#FFFDF9] border border-[#4B5E51] shadow-lg';
    iconName = 'check-circle-2';
  } else if (type === 'error') {
    bgClass = 'bg-[#B14720] text-[#FFFDF9] border border-[#913716] shadow-lg';
    iconName = 'alert-triangle';
  }

  toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-semibold ${bgClass} toast-enter transition duration-300`;
  toast.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i><span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ----------------- INITIALIZATION -----------------

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    // Action menu
    const btn = document.getElementById('actionMenuBtn');
    const menu = document.getElementById('actionMenuDropdown');
    if (menu && !menu.classList.contains('hidden') && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }

    // Month menu
    const mBtn = document.getElementById('monthDropdownBtn');
    const mMenu = document.getElementById('monthDropdownMenu');
    if (mMenu && !mMenu.classList.contains('hidden') && mBtn && !mBtn.contains(e.target) && !mMenu.contains(e.target)) {
      mMenu.classList.add('hidden');
    }

    // Global Floating Category Picker
    const catPicker = document.getElementById('globalCategoryPicker');
    if (catPicker && !catPicker.classList.contains('hidden') && !catPicker.contains(e.target)) {
      closeCardCategoryPicker();
    }
  });

  // Close floating picker on scroll so it stays anchored cleanly
  window.addEventListener('scroll', () => closeCardCategoryPicker(), true);

  await loadCategories();
  await loadSettings();
  await refreshDashboard();
});

// One-click Reload function for Header button
async function reloadAllData(silent = false) {
  const icon = document.getElementById('reloadIcon');
  if (icon && !silent) icon.classList.add('animate-spin');

  try {
    await refreshDashboard();
    if (!silent) {
      showToast('Đã làm mới dữ liệu từ D:\\app\\finance thành công!', 'success');
    }
  } catch (err) {
    if (!silent) {
      showToast('Lỗi khi làm mới: ' + err.message, 'error');
    }
  } finally {
    setTimeout(() => {
      if (icon && !silent) icon.classList.remove('animate-spin');
    }, 500);
  }
}

async function refreshDashboard() {
  await loadOverview();
  await Promise.all([
    renderCategoryPieChart(),
    renderActiveTrendChart(),
    loadTransactionColumns(),
    loadTransactions()
  ]);
}

// ----------------- VIEW MODE SWITCHER -----------------

function switchMainView(mode) {
  state.viewMode = mode;
  const colCont = document.getElementById('threeColumnsContainer');
  const tblCont = document.getElementById('tableViewContainer');

  const colBtns = document.querySelectorAll('.btn-switch-columns');
  const tblBtns = document.querySelectorAll('.btn-switch-table');

  if (mode === 'columns') {
    if (colCont) colCont.classList.remove('hidden');
    if (tblCont) tblCont.classList.add('hidden');

    colBtns.forEach(b => {
      b.className = 'btn-switch-columns px-2.5 py-1 rounded-lg font-bold bg-[#FFFDF9] text-[#2B231D] shadow-2xs transition flex items-center gap-1.5';
      const icon = b.querySelector('i');
      if (icon) icon.className = 'w-3.5 h-3.5 text-[#5F7465]';
    });
    tblBtns.forEach(b => {
      b.className = 'btn-switch-table px-2.5 py-1 rounded-lg font-semibold text-[#786B60] hover:text-[#2B231D] transition flex items-center gap-1.5';
      const icon = b.querySelector('i');
      if (icon) icon.className = 'w-3.5 h-3.5 text-[#786B60]';
    });

    loadTransactionColumns();
  } else {
    if (colCont) colCont.classList.add('hidden');
    if (tblCont) tblCont.classList.remove('hidden');

    colBtns.forEach(b => {
      b.className = 'btn-switch-columns px-2.5 py-1 rounded-lg font-semibold text-[#786B60] hover:text-[#2B231D] transition flex items-center gap-1.5';
      const icon = b.querySelector('i');
      if (icon) icon.className = 'w-3.5 h-3.5 text-[#786B60]';
    });
    tblBtns.forEach(b => {
      b.className = 'btn-switch-table px-2.5 py-1 rounded-lg font-bold bg-[#FFFDF9] text-[#2B231D] shadow-2xs transition flex items-center gap-1.5';
      const icon = b.querySelector('i');
      if (icon) icon.className = 'w-3.5 h-3.5 text-[#5F7465]';
    });

    loadTransactions();
  }
  lucide.createIcons();
}

// ----------------- 3-COLUMN KANBAN BOARD -----------------

async function loadTransactionColumns() {
  const monthVal = state.selectedMonth || 'all';
  let url = `/api/transactions/columns?month=${encodeURIComponent(monthVal)}`;
  if (state.columnSearchQuery) {
    url += `&search=${encodeURIComponent(state.columnSearchQuery)}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    state.columnsData = data;

    const stats = data.stats || {};
    const totalBadge = document.getElementById('columnsTotalBadge');
    if (totalBadge) totalBadge.textContent = `${stats.total_count || 0} mục`;

    // 1. Column: Categorized (Đã phân loại)
    const catCountEl = document.getElementById('colCountCategorized');
    if (catCountEl) catCountEl.textContent = `${stats.categorized_count || 0} giao dịch`;
    const catAmountEl = document.getElementById('colAmountCategorized');
    if (catAmountEl) catAmountEl.textContent = formatCurrency(stats.categorized_amount || 0);
    renderColumnList('colListCategorized', data.categorized || [], 'categorized');

    // 2. Column: Unclassified (Chưa phân loại < 65%)
    const unclassCountEl = document.getElementById('colCountUnclassified');
    if (unclassCountEl) unclassCountEl.textContent = `${stats.unclassified_count || 0} cần chọn`;
    const mColBadge = document.getElementById('mColBadge_unclassified');
    if (mColBadge) mColBadge.textContent = stats.unclassified_count || 0;
    const unclassAmountEl = document.getElementById('colAmountUnclassified');
    if (unclassAmountEl) unclassAmountEl.textContent = formatCurrency(stats.unclassified_amount || 0);
    renderColumnList('colListUnclassified', data.unclassified || [], 'unclassified');

    // 3. Column: Other (Khác)
    const otherCountEl = document.getElementById('colCountOther');
    if (otherCountEl) otherCountEl.textContent = `${stats.other_count || 0} giao dịch`;
    const otherAmountEl = document.getElementById('colAmountOther');
    if (otherAmountEl) otherAmountEl.textContent = formatCurrency(stats.other_amount || 0);
    renderColumnList('colListOther', data.other || [], 'other');

  } catch (err) {
    console.error('Failed to load transaction columns', err);
  }
}

function renderColumnList(containerId, items, columnType) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (items.length === 0) {
    let emptyMsg = 'Không có giao dịch nào';
    let emptyIcon = 'check-circle';
    if (columnType === 'unclassified') {
      emptyMsg = 'Tuyệt vời! Không còn giao dịch nào cần duyệt';
      emptyIcon = 'party-popper';
    } else if (columnType === 'other') {
      emptyMsg = 'Chưa có giao dịch nào ở mục Khác';
      emptyIcon = 'inbox';
    }
    container.innerHTML = `
      <div class="h-64 flex flex-col items-center justify-center text-[#A49688] text-xs text-center px-4">
        <i data-lucide="${emptyIcon}" class="w-8 h-8 mb-2 opacity-40"></i>
        <span class="font-medium">${emptyMsg}</span>
      </div>
    `;
    lucide.createIcons({ root: container });
    return;
  }

  items.forEach(t => {
    const card = document.createElement('div');
    card.id = `trans-card-${t.id}`;

    const isExp = t.type === 'expense';
    const amountSign = isExp ? '-' : '+';
    const amountFormatted = `${amountSign}${formatMoney(t.amount)} ₫`;

    const amountBadgeClass = isExp 
      ? 'inline-flex items-center justify-end font-black text-xs sm:text-[13px] text-[#B14720] bg-[#FDF3EE] border border-[#F4DDD2] px-2.5 py-1 rounded-lg tabular-nums tracking-tight whitespace-nowrap'
      : 'inline-flex items-center justify-end font-black text-xs sm:text-[13px] text-[#5F7465] bg-[#F0F5F2] border border-[#D7E4DB] px-2.5 py-1 rounded-lg tabular-nums tracking-tight whitespace-nowrap';

    // Different card styling based on column
    let cardBorder = 'border-[#DECDB5] hover:border-[#C5B194] bg-[#FFFDF9]';
    let statusBanner = '';

    if (columnType === 'unclassified') {
      cardBorder = 'border-2 border-[#D39526] bg-[#FDFBF5] hover:border-[#B87D17] shadow-xs';
      const confPct = Math.round((t.ai_confidence || 0.4) * 100);
      statusBanner = `
        <div class="flex items-center justify-between gap-1 text-[11px] font-bold text-[#7A5408] bg-[#FDF6E2] px-2.5 py-1 rounded-lg border border-[#F3DB9A]">
          <div class="flex items-center gap-1.5">
            <i data-lucide="sparkles" class="w-3.5 h-3.5 text-[#D39526]"></i>
            <span>Độ chính xác AI: ${confPct}%</span>
          </div>
          <span class="text-[10px] uppercase tracking-wider text-[#7A5408] bg-[#FFFDF9] px-1.5 py-0.5 rounded font-extrabold border border-[#F3DB9A]">&lt; 65%</span>
        </div>
      `;
    }

    card.className = `p-3.5 rounded-2xl border ${cardBorder} shadow-2xs hover:shadow-xs transition duration-200 text-xs space-y-2.5 card-hover group`;

    // Soft Category Button (matches 'Thao tác' soft style)
    let catButtonHtml = '';
    const catObj = state.categories.find(c => c.name === t.category);
    const catColor = catObj ? catObj.color : '#626037';

    if (columnType === 'unclassified') {
      catButtonHtml = `
        <button type="button" onclick="openCardCategoryPicker(event, ${t.id}, '${columnType}')" id="cardCatBtn-${t.id}" class="w-full flex items-center justify-between bg-[#FDF6E2] hover:bg-[#FBEFC8] border-2 border-[#D39526] text-[#4A3205] font-extrabold rounded-xl px-3 py-2 text-xs transition shadow-2xs cursor-pointer focus:ring-2 focus:ring-[#D39526]">
          <span class="flex items-center gap-1.5 truncate">
            <i data-lucide="sparkles" class="w-3.5 h-3.5 text-[#D39526] shrink-0"></i>
            <span class="truncate">Chọn phân loại</span>
          </span>
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-[#7A5408] shrink-0"></i>
        </button>
      `;
    } else {
      catButtonHtml = `
        <button type="button" onclick="openCardCategoryPicker(event, ${t.id}, '${columnType}')" id="cardCatBtn-${t.id}" class="w-full flex items-center justify-between bg-[#F7F2E8] hover:bg-[#EFE7D8] border border-[#DECDB5] rounded-xl px-3 py-1.5 text-xs font-bold text-[#2B231D] transition cursor-pointer">
          <span class="flex items-center gap-2 truncate">
            <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${catColor}"></span>
            <span class="truncate">${escapeHtml(t.category)}</span>
          </span>
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-[#786B60] shrink-0"></i>
        </button>
      `;
    }

    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5 text-[#786B60] font-semibold text-[11px]">
            <i data-lucide="calendar" class="w-3.5 h-3.5 text-[#A49688] shrink-0"></i>
            <span>${formatDate(t.date)}</span>
          </div>
          <button onclick="handleDeleteFromColumn(${t.id})" title="Xóa giao dịch này" class="opacity-0 group-hover:opacity-100 hover:text-[#B14720] text-[#A49688] p-0.5 rounded transition">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        <div class="${amountBadgeClass}">
          ${amountFormatted}
        </div>
      </div>

      <div>
        <p class="font-bold text-[#2B231D] text-[13px] leading-snug line-clamp-2" title="${escapeHtml(t.raw_description || t.description)}">
          ${escapeHtml(t.description || t.raw_description)}
        </p>
        ${t.raw_description && t.raw_description !== t.description ? `
          <p class="text-[11px] text-[#786B60] truncate mt-1" title="${escapeHtml(t.raw_description)}">
            ${escapeHtml(t.raw_description)}
          </p>
        ` : ''}
      </div>

      ${statusBanner}

      <!-- Interactive Category Select: Soft Vintage Popover -->
      <div class="pt-0.5">
        ${catButtonHtml}
      </div>
    `;

    container.appendChild(card);
  });

  lucide.createIcons({ root: container });
}

// Handles instant auto-move when user picks a category
async function handleColumnCategoryChange(transId, newCategory, sourceColumn) {
  if (!newCategory) return;

  const card = document.getElementById(`trans-card-${transId}`);
  if (card) {
    card.style.transition = 'all 0.25s ease-out';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.92)';
  }

  try {
    const res = await fetch(`/api/transactions/${transId}/category`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Lỗi khi cập nhật danh mục');

    const destName = newCategory === 'Khác' ? 'cột "Mục Khác"' : 'cột "Đã phân loại"';
    showToast(`Đã chuyển sang ${destName} ("${newCategory}") & AI đã ghi nhớ!`, 'success');

    // Smoothly reload the 3 columns and refresh overview
    await loadTransactionColumns();
    await loadOverview();
    await renderCategoryPieChart();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);

  } catch (err) {
    if (card) {
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    }
    showToast(err.message || 'Lỗi đổi danh mục', 'error');
  }
}

async function handleDeleteFromColumn(transId) {
  if (!confirm('Bạn có chắc chắn muốn xóa giao dịch này không?')) return;
  try {
    const res = await fetch(`/api/transactions/${transId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Không thể xóa giao dịch');
    showToast('Đã xóa giao dịch thành công!', 'info');
    if (window.scheduleAutoSync) window.scheduleAutoSync();
    await loadTransactionColumns();
    await loadOverview();
    await renderCategoryPieChart();
  } catch (err) {
    showToast(err.message || 'Lỗi khi xóa giao dịch', 'error');
  }
}

let columnSearchDebounce = null;
function onColumnSearchChange() {
  clearTimeout(columnSearchDebounce);
  columnSearchDebounce = setTimeout(() => {
    const input = document.getElementById('columnSearchInput');
    if (input) state.columnSearchQuery = input.value.trim();
    loadTransactionColumns();
  }, 250);
}

// ----------------- ACTION MENU & TABS -----------------

function toggleActionMenu() {
  closeCardCategoryPicker();
  const mMenu = document.getElementById('monthDropdownMenu');
  if (mMenu) mMenu.classList.add('hidden');

  const menu = document.getElementById('actionMenuDropdown');
  if (menu) {
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
      lucide.createIcons({ root: menu });
    }
  }
}

function switchChartTab(tab) {
  state.activeChartTab = tab;
  const btnWeekly = document.getElementById('tabWeeklyBtn');
  const btnMonthly = document.getElementById('tabMonthlyBtn');
  const cWeekly = document.getElementById('weeklyChartContainer');
  const cMonthly = document.getElementById('monthlyChartContainer');
  const title = document.getElementById('trendChartHeaderTitle');
  const subtitle = document.getElementById('trendChartHeaderSubtitle');

  if (tab === 'weekly') {
    btnWeekly.className = 'px-2.5 py-1 rounded-lg font-bold bg-[#FFFDF9] text-[#2B231D] shadow-2xs transition';
    btnMonthly.className = 'px-2.5 py-1 rounded-lg font-semibold text-[#786B60] hover:text-[#2B231D] transition';
    cWeekly.classList.remove('hidden');
    cMonthly.classList.add('hidden');
    title.textContent = 'Tiến Độ Chi Tiêu Theo Tuần';
    subtitle.textContent = 'Theo dõi nhịp độ thu - chi các tuần trong tháng';
    renderWeeklyChart();
  } else {
    btnWeekly.className = 'px-2.5 py-1 rounded-lg font-semibold text-[#786B60] hover:text-[#2B231D] transition';
    btnMonthly.className = 'px-2.5 py-1 rounded-lg font-bold bg-[#FFFDF9] text-[#2B231D] shadow-2xs transition';
    cWeekly.classList.add('hidden');
    cMonthly.classList.remove('hidden');
    title.textContent = 'Biến Động Thu - Chi Theo Tháng';
    subtitle.textContent = 'So sánh tiến độ tích lũy và dòng tiền qua các tháng';
    renderMonthlyChart();
  }
}

async function renderActiveTrendChart() {
  if (state.activeChartTab === 'weekly') {
    await renderWeeklyChart();
  } else {
    await renderMonthlyChart();
  }
}

// ----------------- MONTH NAVIGATION & SOFT DROPDOWN -----------------

function updateMonthDropdownUI() {
  const label = document.getElementById('monthDropdownLabel');
  if (label) {
    if (!state.selectedMonth || state.selectedMonth === 'all') {
      label.textContent = state.selectedMonth === 'all' ? 'Toàn bộ thời gian' : 'Đang tải...';
    } else {
      const parts = state.selectedMonth.split('-');
      if (parts.length === 2) {
        label.textContent = `Tháng ${parts[1]}/${parts[0]}`;
      } else {
        label.textContent = state.selectedMonth;
      }
    }
  }

  const menu = document.getElementById('monthDropdownMenu');
  if (!menu) return;

  const isAll = state.selectedMonth === 'all';
  let html = `
    <button onclick="selectMonth('all')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition font-medium ${isAll ? 'bg-[#FDF6E2] text-[#7A5408] font-bold' : 'text-[#2B231D] hover:bg-[#EFE7D8]'}">
      <span>Toàn bộ thời gian</span>
      ${isAll ? '<i data-lucide="check" class="w-3.5 h-3.5 text-[#D39526]"></i>' : ''}
    </button>
  `;

  (state.availableMonths || []).forEach(m => {
    const [yr, mo] = m.split('-');
    const isSelected = state.selectedMonth === m;
    html += `
      <button onclick="selectMonth('${m}')" class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition font-medium ${isSelected ? 'bg-[#FDF6E2] text-[#7A5408] font-bold' : 'text-[#2B231D] hover:bg-[#EFE7D8]'}">
        <span>Tháng ${mo}/${yr}</span>
        ${isSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-[#D39526]"></i>' : ''}
      </button>
    `;
  });

  menu.innerHTML = html;
  lucide.createIcons({ root: menu });
}

function toggleMonthDropdown(e) {
  if (e) e.stopPropagation();
  closeCardCategoryPicker();
  const aMenu = document.getElementById('actionMenuDropdown');
  if (aMenu) aMenu.classList.add('hidden');

  const menu = document.getElementById('monthDropdownMenu');
  if (menu) {
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
      lucide.createIcons({ root: menu });
    }
  }
}

function selectMonth(val) {
  state.selectedMonth = val;
  state.currentPage = 1;
  const menu = document.getElementById('monthDropdownMenu');
  if (menu) menu.classList.add('hidden');
  updateMonthDropdownUI();
  refreshDashboard();
}

function stepMonth(dir) {
  const months = state.availableMonths;
  if (!months || months.length === 0) return;

  if (!state.selectedMonth || state.selectedMonth === 'all') {
    if (dir < 0) {
      state.selectedMonth = months[0];
    } else {
      state.selectedMonth = months[months.length - 1];
    }
  } else {
    const idx = months.indexOf(state.selectedMonth);
    if (idx !== -1) {
      const nextIdx = idx - dir; // months sorted DESC (newest at index 0)
      if (nextIdx >= 0 && nextIdx < months.length) {
        state.selectedMonth = months[nextIdx];
      } else if (nextIdx < 0) {
        state.selectedMonth = 'all';
      }
    }
  }

  updateMonthDropdownUI();
  refreshDashboard();
}

function onMonthChange() {
  updateMonthDropdownUI();
  refreshDashboard();
}

// ----------------- GLOBAL FLOATING CATEGORY PICKER -----------------
let activePickerTransId = null;

function openCardCategoryPicker(event, transId, columnType) {
  if (event) event.stopPropagation();

  // Close other popups
  const mMenu = document.getElementById('monthDropdownMenu');
  if (mMenu) mMenu.classList.add('hidden');
  const aMenu = document.getElementById('actionMenuDropdown');
  if (aMenu) aMenu.classList.add('hidden');

  const picker = document.getElementById('globalCategoryPicker');
  if (!picker) return;

  if (activePickerTransId === transId && !picker.classList.contains('hidden')) {
    closeCardCategoryPicker();
    return;
  }

  activePickerTransId = transId;
  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();

  // Find transaction's current category
  let currentCategory = '';
  if (columnType === 'table') {
    const btnSpan = btn.querySelector('span:nth-child(2)');
    if (btnSpan) currentCategory = btnSpan.textContent.trim();
  } else if (columnType === 'categorized' || columnType === 'unclassified' || columnType === 'other') {
    const list = state.columnsData[columnType] || [];
    const item = list.find(x => x.id === transId);
    if (item) currentCategory = item.category;
  }

  const pickerWidth = Math.max(rect.width, 220);
  picker.style.width = `${pickerWidth}px`;

  let left = rect.left;
  if (left + pickerWidth > window.innerWidth - 12) {
    left = window.innerWidth - pickerWidth - 12;
  }
  if (left < 12) left = 12;
  picker.style.left = `${left}px`;

  const bottomNavHeight = window.innerWidth < 768 ? 72 : 0;
  const spaceBelow = window.innerHeight - rect.bottom - bottomNavHeight;
  const spaceAbove = rect.top;
  if (spaceBelow < 260 && spaceAbove > 260) {
    picker.style.top = 'auto';
    picker.style.bottom = `${window.innerHeight - rect.top + 6}px`;
  } else {
    picker.style.top = `${rect.bottom + 6}px`;
    picker.style.bottom = 'auto';
  }

  const filteredCats = state.categories.filter(c => c.name !== 'Chưa phân loại');
  picker.innerHTML = filteredCats.map(c => {
    const isSelected = (c.name === currentCategory && columnType !== 'unclassified');
    return `
      <button type="button" onclick="onSelectCardCategory(${transId}, '${escapeHtml(c.name)}', '${columnType}')" class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition font-medium ${isSelected ? 'bg-[#FDF6E2] text-[#7A5408] font-bold' : 'text-[#2B231D] hover:bg-[#EFE7D8]'}">
        <div class="flex items-center gap-2.5 truncate">
          <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${c.color}"></span>
          <span class="truncate">${escapeHtml(c.name)}</span>
        </div>
        ${isSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-[#D39526] shrink-0"></i>' : ''}
      </button>
    `;
  }).join('');

  picker.classList.remove('hidden');
  lucide.createIcons({ root: picker });
}

function closeCardCategoryPicker() {
  const picker = document.getElementById('globalCategoryPicker');
  if (picker) picker.classList.add('hidden');
  activePickerTransId = null;
}

async function onSelectCardCategory(transId, newCat, columnType) {
  closeCardCategoryPicker();
  if (columnType === 'table') {
    await handleInlineCategoryChange(transId, newCat);
  } else {
    await handleColumnCategoryChange(transId, newCat, columnType);
  }
}

// ----------------- CATEGORIES -----------------

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    state.categories = await res.json();

    const catFilter = document.getElementById('categoryFilter');
    const modalCat = document.getElementById('transCategory');
    if (catFilter) {
      catFilter.innerHTML = '<option value="all">Tất cả danh mục</option>';
      state.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        catFilter.appendChild(opt);
      });
    }

    if (modalCat) {
      modalCat.innerHTML = '';
      state.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = cat.name;
        modalCat.appendChild(opt);
      });
    }
    if (typeof syncAllCustomSelects === 'function') syncAllCustomSelects();
  } catch (err) {
    console.error('Failed to load categories', err);
  }
}

// ----------------- OVERVIEW STATS -----------------

async function loadOverview() {
  try {
    const monthParam = (state.selectedMonth && state.selectedMonth !== 'all') 
      ? `?month=${encodeURIComponent(state.selectedMonth)}` 
      : (state.selectedMonth === 'all' ? '?month=all' : '');
    const url = `/api/stats/overview${monthParam}`;
    const res = await fetch(url);
    const data = await res.json();

    state.availableMonths = data.available_months || [];

    // If selectedMonth not set yet, default to the latest month of the uploaded statement
    if (!state.selectedMonth) {
      if (data.selected_month && data.selected_month !== 'all') {
        state.selectedMonth = data.selected_month;
      } else if (state.availableMonths.length > 0) {
        state.selectedMonth = state.availableMonths[0];
      } else {
        state.selectedMonth = 'all';
      }
    }

    // Update Soft Month Dropdown UI
    updateMonthDropdownUI();

    // Update KPI Card Numbers with Animate-UI Rolling Numbers
    const expEl = document.getElementById('cardTotalExpense');
    if (expEl) {
      if (typeof animateNumberValue === 'function') animateNumberValue(expEl, data.total_expense, 650, v => formatCurrency(v));
      else expEl.textContent = formatCurrency(data.total_expense);
    }
    const incEl = document.getElementById('cardTotalIncome');
    if (incEl) {
      if (typeof animateNumberValue === 'function') animateNumberValue(incEl, data.total_income, 650, v => formatCurrency(v));
      else incEl.textContent = formatCurrency(data.total_income);
    }

    const netElem = document.getElementById('cardNetBalance');
    if (netElem) {
      if (typeof animateNumberValue === 'function') animateNumberValue(netElem, data.net_balance, 650, v => formatCurrency(v));
      else netElem.textContent = formatCurrency(data.net_balance);
      if (data.net_balance >= 0) {
        netElem.className = 'text-2xl sm:text-[28px] font-black text-[#5F7465] tabular-nums tracking-tight my-1';
      } else {
        netElem.className = 'text-2xl sm:text-[28px] font-black text-[#B14720] tabular-nums tracking-tight my-1';
      }
    }

    const rate = Math.max(0, Math.min(100, Math.round(data.savings_rate || 0)));
    const rateEl = document.getElementById('cardSavingsRate');
    if (rateEl) {
      if (typeof animateNumberValue === 'function') animateNumberValue(rateEl, rate, 650, v => `${Math.round(v)}%`);
      else rateEl.textContent = `${rate}%`;
    }
    const pBar = document.getElementById('savingsProgressBar');
    if (pBar) {
      pBar.style.width = `${rate}%`;
      if (rate >= 30) {
        pBar.className = 'bg-[#5F7465] h-1.5 rounded-full transition-all duration-500';
      } else if (rate >= 10) {
        pBar.className = 'bg-[#D39526] h-1.5 rounded-full transition-all duration-500';
      } else {
        pBar.className = 'bg-[#C3651F] h-1.5 rounded-full transition-all duration-500';
      }
    }

    const expCountEl = document.getElementById('cardExpenseCount');
    if (expCountEl) expCountEl.textContent = `${data.total_transactions} giao dịch ghi nhận`;

    const pieLabel = document.getElementById('pieChartMonthLabel');
    if (pieLabel) {
      if (state.selectedMonth === 'all') {
        pieLabel.textContent = 'Toàn bộ';
      } else {
        const [yr, mo] = state.selectedMonth.split('-');
        pieLabel.textContent = `T${mo}/${yr}`;
      }
    }

  } catch (err) {
    console.error('Failed to load overview', err);
  }
}

// ----------------- CHARTS -----------------

// 1. Donut Chart: Phân bổ danh mục
async function renderCategoryPieChart() {
  const canvas = document.getElementById('categoryPieChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const noDataEl = document.getElementById('pieNoData');
  const legendEl = document.getElementById('categoryLegendList');
  legendEl.innerHTML = '';

  try {
    const monthVal = state.selectedMonth || 'all';
    const res = await fetch(`/api/stats/categories?month=${encodeURIComponent(monthVal)}&type=expense`);
    const data = await res.json();
    const breakdown = Array.isArray(data) ? data : (data.breakdown || []);

    if (!breakdown || breakdown.length === 0) {
      noDataEl.classList.remove('hidden');
      if (charts.pie) { charts.pie.destroy(); charts.pie = null; }
      return;
    }

    noDataEl.classList.add('hidden');

    const labels = breakdown.map(b => b.category);
    const amounts = breakdown.map(b => b.amount);
    const fallbackPalette = ['#5F7465', '#D39526', '#B14720', '#626037', '#C3651F', '#663B1B', '#7C3929', '#552F26', '#8E8275'];
    const colors = breakdown.map((b, i) => b.color || fallbackPalette[i % fallbackPalette.length]);

    // Populate Legend List
    breakdown.forEach(item => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between text-xs py-1.5 px-2 rounded-xl hover:bg-[#F7F2E8] cursor-pointer transition border border-transparent hover:border-[#DECDB5]';
      row.onclick = () => {
        const catFilter = document.getElementById('categoryFilter');
        if (catFilter) catFilter.value = item.category;
        state.selectedCategory = item.category;
        state.currentPage = 1;
        loadTransactions();
      };
      row.innerHTML = `
        <div class="flex items-center gap-2 truncate">
          <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${item.color}"></span>
          <span class="font-semibold text-[#2B231D] truncate">${item.category}</span>
          <span class="text-[10px] text-[#786B60]">(${item.count})</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="font-bold text-[#2B231D] tabular-nums">${formatCurrency(item.amount)}</span>
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#EFE7D8] text-[#786B60] border border-[#DECDB5]/60">${item.percentage}%</span>
        </div>
      `;
      legendEl.appendChild(row);
    });

    if (charts.pie) charts.pie.destroy();

    charts.pie = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: amounts,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#FFFDF9',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        rotation: 0, // Starts at 12 o'clock
        circumference: 360,
        cutout: '70%',
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 400,
          easing: 'easeOutQuart'
        },
        interaction: {
          mode: 'nearest',
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2B231D',
            titleColor: '#FFFDF9',
            bodyColor: '#F7F2E8',
            borderColor: '#DECDB5',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}`
            }
          }
        }
      }
    });

  } catch (err) {
    console.error('Failed to render pie chart', err);
  }
}

// 2. Weekly Bar Chart
async function renderWeeklyChart() {
  const canvas = document.getElementById('weeklyBarChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const noDataEl = document.getElementById('weeklyNoData');

  try {
    const monthVal = state.selectedMonth || '';
    const res = await fetch(`/api/stats/weekly?month=${encodeURIComponent(monthVal)}`);
    const data = await res.json();
    const weeks = Array.isArray(data) ? data : (data.weeks || []);

    if (!weeks || weeks.length === 0) {
      noDataEl.classList.remove('hidden');
      if (charts.weekly) { charts.weekly.destroy(); charts.weekly = null; }
      return;
    }

    noDataEl.classList.add('hidden');

    const labels = weeks.map(w => w.week_label || w.label || w.week);
    const expenses = weeks.map(w => w.expense);
    const incomes = weeks.map(w => w.income);

    if (charts.weekly) charts.weekly.destroy();

    charts.weekly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Chi tiêu',
            data: expenses,
            backgroundColor: '#B14720',
            borderRadius: 6,
            barPercentage: 0.6
          },
          {
            label: 'Thu nhập',
            data: incomes,
            backgroundColor: '#5F7465',
            borderRadius: 6,
            barPercentage: 0.6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        animations: {
          y: {
            type: 'number',
            easing: 'easeOutBack',
            duration: 520,
            from: (ctx) => {
              if (ctx.type === 'data') {
                const y = ctx.chart.scales.y;
                return y ? y.getPixelForValue(0) : 0;
              }
            },
            delay(ctx) {
              if (ctx.type !== 'data') return 0;
              return ctx.index * 90 + ctx.datasetIndex * 35;
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2B231D',
            titleColor: '#FFFDF9',
            bodyColor: '#F7F2E8',
            borderColor: '#DECDB5',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#786B60', font: { size: 11 } }
          },
          y: {
            grid: { color: '#EFE7D8' },
            ticks: {
              color: '#786B60',
              font: { size: 11 },
              callback: (val) => {
                if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
                return val;
              }
            }
          }
        }
      }
    });

  } catch (err) {
    console.error('Failed to render weekly chart', err);
  }
}

// 3. Monthly Trend Chart
async function renderMonthlyChart() {
  const canvas = document.getElementById('monthlyTrendChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const noDataEl = document.getElementById('monthlyNoData');
  const summaryEl = document.getElementById('monthlySummaryText');

  try {
    const res = await fetch('/api/stats/monthly');
    const data = await res.json();
    const months = Array.isArray(data) ? data : (data.months || []);

    if (!months || months.length === 0) {
      noDataEl.classList.remove('hidden');
      if (charts.monthly) { charts.monthly.destroy(); charts.monthly = null; }
      return;
    }

    noDataEl.classList.add('hidden');

    const labels = months.map(m => {
      const parts = m.month.split('-');
      return `T${parts[1]}/${parts[0].slice(2)}`;
    });
    const expenses = months.map(m => m.expense);
    const incomes = months.map(m => m.income);

    let totalNet = 0;
    months.forEach(m => totalNet += (m.income - m.expense));
    if (summaryEl) {
      summaryEl.textContent = `Tích lũy ròng: ${formatCurrency(totalNet)}`;
    }

    if (charts.monthly) charts.monthly.destroy();

    charts.monthly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Chi tiêu',
            data: expenses,
            backgroundColor: '#B14720',
            borderRadius: 6,
            barPercentage: 0.6
          },
          {
            label: 'Thu nhập',
            data: incomes,
            backgroundColor: '#5F7465',
            borderRadius: 6,
            barPercentage: 0.6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        animations: {
          y: {
            type: 'number',
            easing: 'easeOutBack',
            duration: 520,
            from: (ctx) => {
              if (ctx.type === 'data') {
                const y = ctx.chart.scales.y;
                return y ? y.getPixelForValue(0) : 0;
              }
            },
            delay(ctx) {
              if (ctx.type !== 'data') return 0;
              return ctx.index * 90 + ctx.datasetIndex * 35;
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2B231D',
            titleColor: '#FFFDF9',
            bodyColor: '#F7F2E8',
            borderColor: '#DECDB5',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#786B60', font: { size: 11 } }
          },
          y: {
            grid: { color: '#EFE7D8' },
            ticks: {
              color: '#786B60',
              font: { size: 11 },
              callback: (val) => {
                if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
                if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
                return val;
              }
            }
          }
        }
      }
    });

  } catch (err) {
    console.error('Failed to render monthly chart', err);
  }
}

// ----------------- TRANSACTIONS TABLE & PAGINATION -----------------

async function loadTransactions() {
  const tbody = document.getElementById('transactionTableBody');
  const countBadge = document.getElementById('tableCountBadge');
  const paginationInfo = document.getElementById('paginationInfo');

  let url = `/api/transactions?page=${state.currentPage}&limit=${state.pageSize}`;
  if (state.selectedMonth && state.selectedMonth !== 'all') {
    url += `&month=${encodeURIComponent(state.selectedMonth)}`;
  }
  if (state.selectedType && state.selectedType !== 'all') {
    url += `&type=${encodeURIComponent(state.selectedType)}`;
  }
  if (state.selectedCategory && state.selectedCategory !== 'all') {
    url += `&category=${encodeURIComponent(state.selectedCategory)}`;
  }
  if (state.searchQuery) {
    url += `&search=${encodeURIComponent(state.searchQuery)}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    const items = data.items || data.transactions || [];

    state.totalTransactions = data.total || items.length;
    if (countBadge) countBadge.textContent = `${state.totalTransactions} mục`;

    if (items.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-[#A49688] text-xs">Không tìm thấy giao dịch nào</td></tr>`;
      if (paginationInfo) paginationInfo.textContent = '0 - 0 của 0';
      updatePaginationControls();
      return;
    }

    const startIdx = (state.currentPage - 1) * state.pageSize + 1;
    const endIdx = Math.min(state.currentPage * state.pageSize, state.totalTransactions);
    if (paginationInfo) paginationInfo.textContent = `${startIdx} - ${endIdx} của ${state.totalTransactions}`;

    if (tbody) {
      tbody.innerHTML = '';
      items.forEach(t => {
        const isExp = t.type === 'expense';
        const amountSign = isExp ? '-' : '+';
        const amountClass = isExp ? 'text-[#B14720] font-bold tabular-nums' : 'text-[#5F7465] font-bold tabular-nums';

        const catObj = state.categories.find(c => c.name === t.category);
        const catColor = catObj ? catObj.color : '#626037';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-[#F7F2E8]/70 transition group';
        tr.innerHTML = `
          <td class="py-2.5 px-4 font-semibold text-[#786B60] whitespace-nowrap">
            ${formatDate(t.date)}
          </td>
          <td class="py-2.5 px-4 max-w-xs md:max-w-md">
            <div class="font-bold text-[#2B231D] text-xs truncate" title="${escapeHtml(t.raw_description || t.description)}">
              ${escapeHtml(t.description || t.raw_description)}
            </div>
            ${t.raw_description && t.raw_description !== t.description ? `
              <div class="text-[10px] text-[#A49688] truncate mt-0.5" title="${escapeHtml(t.raw_description)}">
                ${escapeHtml(t.raw_description)}
              </div>
            ` : ''}
          </td>
          <td class="py-2.5 px-4 whitespace-nowrap">
            <button type="button" onclick="openCardCategoryPicker(event, ${t.id}, 'table')" id="tableCatBtn-${t.id}" class="inline-flex items-center gap-1.5 bg-[#F7F2E8] hover:bg-[#EFE7D8] border border-[#DECDB5] rounded-xl px-2.5 py-1 text-xs font-semibold text-[#2B231D] transition cursor-pointer shadow-2xs">
              <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${catColor}"></span>
              <span>${escapeHtml(t.category)}</span>
              <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-[#786B60]"></i>
            </button>
          </td>
          <td class="py-2.5 px-4 text-right whitespace-nowrap">
            <span class="${amountClass}">
              ${amountSign}${formatMoney(t.amount)} ₫
            </span>
          </td>
          <td class="py-2.5 px-4 text-center whitespace-nowrap">
            <button onclick="deleteTransaction(${t.id})" title="Xóa giao dịch" class="opacity-70 md:opacity-0 md:group-hover:opacity-100 p-1.5 rounded-lg text-[#A49688] hover:text-[#B14720] hover:bg-[#FDF3EE] transition cursor-pointer">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      lucide.createIcons({ root: tbody });
    }
    updatePaginationControls();

  } catch (err) {
    console.error('Failed to load transactions', err);
  }
}

function updatePaginationControls() {
  const totalPages = Math.ceil(state.totalTransactions / state.pageSize) || 1;
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const pageContainer = document.getElementById('pageNumbersContainer');

  if (prevBtn) prevBtn.disabled = state.currentPage <= 1;
  if (nextBtn) nextBtn.disabled = state.currentPage >= totalPages;

  if (pageContainer) {
    pageContainer.innerHTML = `Trang ${state.currentPage} / ${totalPages}`;
  }
}

function changePage(delta) {
  const totalPages = Math.ceil(state.totalTransactions / state.pageSize) || 1;
  const newPage = state.currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    state.currentPage = newPage;
    loadTransactions();
  }
}

function onPageSizeChange() {
  const sel = document.getElementById('pageSizeSelect');
  if (sel) state.pageSize = parseInt(sel.value, 10);
  state.currentPage = 1;
  loadTransactions();
}

function onFilterChange() {
  const typeFilter = document.getElementById('typeFilter');
  const catFilter = document.getElementById('categoryFilter');
  if (typeFilter) state.selectedType = typeFilter.value;
  if (catFilter) state.selectedCategory = catFilter.value;
  state.currentPage = 1;
  loadTransactions();
}

let searchDebounce = null;
function onSearchChange() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) state.searchQuery = searchInput.value.trim();
    state.currentPage = 1;
    loadTransactions();
  }, 250);
}

// Inline Category Change in Table view
async function handleInlineCategoryChange(transactionId, newCategory) {
  try {
    const res = await fetch(`/api/transactions/${transactionId}/category`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Lỗi khi cập nhật danh mục');

    showToast(`Đã đổi sang "${newCategory}" & AI đã ghi nhớ quy tắc!`, 'success');
    await refreshDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message || 'Lỗi khi đổi danh mục', 'error');
  }
}

async function deleteTransaction(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa giao dịch này không?')) return;

  try {
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Không thể xóa giao dịch');

    showToast('Đã xóa giao dịch thành công!', 'info');
    await refreshDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- STATEMENT UPLOAD -----------------

function openUploadModal() {
  if (typeof openAnimatedModal === 'function') openAnimatedModal('uploadModal');
  else {
    const modal = document.getElementById('uploadModal');
    if (modal) modal.classList.remove('hidden');
  }
}

function closeUploadModal() {
  if (typeof closeAnimatedModal === 'function') closeAnimatedModal('uploadModal');
  else {
    const modal = document.getElementById('uploadModal');
    if (modal) modal.classList.add('hidden');
  }
  state.selectedFile = null;
  const fileNameBox = document.getElementById('selectedFileName');
  if (fileNameBox) fileNameBox.classList.add('hidden');
  const submitBtn = document.getElementById('uploadSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;
}

function handleDragOver(e) {
  e.preventDefault();
  const dz = document.getElementById('dropZone');
  if (dz) dz.classList.add('border-[#5F7465]', 'bg-[#F0F5F2]');
}

function handleDragLeave(e) {
  e.preventDefault();
  const dz = document.getElementById('dropZone');
  if (dz) dz.classList.remove('border-[#5F7465]', 'bg-[#F0F5F2]');
}

function handleDrop(e) {
  e.preventDefault();
  handleDragLeave(e);
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    processSelectedFile(e.dataTransfer.files[0]);
  }
}

function handleFileSelect(e) {
  if (e.target.files && e.target.files.length > 0) {
    processSelectedFile(e.target.files[0]);
  }
}

function processSelectedFile(file) {
  state.selectedFile = file;
  const nameBox = document.getElementById('selectedFileName');
  const nameText = document.getElementById('selectedFileNameText');
  const submitBtn = document.getElementById('uploadSubmitBtn');

  if (nameBox && nameText) {
    nameText.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    nameBox.classList.remove('hidden');
    lucide.createIcons({ root: nameBox });
  }
  if (submitBtn) submitBtn.disabled = false;
}

async function submitUploadStatement() {
  if (!state.selectedFile) return;

  const btn = document.getElementById('uploadSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Đang xử lý & lưu vào D:\\app\\finance...</span>`;
  lucide.createIcons({ root: btn });

  try {
    const formData = new FormData();
    formData.append('file', state.selectedFile);

    const res = await fetch('/api/upload/statement', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Lỗi khi xử lý file sao kê');

    let msg = `Thành công: Đã nạp ${data.transaction_count} giao dịch mới vào D:\\app\\finance!`;
    if (data.duplicate_count > 0) {
      msg += ` (Đã bỏ qua ${data.duplicate_count} giao dịch trùng)`;
    }
    showToast(msg, 'success');

    closeUploadModal();
    if (data.latest_month) {
      state.selectedMonth = data.latest_month;
    } else {
      state.selectedMonth = null;
    }
    await refreshDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync();

  } catch (err) {
    showToast(err.message || 'Lỗi xử lý file', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="arrow-right" class="w-3.5 h-3.5"></i><span>Xử lý & Phân loại</span>`;
    lucide.createIcons({ root: btn });
  }
}

// ----------------- BULK ACTIONS -----------------

async function seedDemoData() {
  if (!confirm('Nạp 32 giao dịch mẫu phong phú để kiểm tra thử? Dữ liệu sẽ lưu vào D:\\app\\finance.')) return;

  try {
    const res = await fetch('/api/seed-demo', { method: 'POST' });
    const data = await res.json();
    showToast(`Đã nạp ${data.count} giao dịch mẫu thành công!`, 'success');
    state.selectedMonth = null;
    await refreshDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function triggerAICategorize() {
  try {
    showToast('AI đang quét và phân loại lại giao dịch...', 'info');
    const res = await fetch('/api/categorize-all', { method: 'POST' });
    const data = await res.json();
    showToast(`AI đã hoàn tất phân loại cho ${data.categorized_count} giao dịch!`, 'success');
    await refreshDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function resetAllData() {
  if (!confirm('CẢNH BÁO: Thao tác này sẽ xóa toàn bộ giao dịch trong D:\\app\\finance\\expense_data.db để làm mới lại từ đầu. Bạn có chắc không?')) return;

  try {
    const res = await fetch('/api/reset-all', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Đã làm mới dữ liệu thành công!', 'info');
    state.selectedMonth = null;
    await refreshDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function exportCSV() {
  const url = `/api/export/csv?month=${encodeURIComponent(state.selectedMonth)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `bao_cao_chi_tieu_${state.selectedMonth || 'all'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Đang tải xuống file báo cáo Excel / CSV...', 'success');
}

// ----------------- MANUAL TRANSACTION MODAL -----------------

function openAddTransactionModal() {
  if (typeof openAnimatedModal === 'function') openAnimatedModal('addTransactionModal');
  else {
    const modal = document.getElementById('addTransactionModal');
    if (modal) modal.classList.remove('hidden');
  }
  const dateInput = document.getElementById('transDate');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
  const descInput = document.getElementById('transDesc');
  if (descInput) descInput.value = '';
  const amountInput = document.getElementById('transAmount');
  if (amountInput) amountInput.value = '';
}

function closeAddTransactionModal() {
  if (typeof closeAnimatedModal === 'function') closeAnimatedModal('addTransactionModal');
  else {
    const modal = document.getElementById('addTransactionModal');
    if (modal) modal.classList.add('hidden');
  }
}

async function saveManualTransaction() {
  const date = document.getElementById('transDate').value;
  const desc = document.getElementById('transDesc').value.trim();
  const amount = parseFloat(document.getElementById('transAmount').value);
  const type = document.getElementById('transType').value;
  const category = document.getElementById('transCategory').value;

  if (!date || !desc || isNaN(amount) || amount <= 0) {
    showToast('Vui lòng nhập đầy đủ thông tin giao dịch hợp lệ', 'error');
    return;
  }

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: date,
        description: desc,
        amount: amount,
        type: type,
        category: category
      })
    });

    if (!res.ok) throw new Error('Không thể thêm giao dịch');

    showToast('Đã thêm giao dịch thành công!', 'success');
    closeAddTransactionModal();
    await refreshDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ----------------- SETTINGS MODAL -----------------

function openSettingsModal() {
  if (typeof openAnimatedModal === 'function') openAnimatedModal('settingsModal');
  else {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('hidden');
  }
}

function closeSettingsModal() {
  if (typeof closeAnimatedModal === 'function') closeAnimatedModal('settingsModal');
  else {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.add('hidden');
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.ai_provider) {
      document.getElementById('settingsProvider').value = data.ai_provider;
    }
  } catch (err) {
    console.error('Failed to load settings', err);
  }
}

async function saveSettings() {
  const provider = document.getElementById('settingsProvider').value;
  const apiKey = document.getElementById('settingsApiKey').value.trim();

  try {
    const payload = { ai_provider: provider };
    if (apiKey) payload.api_key = apiKey;

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Không thể lưu cài đặt');

    showToast('Đã lưu cấu hình AI thành công!', 'success');
    closeSettingsModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
