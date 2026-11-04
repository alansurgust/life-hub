/**
 * LIFE HUB - Personal Life OS & Tracking System v1.0
 * Modules:
 * 1. Finance (Integrated from app.js)
 * 2. To-Do List & Productivity Charts (Vikunja & Super Productivity)
 * 3. Habit Tracker & Streaks (Habitica)
 * 4. Daily Journal & Mood Reflection (AppFlowy)
 * 5. Notes & Second Brain (AppFlowy & Vikunja)
 * 6. Global Pomodoro Focus Timer (Super Productivity)
 */

let lifeState = {
  currentTab: 'dashboard', // dashboard, finance, todos, habits, journal, notes
  dashboardData: null,
  todos: [],
  todoFilter: 'all', // all, today, week, urgent, completed
  todoCategory: 'all',
  todoView: 'list', // list or kanban
  todoStats: null,
  habits: [],
  lastHabitData: null,
  habitSelectedMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
  currentJournalDate: new Date().toISOString().split('T')[0],
  currentJournalMood: 'good',
  notes: [],
  notesCategory: 'all',
  notesSearch: '',
  // Pomodoro
  pomoMode: 'focus', // 'focus' (25m), 'short' (5m), 'long' (15m)
  pomoTimeLeft: 25 * 60,
  pomoIsRunning: false,
  pomoTimerId: null,
  pomoSessions: 0,
  pomoActiveTodo: null // { id, title }
};

// Chart instances for Todos & Habits
let todoCharts = {
  velocity: null,
  category: null
};

let habitCharts = {
  area: null
};

// =========================================================================
// TAB SWITCHING LOGIC WITH SMOOTH FADE UP/OUT & FLOAT UP/IN ANIMATIONS
// =========================================================================

let tabSwitchTransitionId = 0;

function switchLifeTab(tabName) {
  const prevTab = lifeState.currentTab;
  if (prevTab === tabName) return;

  const currentTransitionId = ++tabSwitchTransitionId;
  lifeState.currentTab = tabName;

  // Update sidebar active classes immediately
  const tabs = ['dashboard', 'finance', 'todos', 'habits', 'journal', 'notes'];
  tabs.forEach(t => {
    const btn = document.getElementById(`navTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      if (t === tabName) {
        btn.className = 'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer bg-[#233329] text-[#FFFDF9] shadow-xs';
      } else {
        btn.className = 'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer text-[#786B60] hover:text-[#2B231D] hover:bg-[#E7DEC8]';
      }
    }

    // Also update mobile bottom navigation bar active button
    const mBtn = document.getElementById(`mobileNav_${t}`);
    if (mBtn) {
      if (t === tabName) {
        mBtn.className = 'flex-1 flex flex-col items-center justify-center gap-0.5 text-[#233329] font-bold text-[10px] py-1.5 rounded-xl transition cursor-pointer';
      } else {
        mBtn.className = 'flex-1 flex flex-col items-center justify-center gap-0.5 text-[#786B60] font-medium text-[10px] py-1.5 rounded-xl transition cursor-pointer';
      }
    }
  });

  // Update Top Header Title & Controls
  const titles = {
    dashboard: { title: 'Tổng quan cuộc sống', sub: '• Trung tâm điều hành tích hợp toàn diện (Dashboard)' },
    finance: { title: 'Tài chính', sub: '• Quản lý thu chi & phân loại AI' },
    todos: { title: 'Việc cần làm', sub: '• Quản lý công việc, ưu tiên & nhịp độ năng suất' },
    habits: { title: 'Thói quen & Kỷ luật', sub: '• Theo dõi chuỗi ngày kiên trì (Streaks)' },
    journal: { title: 'Nhật ký & Cảm xúc', sub: '• Ghi chép tâm trạng, lòng biết ơn & bài học' },
    notes: { title: 'Ghi chú & Tri thức', sub: '• Kho ý tưởng, bài học & Second Brain cá nhân' }
  };

  const pTitle = document.getElementById('pageTitle');
  const pSub = document.getElementById('pageSubtitle');
  if (pTitle && titles[tabName]) pTitle.textContent = titles[tabName].title;
  if (pSub && titles[tabName]) pSub.textContent = titles[tabName].sub;

  // Toggle Header action button groups
  const ctrlGroups = ['Dashboard', 'Finance', 'Todos', 'Habits', 'Journal', 'Notes'];
  ctrlGroups.forEach(g => {
    const ctrl = document.getElementById(`header${g}Controls`);
    if (ctrl) {
      if (g.toLowerCase() === tabName) {
        ctrl.classList.remove('hidden');
      } else {
        ctrl.classList.add('hidden');
      }
    }
  });

  // Pre-fetch active tab data
  if (tabName === 'dashboard') {
    loadDashboard();
  } else if (tabName === 'todos') {
    loadTodos();
    loadTodoStats();
  } else if (tabName === 'habits') {
    loadHabits();
  } else if (tabName === 'journal') {
    loadJournal(lifeState.currentJournalDate);
    loadJournalHistory();
  } else if (tabName === 'notes') {
    loadNotes();
  }

  const oldSec = document.getElementById(`section-${prevTab}`);
  const newSec = document.getElementById(`section-${tabName}`);

  const getBoxChildren = (sec) => {
    if (!sec) return [];
    return Array.from(sec.children).filter(el => el.nodeType === 1 && !el.classList.contains('hidden'));
  };

  const oldBoxes = getBoxChildren(oldSec);

  const showNewSection = () => {
    if (currentTransitionId !== tabSwitchTransitionId) return;

    // Hide all sections except target tab
    tabs.forEach(t => {
      const s = document.getElementById(`section-${t}`);
      if (s) {
        if (t === tabName) {
          s.classList.remove('hidden');
        } else {
          s.classList.add('hidden');
        }
      }
    });

    if (newSec) {
      const newBoxes = getBoxChildren(newSec);
      newBoxes.forEach((box, idx) => {
        box.classList.remove('tab-box-exit');
        box.classList.add('tab-box-enter');
        box.style.animationDelay = `${idx * 40}ms`;
      });

      // Cleanup entrance animation classes when done
      const enterDuration = 320 + newBoxes.length * 40 + 60;
      setTimeout(() => {
        if (currentTransitionId !== tabSwitchTransitionId) return;
        newBoxes.forEach(box => {
          box.classList.remove('tab-box-enter');
          box.style.animationDelay = '';
        });
      }, enterDuration);
    }

    // Trigger Habit Area Chart Left-to-Right animation when switching to habits tab
    if (tabName === 'habits') {
      setTimeout(() => {
        if (currentTransitionId !== tabSwitchTransitionId) return;
        if (lifeState.lastHabitData && lifeState.lastHabitData.chart) {
          renderHabitAreaChart(lifeState.lastHabitData.chart);
        } else {
          loadHabits();
        }
      }, 60);
    } else if (tabName === 'todos') {
      // Trigger To-Do charts animations (bar sprouting left-to-right & doughnut sweeping from 12 o'clock)
      setTimeout(() => {
        if (currentTransitionId !== tabSwitchTransitionId) return;
        if (lifeState.todoStats) {
          renderTodoCharts(lifeState.todoStats);
        } else {
          loadTodoStats();
        }
      }, 60);
    } else if (tabName === 'finance') {
      setTimeout(() => {
        if (currentTransitionId !== tabSwitchTransitionId) return;
        if (typeof renderCategoryPieChart === 'function') renderCategoryPieChart();
        if (typeof renderActiveTrendChart === 'function') renderActiveTrendChart();
      }, 60);
    }

    if (window.lucide) lucide.createIcons();
  };

  if (oldSec && !oldSec.classList.contains('hidden') && oldBoxes.length > 0) {
    // Phase 1: Animate old tab boxes fading out & moving up
    oldBoxes.forEach((box, idx) => {
      box.classList.remove('tab-box-enter');
      box.classList.add('tab-box-exit');
      box.style.animationDelay = `${idx * 25}ms`;
    });

    const exitDuration = 180 + oldBoxes.length * 25;
    setTimeout(() => {
      if (currentTransitionId !== tabSwitchTransitionId) return;
      oldBoxes.forEach(box => {
        box.classList.remove('tab-box-exit');
        box.style.animationDelay = '';
      });
      showNewSection();
    }, exitDuration);
  } else {
    showNewSection();
  }
}

function reloadActiveTabData(silent = false) {
  const icon = document.getElementById('reloadIcon');
  if (icon && !silent) icon.classList.add('animate-spin');

  if (lifeState.currentTab === 'dashboard') {
    loadDashboard();
  } else if (lifeState.currentTab === 'finance') {
    if (typeof reloadAllData === 'function') reloadAllData(silent);
  } else if (lifeState.currentTab === 'todos') {
    loadTodos();
    loadTodoStats();
  } else if (lifeState.currentTab === 'habits') {
    loadHabits();
  } else if (lifeState.currentTab === 'journal') {
    loadJournal(lifeState.currentJournalDate);
    loadJournalHistory();
  } else if (lifeState.currentTab === 'notes') {
    loadNotes();
  }

  setTimeout(() => {
    if (icon && !silent) icon.classList.remove('animate-spin');
    if (!silent) {
      showToast('Đã làm mới dữ liệu từ ổ D:\\Finance', 'success');
    }
  }, 500);
}

// =========================================================================
// SECTION 0: DASHBOARD / EXECUTIVE SUMMARY (All-in-One Life Overview)
// =========================================================================

function formatVND(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 ₫';
  return Math.round(amount).toLocaleString('vi-VN') + ' ₫';
}

async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error('Không thể tải dữ liệu Dashboard');
    const data = await res.json();
    lifeState.dashboardData = data;
    renderDashboard(data);

    // Keep sidebar badges updated
    const sideTodo = document.getElementById('sidebarTodosBadge');
    if (sideTodo && data.todos) sideTodo.textContent = data.todos.pending_count;

    const sideHabit = document.getElementById('sidebarHabitsBadge');
    if (sideHabit && data.habits) sideHabit.textContent = `${data.habits.completed_today}/${data.habits.total}`;

    const sideNotes = document.getElementById('sidebarNotesBadge');
    if (sideNotes && data.notes) sideNotes.textContent = data.notes.length;
  } catch (err) {
    console.error('Error loading dashboard:', err);
    showToast('Lỗi tải dữ liệu tổng quan', 'error');
  }
}

function renderDashboard(data) {
  if (!data) return;

  // 1. Hero greeting & date & dynamic quote
  const heroGreeting = document.getElementById('dashHeroGreeting');
  const heroDate = document.getElementById('dashHeroDate');
  const headerDate = document.getElementById('dashHeaderDate');
  const heroQuote = document.getElementById('dashHeroQuote');

  if (heroGreeting) heroGreeting.textContent = data.greeting || 'Chào bạn!';
  if (heroDate) heroDate.textContent = data.today_formatted || '';
  if (headerDate) headerDate.textContent = data.today_formatted || 'Hôm nay';

  if (heroQuote) {
    const quotes = [
      '"Sự kiên trì từng ngày tạo nên những kết quả phi thường."',
      '"Tập trung vào hiện tại, từng bước nhỏ sẽ đưa bạn đi rất xa."',
      '"Kỷ luật là cầu nối giữa mục tiêu và thành tựu."',
      '"Một ngày làm việc hiệu quả bắt đầu từ những thói quen tích cực."',
      '"Biết ơn những gì đang có và không ngừng nỗ lực vươn lên."'
    ];
    const hour = new Date().getHours();
    const idx = Math.floor(hour / 5) % quotes.length;
    heroQuote.textContent = quotes[idx];
  }

  // 2. Pulse metric cards
  const pulseBalance = document.getElementById('dashPulseBalance');
  const pulseExpenseSub = document.getElementById('dashPulseExpenseSub');
  if (pulseBalance && data.finance) {
    pulseBalance.textContent = formatVND(data.finance.balance);
    pulseBalance.className = `text-sm font-black mt-2 truncate ${data.finance.balance >= 0 ? 'text-[#5F7465]' : 'text-[#B14720]'}`;
  }
  if (pulseExpenseSub && data.finance) {
    pulseExpenseSub.textContent = `Chi ${formatVND(data.finance.total_expense)} (${data.finance.month_label})`;
  }

  const pulseTodos = document.getElementById('dashPulseTodos');
  const pulseTodosSub = document.getElementById('dashPulseTodosSub');
  if (pulseTodos && data.todos) {
    pulseTodos.textContent = `${data.todos.pending_count || 0} việc chờ`;
  }
  if (pulseTodosSub && data.todos) {
    if (!data.todos.total || data.todos.total === 0) {
      pulseTodosSub.textContent = 'Chưa lên việc hôm nay';
    } else if (data.todos.rollover_count > 0 && (!data.todos.completed_count || data.todos.completed_count === 0)) {
      pulseTodosSub.textContent = `${data.todos.rollover_count} việc tồn đọng từ hôm trước`;
    } else {
      pulseTodosSub.textContent = `Đạt ${data.todos.rate}% hôm nay`;
    }
  }

  const pulseHabits = document.getElementById('dashPulseHabits');
  const pulseHabitsSub = document.getElementById('dashPulseHabitsSub');
  if (pulseHabits && data.habits) {
    pulseHabits.textContent = `${data.habits.completed_today}/${data.habits.total} đã làm`;
  }
  if (pulseHabitsSub && data.habits) {
    pulseHabitsSub.textContent = `Đạt ${data.habits.rate}% hôm nay`;
  }

  const pulseMood = document.getElementById('dashPulseMood');
  if (pulseMood && data.journal) {
    const moodMap = {
      great: 'Tuyệt vời ✨',
      good: 'Tích cực 🌱',
      neutral: 'Bình thường ☕',
      low: 'Trầm lắng 🌧️',
      bad: 'Cần nghỉ ngơi ⚡'
    };
    pulseMood.textContent = moodMap[data.journal.mood] || 'Chưa ghi chép';
  }

  // 3. To-Do List Container
  const todoContainer = document.getElementById('dashTodoListContainer');
  if (todoContainer && data.todos) {
    if (!data.todos.top_todos || data.todos.top_todos.length === 0) {
      todoContainer.innerHTML = `
        <div class="text-center py-6 px-4 bg-[#F7F2E8] rounded-xl border border-[#DECDB5]/60">
          <i data-lucide="check-circle-2" class="w-7 h-7 text-[#5F7465] mx-auto mb-1.5 opacity-80"></i>
          <p class="text-xs font-bold text-[#2B231D]">Tuyệt vời! Không còn việc tồn đọng</p>
          <p class="text-[11px] text-[#786B60] mt-0.5">Bạn có thể thêm việc mới ở ô bên dưới</p>
        </div>
      `;
    } else {
      const priorityMap = {
        urgent: { label: 'Khẩn cấp', class: 'bg-[#FDF3EE] text-[#B14720] border-[#F4DDD2]' },
        high: { label: 'Cao', class: 'bg-[#FDF6E2] text-[#D39526] border-[#F4E6C3]' },
        normal: { label: 'Bình thường', class: 'bg-[#EFE7D8] text-[#626037] border-[#DECDB5]' },
        low: { label: 'Thấp', class: 'bg-[#F0F5F2] text-[#5F7465] border-[#D7E4DB]' }
      };

      todoContainer.innerHTML = data.todos.top_todos.map(t => {
        const pInfo = priorityMap[t.priority] || priorityMap.normal;
        const isOverdue = t.due_date && t.due_date < data.today_str;
        return `
          <div class="p-3 rounded-xl bg-[#F7F2E8]/60 hover:bg-[#F7F2E8] border border-[#DECDB5]/70 transition shadow-2xs group flex items-start justify-between gap-2.5">
            <div class="flex items-start gap-2.5 min-w-0 flex-1">
              <button onclick="toggleTodoFromDash(${t.id})" title="Đánh dấu hoàn thành" class="mt-0.5 w-5 h-5 rounded-full border-2 border-[#5F7465] hover:bg-[#5F7465] text-white flex items-center justify-center shrink-0 transition cursor-pointer hover:scale-105 active:scale-95">
                <i data-lucide="check" class="w-3 h-3 opacity-0 group-hover:opacity-100 transition"></i>
              </button>
              <div class="min-w-0 flex-1 space-y-1">
                <p class="text-xs sm:text-[13px] font-bold text-[#2B231D] leading-snug break-words">${escapeHtml(t.title)}</p>
                <div class="flex items-center gap-1.5 text-[11px] text-[#786B60]">
                  <span class="font-semibold text-[#626037]">${escapeHtml(t.category)}</span>
                  <span class="text-[#DECDB5]">•</span>
                  <span class="${isOverdue ? 'text-[#B14720] font-bold' : ''}">${t.due_date ? formatDisplayDate(t.due_date) : 'Không hạn'}</span>
                  ${t.priority === 'urgent' ? '<span class="text-[#B14720] font-bold ml-1">• Khẩn cấp</span>' : (t.priority === 'high' ? '<span class="text-[#D39526] font-bold ml-1">• Cao</span>' : '')}
                  ${isOverdue ? '<span class="text-[#B14720] font-bold ml-1">• Tồn đọng</span>' : ''}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0 self-center">
              <button onclick="startPomoForTodo(${t.id}, '${escapeHtml(t.title)}')" class="p-1.5 rounded-lg hover:bg-[#FDF3EE] text-[#B14720] transition cursor-pointer" title="Tập trung Pomodoro">
                <i data-lucide="timer" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="openTodoModal(${t.id})" class="p-1.5 rounded-lg hover:bg-[#EFE7D8] text-[#786B60] hover:text-[#2B231D] transition cursor-pointer" title="Chỉnh sửa">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Habits List Container
  const habitRateBadge = document.getElementById('dashHabitsRateBadge');
  const habitProgressBar = document.getElementById('dashHabitsProgressBar');
  const habitFraction = document.getElementById('dashHabitsFraction');
  if (habitRateBadge && data.habits) habitRateBadge.textContent = `${data.habits.rate}%`;
  if (habitProgressBar && data.habits) habitProgressBar.style.width = `${data.habits.rate}%`;
  if (habitFraction && data.habits) habitFraction.textContent = `${data.habits.completed_today}/${data.habits.total}`;

  const habitContainer = document.getElementById('dashHabitsListContainer');
  if (habitContainer && data.habits) {
    if (!data.habits.items || data.habits.items.length === 0) {
      habitContainer.innerHTML = '<p class="col-span-2 text-xs text-[#786B60] text-center py-4">Chưa có thói quen nào. Hãy vào mục Thói quen để tạo!</p>';
    } else {
      habitContainer.innerHTML = data.habits.items.map(h => {
        const isDone = h.completed_today === 1;
        return `
          <div class="flex items-center justify-between p-3 rounded-xl border ${isDone ? 'bg-[#F0F5F2] border-[#D7E4DB]' : 'bg-[#F7F2E8]/60 border-[#DECDB5]/60 hover:bg-[#F7F2E8]'} transition">
            <div class="flex items-center gap-2.5 min-w-0">
              <button onclick="toggleHabitLogFromDash(${h.id}, '${data.today_str}')" title="${isDone ? 'Bỏ tick hoàn thành' : 'Tick hoàn thành'}" 
                      class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition cursor-pointer ${isDone ? 'bg-[#5F7465] text-[#FFFDF9] shadow-xs' : 'border-2 border-[#DECDB5] bg-white hover:border-[#5F7465] text-transparent hover:text-[#5F7465]'}">
                <i data-lucide="check" class="w-4 h-4 stroke-[2.5]"></i>
              </button>
              <div class="min-w-0">
                <span class="text-xs font-bold text-[#2B231D] truncate block ${isDone ? 'line-through text-[#786B60]' : ''}">${escapeHtml(h.name)}</span>
                <span class="inline-flex items-center gap-1 text-[10px] text-[#C3651F] font-bold mt-0.5">
                  <i data-lucide="flame" class="w-3 h-3 text-[#C3651F]"></i>
                  <span>${h.streak} ngày</span>
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 5. Finance Card
  if (data.finance) {
    const finMonthLabel = document.getElementById('dashFinanceMonthLabel');
    const finIncome = document.getElementById('dashFinIncome');
    const finExpense = document.getElementById('dashFinExpense');
    const finBalance = document.getElementById('dashFinBalance');
    if (finMonthLabel) finMonthLabel.textContent = data.finance.month_label;
    if (finIncome) finIncome.textContent = formatVND(data.finance.total_income);
    if (finExpense) finExpense.textContent = formatVND(data.finance.total_expense);
    if (finBalance) {
      finBalance.textContent = formatVND(data.finance.balance);
      finBalance.className = `text-xs sm:text-sm font-black truncate ${data.finance.balance >= 0 ? 'text-[#233329]' : 'text-[#B14720]'}`;
    }

    const recentList = document.getElementById('dashRecentTransList');
    if (recentList) {
      if (!data.finance.recent_transactions || data.finance.recent_transactions.length === 0) {
        recentList.innerHTML = '<p class="text-xs text-[#786B60] text-center py-3">Chưa có giao dịch gần đây</p>';
      } else {
        recentList.innerHTML = data.finance.recent_transactions.map(tx => {
          const isIncome = tx.type === 'income';
          return `
            <div class="flex items-center justify-between p-2 rounded-xl bg-[#F7F2E8]/60 border border-[#DECDB5]/40 hover:bg-[#F7F2E8] transition text-xs">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-6 h-6 rounded-lg ${isIncome ? 'bg-[#F0F5F2] text-[#5F7465]' : 'bg-[#FDF3EE] text-[#B14720]'} flex items-center justify-center shrink-0">
                  <i data-lucide="${isIncome ? 'arrow-down-left' : 'arrow-up-right'}" class="w-3.5 h-3.5"></i>
                </div>
                <div class="min-w-0">
                  <div class="font-bold text-[#2B231D] truncate text-[11px]">${escapeHtml(tx.description)}</div>
                  <div class="text-[10px] text-[#786B60]">${escapeHtml(tx.category)} • ${formatDisplayDate(tx.date)}</div>
                </div>
              </div>
              <span class="font-black tabular-nums shrink-0 ml-2 text-xs ${isIncome ? 'text-[#5F7465]' : 'text-[#B14720]'}">
                ${isIncome ? '+' : '-'}${formatVND(tx.amount)}
              </span>
            </div>
          `;
        }).join('');
      }
    }
  }

  // 6. Journal Card
  const journalContainer = document.getElementById('dashJournalContainer');
  if (journalContainer) {
    if (!data.journal) {
      journalContainer.innerHTML = `
        <div class="text-center py-4 px-3 bg-[#F7F2E8] rounded-xl border border-[#DECDB5]/60">
          <p class="text-xs font-bold text-[#2B231D]">Hôm nay chưa viết nhật ký</p>
          <p class="text-[11px] text-[#786B60] mt-0.5 mb-2">Dành 2 phút ghi lại lòng biết ơn và cảm nhận</p>
          <button onclick="switchLifeTab('journal')" class="px-3 py-1.5 rounded-xl bg-[#5F7465] text-white text-xs font-bold hover:bg-[#4d5e52] transition cursor-pointer">
            Viết nhật ký ngay
          </button>
        </div>
      `;
    } else {
      journalContainer.innerHTML = `
        <div class="p-3 bg-[#FDF6E2]/70 rounded-xl border border-[#F4E6C3] space-y-1.5">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-[#7A5408]">
            <i data-lucide="heart" class="w-3.5 h-3.5 text-[#B14720]"></i>
            <span>Lòng biết ơn hôm nay</span>
          </div>
          <p class="text-xs text-[#2B231D] italic leading-relaxed">"${escapeHtml(data.journal.gratitude || 'Chưa ghi')}"</p>
        </div>

        ${data.journal.improvement ? `
          <div class="p-3 bg-[#F7F2E8] rounded-xl border border-[#DECDB5]/60 space-y-1">
            <div class="flex items-center gap-1.5 text-[11px] font-bold text-[#626037]">
              <i data-lucide="target" class="w-3.5 h-3.5 text-[#5F7465]"></i>
              <span>Bài học / Cần cải thiện</span>
            </div>
            <p class="text-xs text-[#2B231D] leading-relaxed">${escapeHtml(data.journal.improvement)}</p>
          </div>
        ` : ''}
      `;
    }
  }

  // 7. Notes Card
  const notesContainer = document.getElementById('dashNotesContainer');
  if (notesContainer) {
    if (!data.notes || data.notes.length === 0) {
      notesContainer.innerHTML = '<p class="text-xs text-[#786B60] text-center py-3">Chưa có ghi chú nào</p>';
    } else {
      notesContainer.innerHTML = data.notes.slice(0, 3).map(n => `
        <div onclick="openNoteModal(${n.id})" class="p-2.5 rounded-xl bg-[#F7F2E8]/60 hover:bg-[#F7F2E8] border border-[#DECDB5]/50 hover:border-[#5F7465] transition cursor-pointer group">
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="font-bold text-[#2B231D] text-xs truncate group-hover:text-[#5F7465] transition">${escapeHtml(n.title)}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-[#EFE7D8] text-[#626037] shrink-0">${escapeHtml(n.category)}</span>
          </div>
          <p class="text-[11px] text-[#786B60] line-clamp-2 leading-relaxed">${escapeHtml(n.content || '')}</p>
        </div>
      `).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

async function quickAddTodoFromDash() {
  const input = document.getElementById('dashQuickTodoTitle');
  const title = input ? input.value.trim() : '';
  if (!title) return;

  const payload = {
    title: title,
    priority: 'normal',
    category: 'Cá nhân',
    due_date: new Date().toISOString().split('T')[0],
    pomodoro_est: 1
  };

  try {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Không thể thêm việc');
    input.value = '';
    showToast('Đã thêm việc cần làm!', 'success');
    loadDashboard();
    loadTodoStats();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleTodoFromDash(id) {
  try {
    playTickSound();
    const res = await fetch(`/api/todos/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Không thể cập nhật việc');
    showToast('Đã cập nhật trạng thái việc!', 'success');
    loadDashboard();
    loadTodoStats();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleHabitLogFromDash(habitId, date) {
  try {
    playTickSound();
    const res = await fetch(`/api/habits/${habitId}/toggle?date=${date}`, { method: 'POST' });
    if (!res.ok) throw new Error('Không thể cập nhật thói quen');
    showToast('Đã cập nhật thói quen hôm nay!', 'success');
    loadDashboard();
    loadHabits();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================================
// SECTION 2: TO-DO LIST & PRODUCTIVITY CHARTS (Super Productivity & Vikunja)
// =========================================================================

async function loadTodos() {
  try {
    let url = `/api/todos?filter_by=${lifeState.todoFilter}`;
    if (lifeState.todoCategory !== 'all') {
      url += `&category=${encodeURIComponent(lifeState.todoCategory)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không thể tải việc cần làm');
    lifeState.todos = await res.json();
    renderTodos();
    updateTodoBadges();
  } catch (err) {
    console.error('loadTodos error:', err);
  }
}

async function loadTodoStats() {
  try {
    const res = await fetch('/api/todos/stats');
    if (!res.ok) return;
    const stats = await res.json();
    lifeState.todoStats = stats;
    renderTodoStats(stats);
    renderTodoCharts(stats);
  } catch (err) {
    console.error('loadTodoStats error:', err);
  }
}

function renderTodoStats(stats) {
  const rateElem = document.getElementById('todoKpiTodayRate');
  const barElem = document.getElementById('todoKpiProgressBar');
  const countElem = document.getElementById('todoKpiTodayCount');
  const urgentElem = document.getElementById('todoKpiUrgentCount');
  const weekElem = document.getElementById('todoKpiWeekDone');

  if (rateElem) rateElem.textContent = `${stats.today_rate}%`;
  if (barElem) barElem.style.width = `${Math.min(stats.today_rate, 100)}%`;
  
  if (countElem) {
    if (!stats.today_total || stats.today_total === 0) {
      countElem.textContent = '0 / 0 việc hôm nay (chưa lên plan)';
    } else if (stats.rollover_count > 0 && (!stats.today_planned || stats.today_planned === 0)) {
      countElem.textContent = `${stats.today_completed} / ${stats.today_total} việc (chuyển tiếp từ hôm trước)`;
    } else if (stats.rollover_count > 0) {
      countElem.textContent = `${stats.today_completed} / ${stats.today_total} việc (${stats.rollover_count} từ hôm trước)`;
    } else {
      countElem.textContent = `${stats.today_completed} / ${stats.today_total} việc hôm nay`;
    }
  }

  if (urgentElem) urgentElem.textContent = stats.urgent_count;
  if (weekElem) weekElem.textContent = `${stats.week_completed} việc`;
}

function renderTodoCharts(stats) {
  if (!stats || !stats.chart) return;

  const sec = document.getElementById('section-todos');
  if (sec && sec.classList.contains('hidden')) {
    return; // Will be animated cleanly once unhidden
  }

  // 1. Velocity Chart (Bar Chart for last 7 days - Sprout up sequentially left-to-right)
  const ctxVel = document.getElementById('todoVelocityChart');
  if (ctxVel) {
    if (todoCharts.velocity) {
      todoCharts.velocity.data.labels = stats.chart.labels;
      todoCharts.velocity.data.datasets[0].data = stats.chart.completed;
      todoCharts.velocity.data.datasets[1].data = stats.chart.created;
      todoCharts.velocity.data.datasets[1].label = 'Cần làm (Mới & Tồn)';
      todoCharts.velocity.update('none');
    } else {
      todoCharts.velocity = new Chart(ctxVel.getContext('2d'), {
      type: 'bar',
      data: {
        labels: stats.chart.labels,
        datasets: [
          {
            label: 'Hoàn thành',
            data: stats.chart.completed,
            backgroundColor: '#5F7465',
            borderRadius: 6,
            barPercentage: 0.6
          },
          {
            label: 'Cần làm (Mới & Tồn)',
            data: stats.chart.created,
            backgroundColor: '#DECDB5',
            borderRadius: 6,
            barPercentage: 0.6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animations: {
          y: {
            type: 'number',
            easing: 'easeOutBack', // Bouncy sprout up effect
            duration: 520,
            from: (ctx) => {
              if (ctx.type === 'data') {
                const y = ctx.chart.scales.y;
                return y ? y.getPixelForValue(0) : 0;
              }
            },
            delay(ctx) {
              if (ctx.type !== 'data') return 0;
              // Staggered: Left to right day-by-day (85ms per day + 35ms between the 2 bars)
              return ctx.index * 85 + ctx.datasetIndex * 35;
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: 'inherit', size: 11, weight: '600' }, color: '#786B60', boxWidth: 12 }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'inherit', size: 10 }, color: '#786B60' } },
          y: { grid: { color: 'rgba(222, 205, 181, 0.3)' }, ticks: { stepSize: 1, precision: 0, font: { family: 'inherit', size: 10 }, color: '#786B60' } }
        }
      }
    });
    }
  }

  // 2. Category breakdown Donut Chart (Sequential sweep starting from 12 o'clock)
  const ctxCat = document.getElementById('todoCategoryChart');
  if (ctxCat && stats.categories && stats.categories.length > 0) {
    const colors = ['#5F7465', '#D39526', '#B14720', '#626037', '#663B1B', '#8E8275'];
    if (todoCharts.category) {
      todoCharts.category.data.labels = stats.categories.map(c => c.category);
      todoCharts.category.data.datasets[0].data = stats.categories.map(c => c.count);
      todoCharts.category.data.datasets[0].backgroundColor = colors.slice(0, stats.categories.length);
      todoCharts.category.update('none');
    } else {
      todoCharts.category = new Chart(ctxCat.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: stats.categories.map(c => c.category),
        datasets: [{
          data: stats.categories.map(c => c.count),
          backgroundColor: colors.slice(0, stats.categories.length),
          borderWidth: 2,
          borderColor: '#FFFDF9'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        rotation: 0, // 0 deg = exactly 12 o'clock
        circumference: 360,
        cutout: '68%',
        animation: {
          animateRotate: true,
          animateScale: false,
          duration: 900,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: 'inherit', size: 10, weight: '600' }, color: '#786B60', boxWidth: 10 }
          }
        }
      }
    });
    }
  }
}

function renderTodos() {
  if (lifeState.todoView === 'kanban') {
    renderTodoKanban();
  } else {
    renderTodoList();
  }
}

function renderTodoList() {
  const container = document.getElementById('todoListItems');
  if (!container) return;

  if (lifeState.todos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-[#A49688]">
        <i data-lucide="check-circle" class="w-12 h-12 mx-auto mb-2 opacity-40"></i>
        <p class="font-bold text-sm text-[#786B60]">Không có công việc nào trong danh mục này</p>
        <p class="text-xs">Hãy thêm việc mới hoặc đổi bộ lọc bên trên!</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const priorityMeta = {
    urgent: { label: 'Khẩn cấp', bg: 'bg-[#FDF3EE]', text: 'text-[#B14720]', border: 'border-[#DECDB5]' },
    high: { label: 'Ưu tiên cao', bg: 'bg-[#FDF6E2]', text: 'text-[#D39526]', border: 'border-[#DECDB5]' },
    normal: { label: 'Bình thường', bg: 'bg-[#F0F5F2]', text: 'text-[#5F7465]', border: 'border-[#DECDB5]' },
    low: { label: 'Thấp', bg: 'bg-[#EFE7D8]', text: 'text-[#786B60]', border: 'border-[#DECDB5]' }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  container.innerHTML = lifeState.todos.map(t => {
    const isDone = t.status === 'completed';
    const pri = priorityMeta[t.priority] || priorityMeta.normal;
    const isOverdue = !isDone && t.due_date && t.due_date < todayStr;

    return `
      <div class="p-3.5 sm:p-4 rounded-2xl bg-[#FFFDF9] border border-[#DECDB5] hover:border-[#5F7465] transition shadow-2xs group space-y-2.5">
        <!-- Top Row: Checkbox, Title (full width), Edit & Delete Actions -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <button onclick="toggleTodo(${t.id})" class="mt-0.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 ${isDone ? 'bg-[#5F7465] border-[#5F7465] text-white' : 'border-[#DECDB5] hover:border-[#5F7465] bg-transparent'} flex items-center justify-center transition shrink-0 cursor-pointer hover:scale-105 active:scale-95" title="${isDone ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}">
              ${isDone ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>' : ''}
            </button>
            <div class="min-w-0 flex-1">
              <h4 class="font-bold text-xs sm:text-sm leading-snug ${isDone ? 'line-through text-[#A49688]' : 'text-[#2B231D]'} break-words">${escapeHtml(t.title)}</h4>
              ${t.description ? `<p class="text-xs text-[#786B60] mt-1 leading-relaxed break-words">${escapeHtml(t.description)}</p>` : ''}
            </div>
          </div>

          <!-- Quick Action Buttons: Accessible on mobile, no opacity-0 hiding -->
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="openTodoModal(${t.id})" class="p-1.5 rounded-lg text-[#786B60] hover:text-[#5F7465] hover:bg-[#F0F5F2] transition cursor-pointer" title="Chỉnh sửa việc">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteTodo(${t.id})" class="p-1.5 rounded-lg text-[#A49688] hover:text-[#B14720] hover:bg-[#FDF3EE] transition cursor-pointer" title="Xóa việc">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- Bottom Row: Clean Minimalist Typographic Line -->
        <div class="flex items-center justify-between gap-2 flex-wrap pt-1 text-xs">
          <!-- Left: Clean Typographic Metadata -->
          <div class="flex items-center gap-1.5 flex-wrap text-[11px] text-[#786B60]">
            <span class="font-semibold text-[#626037]">${escapeHtml(t.category)}</span>
            <span class="text-[#DECDB5]">•</span>
            <span class="${isOverdue ? 'text-[#B14720] font-bold' : 'text-[#786B60]'}">${t.due_date ? formatDisplayDate(t.due_date) : 'Không hạn'}</span>
            ${t.priority === 'urgent' ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FDF3EE] text-[#B14720] border border-[#DECDB5]/60 ml-1">Khẩn cấp</span>' : (t.priority === 'high' ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FDF6E2] text-[#D39526] border border-[#DECDB5]/60 ml-1">Ưu tiên</span>' : '')}
            ${isOverdue ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FDF3EE] text-[#B14720] border border-[#F4DDD2] ml-1">Tồn đọng</span>' : ''}
          </div>

          <!-- Right: Pomodoro Quick Trigger -->
          <div class="flex items-center gap-2 text-xs">
            <button onclick="startPomoForTodo(${t.id}, '${escapeHtml(t.title)}')" class="inline-flex items-center gap-1 text-[11px] font-semibold text-[#786B60] hover:text-[#B14720] px-2 py-0.5 rounded-lg hover:bg-[#FDF3EE] transition cursor-pointer" title="Bắt đầu Pomodoro">
              <i data-lucide="timer" class="w-3.5 h-3.5 text-[#B14720]"></i>
              <span>${t.pomodoro_done || 0}/${t.pomodoro_est || 1}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderTodoKanban() {
  const pendingCol = document.getElementById('kanbanColPending');
  const inProgCol = document.getElementById('kanbanColInProgress');
  const doneCol = document.getElementById('kanbanColCompleted');
  if (!pendingCol || !inProgCol || !doneCol) return;

  const priorityMeta = {
    urgent: { label: 'Khẩn cấp', bg: 'bg-[#FDF3EE]', text: 'text-[#B14720]', border: 'border-[#DECDB5]' },
    high: { label: 'Cao', bg: 'bg-[#FDF6E2]', text: 'text-[#D39526]', border: 'border-[#DECDB5]' },
    normal: { label: 'Bình thường', bg: 'bg-[#F0F5F2]', text: 'text-[#5F7465]', border: 'border-[#DECDB5]' },
    low: { label: 'Thấp', bg: 'bg-[#EFE7D8]', text: 'text-[#786B60]', border: 'border-[#DECDB5]' }
  };

  const cols = { pending: [], in_progress: [], completed: [] };
  lifeState.todos.forEach(t => {
    if (cols[t.status]) cols[t.status].push(t);
    else cols.pending.push(t);
  });

  const renderCard = (t) => {
    const isDone = t.status === 'completed';
    const pri = priorityMeta[t.priority] || priorityMeta.normal;
    return `
      <div class="p-3.5 bg-[#FFFDF9] border border-[#DECDB5] rounded-2xl shadow-2xs space-y-2.5 hover:border-[#5F7465] transition group">
        <div class="flex items-start justify-between gap-2">
          <span class="font-bold text-xs text-[#2B231D] ${isDone ? 'line-through text-[#A49688]' : ''}">${escapeHtml(t.title)}</span>
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button onclick="openTodoModal(${t.id})" class="p-1 text-[#786B60] hover:text-[#5F7465] rounded-lg transition" title="Sửa"><i data-lucide="edit-3" class="w-3 h-3"></i></button>
            <button onclick="deleteTodo(${t.id})" class="p-1 text-[#A49688] hover:text-[#B14720] rounded-lg transition" title="Xóa"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </div>
        </div>
        ${t.description ? `<p class="text-[11px] text-[#786B60] line-clamp-2 leading-relaxed">${escapeHtml(t.description)}</p>` : ''}
        <div class="flex items-center justify-between text-[10px] text-[#786B60]">
          <div class="flex items-center gap-1.5">
            <span class="px-2 py-0.5 rounded-full border ${pri.bg} ${pri.text} ${pri.border} font-bold">${pri.label}</span>
            ${!isDone && t.due_date && t.due_date < new Date().toISOString().split('T')[0] ? '<span class="px-1.5 py-0.2 rounded border font-semibold bg-[#FDF3EE] text-[#B14720] border-[#F4DDD2]">Tồn đọng</span>' : ''}
          </div>
          <span>${formatDisplayDate(t.due_date)}</span>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-[#DECDB5]/40 text-[11px]">
          <button onclick="startPomoForTodo(${t.id}, '${escapeHtml(t.title)}')" class="inline-flex items-center gap-1 text-[10px] font-bold text-[#B14720] hover:bg-[#FDF3EE] px-2 py-1 rounded-lg transition cursor-pointer" title="Tập trung Pomodoro">
            <i data-lucide="timer" class="w-3 h-3"></i> ${t.pomodoro_done || 0}/${t.pomodoro_est || 1}
          </button>
          <div class="flex items-center gap-1">
            ${t.status === 'pending' ? `
              <button onclick="updateTodoStatus(${t.id}, 'in_progress')" class="text-[10px] font-bold text-[#D39526] hover:bg-[#FDF6E2] px-2 py-1 rounded-lg transition cursor-pointer">▶ Làm ngay</button>
              <button onclick="updateTodoStatus(${t.id}, 'completed')" class="text-[10px] font-bold text-[#5F7465] hover:bg-[#F0F5F2] px-2 py-1 rounded-lg transition cursor-pointer">✓ Xong</button>
            ` : ''}
            ${t.status === 'in_progress' ? `
              <button onclick="updateTodoStatus(${t.id}, 'pending')" class="text-[10px] font-semibold text-[#786B60] hover:bg-[#EFE7D8] px-2 py-1 rounded-lg transition cursor-pointer">⏸ Chờ</button>
              <button onclick="updateTodoStatus(${t.id}, 'completed')" class="text-[10px] font-bold text-[#5F7465] hover:bg-[#F0F5F2] px-2 py-1 rounded-lg transition cursor-pointer">✓ Xong</button>
            ` : ''}
            ${t.status === 'completed' ? `
              <button onclick="updateTodoStatus(${t.id}, 'pending')" class="text-[10px] font-bold text-[#5F7465] hover:underline cursor-pointer">↺ Mở lại</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  };

  pendingCol.innerHTML = cols.pending.map(renderCard).join('') || '<p class="text-xs text-[#A49688] text-center py-4">Trống</p>';
  inProgCol.innerHTML = cols.in_progress.map(renderCard).join('') || '<p class="text-xs text-[#A49688] text-center py-4">Trống</p>';
  doneCol.innerHTML = cols.completed.map(renderCard).join('') || '<p class="text-xs text-[#A49688] text-center py-4">Trống</p>';

  if (window.lucide) lucide.createIcons();
}

function setTodoFilter(filter) {
  lifeState.todoFilter = filter;
  const filters = ['all', 'today', 'week', 'urgent', 'completed'];
  filters.forEach(f => {
    const btn = document.getElementById(`todoFilterBtn_${f}`);
    if (btn) {
      if (f === filter) {
        btn.className = 'px-3 py-1 text-xs font-bold rounded-xl bg-[#233329] text-[#FFFDF9] shadow-2xs cursor-pointer';
      } else {
        btn.className = 'px-3 py-1 text-xs font-semibold rounded-xl bg-[#FFFDF9] text-[#786B60] hover:text-[#2B231D] border border-[#DECDB5] cursor-pointer';
      }
    }
  });
  loadTodos();
}

function setTodoView(mode) {
  lifeState.todoView = mode;
  const listBtn = document.getElementById('todoViewListBtn');
  const kanbanBtn = document.getElementById('todoViewKanbanBtn');
  const listContainer = document.getElementById('todoListItems');
  const kanbanContainer = document.getElementById('todoKanbanContainer');

  if (mode === 'kanban') {
    if (listBtn) listBtn.className = 'px-2.5 py-1 text-xs font-semibold text-[#786B60] hover:text-[#2B231D] cursor-pointer';
    if (kanbanBtn) kanbanBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-[#FFFDF9] text-[#2B231D] shadow-2xs cursor-pointer';
    if (listContainer) listContainer.classList.add('hidden');
    if (kanbanContainer) kanbanContainer.classList.remove('hidden');
  } else {
    if (listBtn) listBtn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-[#FFFDF9] text-[#2B231D] shadow-2xs cursor-pointer';
    if (kanbanBtn) kanbanBtn.className = 'px-2.5 py-1 text-xs font-semibold text-[#786B60] hover:text-[#2B231D] cursor-pointer';
    if (listContainer) listContainer.classList.remove('hidden');
    if (kanbanContainer) kanbanContainer.classList.add('hidden');
  }
  renderTodos();
}

async function quickAddTodo(e) {
  if (e && e.key && e.key !== 'Enter') return;
  const titleInput = document.getElementById('todoQuickTitle');
  const priSelect = document.getElementById('todoQuickPriority');
  const catSelect = document.getElementById('todoQuickCategory');
  const dateInput = document.getElementById('todoQuickDate');

  const title = titleInput ? titleInput.value.trim() : '';
  if (!title) return;

  const payload = {
    title: title,
    priority: priSelect ? priSelect.value : 'normal',
    category: catSelect ? catSelect.value : 'Công việc',
    due_date: (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().split('T')[0],
    pomodoro_est: 1
  };

  try {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Không thể thêm việc');
    titleInput.value = '';
    showToast('Đã thêm việc cần làm!', 'success');
    loadTodos();
    loadTodoStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleTodo(id) {
  try {
    playTickSound();
    const res = await fetch(`/api/todos/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Không thể cập nhật việc');
    loadTodos();
    loadTodoStats();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTodo(id) {
  if (!confirm('Bạn có chắc muốn xóa việc này không?')) return;
  try {
    const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Không thể xóa việc');
    showToast('Đã xóa việc thành công', 'success');
    loadTodos();
    loadTodoStats();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateTodoStatus(id, status) {
  try {
    playTickSound();
    const res = await fetch(`/api/todos/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Không thể cập nhật trạng thái việc');
    showToast('Đã cập nhật tiến độ công việc!', 'success');
    loadTodos();
    loadTodoStats();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function clearCompletedTodosAction() {
  if (!confirm('Bạn có chắc muốn dọn dẹp tất cả các việc đã hoàn thành không?')) return;
  try {
    const res = await fetch('/api/todos/completed/clear', { method: 'DELETE' });
    if (!res.ok) throw new Error('Không thể dọn dẹp việc đã xong');
    const data = await res.json();
    showToast(`Đã dọn dẹp ${data.deleted_count || 0} công việc đã xong!`, 'success');
    loadTodos();
    loadTodoStats();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openTodoModal(todoId = null) {
  const modal = document.getElementById('todoModal');
  const idInput = document.getElementById('todoModalId');
  const header = document.getElementById('todoModalHeader');
  const title = document.getElementById('todoModalTitle');
  const desc = document.getElementById('todoModalDesc');
  const due = document.getElementById('todoModalDueDate');
  const priority = document.getElementById('todoModalPriority');
  const cat = document.getElementById('todoModalCategory');
  const pomo = document.getElementById('todoModalPomoEst');

  if (!modal) return;

  if (todoId) {
    const todo = lifeState.todos.find(t => t.id === todoId);
    if (!todo) return;
    if (idInput) idInput.value = todo.id;
    if (header) header.textContent = 'Chỉnh Sửa Công Việc';
    if (title) title.value = todo.title;
    if (desc) desc.value = todo.description || '';
    if (due) due.value = todo.due_date || new Date().toISOString().split('T')[0];
    if (priority) priority.value = todo.priority || 'normal';
    if (cat) cat.value = todo.category || 'Công việc';
    if (pomo) pomo.value = todo.pomodoro_est || 1;
  } else {
    if (idInput) idInput.value = '';
    if (header) header.textContent = 'Công Việc Mới';
    if (title) title.value = '';
    if (desc) desc.value = '';
    if (due) due.value = new Date().toISOString().split('T')[0];
    if (priority) priority.value = 'normal';
    if (cat) cat.value = 'Công việc';
    if (pomo) pomo.value = 1;
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
  setTimeout(() => title?.focus(), 50);
}

function closeTodoModal() {
  const modal = document.getElementById('todoModal');
  if (modal) modal.classList.add('hidden');
}

async function saveTodoModalAction() {
  const idInput = document.getElementById('todoModalId');
  const title = document.getElementById('todoModalTitle')?.value.trim();
  const desc = document.getElementById('todoModalDesc')?.value.trim();
  const due = document.getElementById('todoModalDueDate')?.value;
  const priority = document.getElementById('todoModalPriority')?.value || 'normal';
  const category = document.getElementById('todoModalCategory')?.value || 'Công việc';
  const pomo = parseInt(document.getElementById('todoModalPomoEst')?.value || '1', 10);

  if (!title) {
    showToast('Vui lòng nhập tên công việc!', 'error');
    return;
  }

  const isEdit = idInput && idInput.value;
  const payload = {
    title,
    description: desc || '',
    due_date: due || new Date().toISOString().split('T')[0],
    priority,
    category,
    pomodoro_est: isNaN(pomo) ? 1 : pomo
  };

  try {
    let res;
    if (isEdit) {
      res = await fetch(`/api/todos/${idInput.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) throw new Error('Không thể lưu công việc');
    closeTodoModal();
    showToast(isEdit ? 'Đã cập nhật công việc!' : 'Đã tạo công việc mới!', 'success');
    loadTodos();
    loadTodoStats();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateTodoBadges() {
  const pendingCount = lifeState.todos.filter(t => t.status !== 'completed').length;
  const badge = document.getElementById('sidebarTodosBadge');
  if (badge) badge.textContent = pendingCount;
}

// =========================================================================
// SECTION 3: HABITS TRACKER & STREAKS (Habitica) - FULL MONTH CALENDAR
// =========================================================================

async function loadHabits() {
  try {
    let url = '/api/habits';
    if (lifeState.habitSelectedMonth) {
      url += `?month=${encodeURIComponent(lifeState.habitSelectedMonth)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không thể tải thói quen');
    const data = await res.json();
    lifeState.lastHabitData = data;
    lifeState.habits = data.habits || [];
    renderHabits(data);
  } catch (err) {
    console.error('loadHabits error:', err);
  }
}

function stepHabitMonth(delta) {
  if (!lifeState.habitSelectedMonth) {
    const today = new Date();
    lifeState.habitSelectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }
  let [y, m] = lifeState.habitSelectedMonth.split('-').map(Number);
  m += delta;
  if (m > 12) { m = 1; y += 1; }
  else if (m < 1) { m = 12; y -= 1; }
  lifeState.habitSelectedMonth = `${y}-${String(m).padStart(2, '0')}`;
  loadHabits();
}

function toggleHabitMonthDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('habitMonthDropdownMenu');
  if (menu) menu.classList.toggle('hidden');
}

function selectHabitMonth(ym) {
  lifeState.habitSelectedMonth = ym;
  const menu = document.getElementById('habitMonthDropdownMenu');
  if (menu) menu.classList.add('hidden');
  loadHabits();
}

function jumpHabitCurrentMonth() {
  const today = new Date();
  lifeState.habitSelectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  loadHabits();
}

function renderHabits(data) {
  const container = document.getElementById('habitListContainer');
  const maxStreakElem = document.getElementById('habitKpiMaxStreak');
  const todayDoneElem = document.getElementById('habitKpiTodayDone');
  const consistencyElem = document.getElementById('habitKpiConsistency');

  if (!container) return;

  const habits = data.habits || [];
  const daysInMonth = data.days_in_month || 30;
  const firstWeekday = data.first_weekday || 0;

  // Update Month Dropdown Header & Menu
  const mLabel = document.getElementById('habitMonthDropdownLabel');
  if (mLabel && data.month_label) {
    mLabel.textContent = data.month_label;
  }

  const mMenu = document.getElementById('habitMonthDropdownMenu');
  if (mMenu && data.available_months) {
    mMenu.innerHTML = data.available_months.map(ym => {
      const parts = ym.split('-');
      const label = `Tháng ${parts[1]}/${parts[0]}`;
      const isSelected = ym === data.selected_month;
      return `
        <button onclick="selectHabitMonth('${ym}')" class="w-full text-left px-3 py-1.5 rounded-xl transition text-xs font-semibold cursor-pointer ${
          isSelected ? 'bg-[#5F7465] text-white font-bold' : 'text-[#2B231D] hover:bg-[#EFE7D8]'
        }">
          ${label}
        </button>
      `;
    }).join('');
  }

  // KPIs
  let maxStreak = 0;
  let doneToday = 0;
  let totalChecks = 0;
  let possibleChecks = habits.length * daysInMonth;

  habits.forEach(h => {
    if (h.best_streak > maxStreak) maxStreak = h.best_streak;
    if (h.completed_today) doneToday++;
    totalChecks += (h.month_completed_count || 0);
  });

  const consistencyRate = possibleChecks > 0 ? Math.round((totalChecks / possibleChecks) * 100) : 0;

  if (maxStreakElem) maxStreakElem.textContent = `${maxStreak} ngày`;
  if (todayDoneElem) todayDoneElem.textContent = `${doneToday} / ${habits.length}`;
  if (consistencyElem) consistencyElem.textContent = `${consistencyRate}%`;

  // Render Area Chart (Biểu đồ miền xu hướng cả tháng)
  if (data.chart) {
    const sec = document.getElementById('section-habits');
    if (sec && !sec.classList.contains('hidden')) {
      renderHabitAreaChart(data.chart);
    }
  }

  const badge = document.getElementById('sidebarHabitsBadge');
  if (badge) badge.textContent = habits.length;

  container.innerHTML = habits.map(h => {
    // Generate empty padding cells for 1st day offset
    let paddingCells = '';
    for (let p = 0; p < firstWeekday; p++) {
      paddingCells += '<div class="h-6 sm:h-7"></div>';
    }

    // Generate Calendar day cells
    const daysCells = (h.month_days || []).map(ws => {
      const isDone = ws.completed;
      const isToday = ws.is_today;
      const isPast = ws.is_past;

      if (isToday) {
        // TODAY: Compact checkable cell
        return `
          <div onclick="toggleHabitLog(${h.id}, '${ws.date}')" class="flex items-center justify-center rounded-lg ${isDone ? 'bg-[#5F7465] text-white shadow-2xs' : 'border border-[#5F7465] bg-[#FFFDF9] text-[#5F7465] hover:border-[#233329]'} cursor-pointer select-none h-6 sm:h-7 text-[10px] font-bold transition" title="Hôm nay (${ws.day}): Bấm để ${isDone ? 'hủy' : 'tích hoàn thành'}">
            <span>${ws.day}</span>
            ${isDone ? '<i data-lucide="check" class="w-2.5 h-2.5 ml-0.5 stroke-[3]"></i>' : '<i data-lucide="plus" class="w-2.5 h-2.5 ml-0.5 opacity-70"></i>'}
          </div>
        `;
      } else if (isPast) {
        if (isDone) {
          return `
            <div class="flex items-center justify-center rounded-lg bg-[#5F7465] text-white shadow-2xs select-none transition h-6 sm:h-7 text-[10px] font-bold" title="Ngày ${ws.day}: Đã hoàn thành">
              <span>${ws.day}</span>
            </div>
          `;
        } else {
          return `
            <div class="flex items-center justify-center rounded-lg bg-[#F7F2E8]/60 text-[#A49688] select-none h-6 sm:h-7 text-[10px] font-medium" title="Ngày ${ws.day}: Chưa hoàn thành">
              <span>${ws.day}</span>
            </div>
          `;
        }
      } else {
        // FUTURE DAYS: Dotted neutral placeholder
        return `
          <div class="flex items-center justify-center rounded-lg bg-transparent text-[#DECDB5]/60 select-none h-6 sm:h-7 text-[10px]">
            <span>${ws.day}</span>
          </div>
        `;
      }
    }).join('');

    const completedRate = Math.round(((h.month_completed_count || 0) / daysInMonth) * 100);

    return `
      <div class="p-4 sm:p-5 rounded-3xl bg-[#FFFDF9] border border-[#DECDB5] hover:border-[#5F7465] transition shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-4 sm:gap-6">
        <!-- Habit Metadata & Controls: Expansive room for habit name without truncation -->
        <div class="flex items-start gap-3.5 sm:gap-4 flex-1 min-w-0">
          <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center bg-[#FDF3EE] border border-[#DECDB5] text-[#B14720] shrink-0">
            <i data-lucide="${h.icon || 'sparkles'}" class="w-5 h-5 sm:w-6 sm:h-6"></i>
          </div>
          <div class="space-y-1.5 flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <h4 onclick="editHabit(${h.id})" class="font-bold text-base sm:text-lg text-[#2B231D] hover:text-[#5F7465] cursor-pointer transition break-words leading-snug" title="Nhấp để sửa tên thói quen">${escapeHtml(h.name)}</h4>
              <div class="flex items-center gap-1 shrink-0 pt-0.5">
                <button onclick="editHabit(${h.id})" class="p-1 text-[#A49688] hover:text-[#5F7465] hover:bg-[#F0F5F2] rounded-lg transition cursor-pointer" title="Sửa tên thói quen">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteHabit(${h.id})" class="p-1 text-[#A49688] hover:text-[#B14720] hover:bg-[#FDF3EE] rounded-lg transition cursor-pointer" title="Xóa thói quen">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <div class="flex items-center gap-2 flex-wrap pt-0.5">
              <span class="inline-flex items-center gap-1 text-xs font-bold text-[#C3651F] bg-[#FDF6E2] px-2.5 py-0.5 rounded-full border border-[#DECDB5]">
                <i data-lucide="flame" class="w-3.5 h-3.5 fill-[#C3651F]"></i> ${h.streak} ngày liên tiếp
              </span>
              <span class="text-xs text-[#786B60]">Kỷ lục: ${h.best_streak} ngày</span>
            </div>

            <div class="pt-0.5 text-xs text-[#5F7465] font-semibold flex items-center gap-1.5">
              <i data-lucide="calendar-check" class="w-3.5 h-3.5"></i>
              <span>Đã làm: <strong>${h.month_completed_count || 0} / ${daysInMonth}</strong> ngày (${completedRate}%)</span>
            </div>
          </div>
        </div>

        <!-- Compact Month Calendar: Neat mini-widget on the right -->
        <div class="w-full md:w-[260px] lg:w-[280px] shrink-0 bg-[#F7F2E8] p-2.5 sm:p-3 rounded-2xl border border-[#DECDB5] shadow-2xs">
          <!-- Calendar Header -->
          <div class="flex items-center justify-between mb-1.5 pb-1 border-b border-[#DECDB5]/60 text-[11px] font-bold text-[#626037]">
            <span class="flex items-center gap-1">
              <i data-lucide="calendar" class="w-3 h-3 text-[#5F7465]"></i> Lịch ${data.month_label}
            </span>
          </div>

          <!-- 7-Column Header (T2 -> CN) -->
          <div class="grid grid-cols-7 gap-1 text-center mb-1 text-[9px] font-bold text-[#786B60] uppercase tracking-wider">
            <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
          </div>

          <!-- Calendar Days Grid -->
          <div class="grid grid-cols-7 gap-1">
            ${paddingCells}
            ${daysCells}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function renderHabitAreaChart(chartData) {
  if (!chartData || !chartData.labels) return;
  const canvas = document.getElementById('habitAreaChart');
  if (!canvas) return;

  const sec = document.getElementById('section-habits');
  if (sec && sec.classList.contains('hidden')) {
    return; // Will be animated cleanly once unhidden
  }

  const ctx = canvas.getContext('2d');
  const completed = chartData.completed || [];
  if (habitCharts.area) {
    habitCharts.area.data.labels = chartData.labels;
    habitCharts.area.data.datasets[0].data = completed;
    habitCharts.area.update('none');
    return;
  }

  // Smooth vertical gradient for the Area Chart fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(95, 116, 101, 0.42)'); // Top: soft vintage sage
  gradient.addColorStop(0.65, 'rgba(95, 116, 101, 0.12)');
  gradient.addColorStop(1, 'rgba(95, 116, 101, 0.01)');  // Bottom: transparent

  const total = chartData.total_habits || 5;
  const avg = completed.length > 0 ? (completed.reduce((a, b) => a + b, 0) / completed.length).toFixed(1) : 0;

  const titleElem = document.getElementById('habitAreaChartTitle');
  if (titleElem && chartData.month_label) {
    titleElem.textContent = `Biểu Đồ Miền: Xu Hướng Hoàn Thành Thói Quen (${chartData.month_label})`;
  }

  const badgeText = document.getElementById('habitAvgBadgeText');
  if (badgeText) {
    badgeText.textContent = `Trung bình: ${avg}/${total} thói quen/ngày (${chartData.month_label})`;
  }

  const count = chartData.labels.length || 30;
  // Delay per point to create sequential wave animation from left to right across full month
  const stepDelay = Math.max(16, Math.min(30, Math.floor(750 / count)));

  habitCharts.area = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'Số thói quen hoàn thành',
          data: completed,
          fill: true, // AREA CHART
          backgroundColor: gradient,
          borderColor: '#5F7465', // Vintage Sage Green
          borderWidth: 2.5,
          tension: 0.35, // Smooth curves
          pointBackgroundColor: '#FFFDF9',
          pointBorderColor: '#5F7465',
          pointBorderWidth: 2,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#5F7465',
          pointHoverBorderColor: '#FFFDF9',
          pointHoverBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animations: {
        y: {
          type: 'number',
          easing: 'easeOutQuart',
          duration: 480,
          from: (ctx) => {
            if (ctx.type === 'data') {
              const y = ctx.chart.scales.y;
              return y ? y.getPixelForValue(0) : 0;
            }
          },
          delay(ctx) {
            if (ctx.type !== 'data') return 0;
            return ctx.index * stepDelay;
          }
        },
        radius: {
          type: 'number',
          easing: 'easeOutBack',
          duration: 380,
          from: 0,
          delay(ctx) {
            if (ctx.type !== 'data') return 0;
            return ctx.index * stepDelay;
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: '#233329',
          titleFont: { family: 'inherit', size: 12, weight: 'bold' },
          bodyFont: { family: 'inherit', size: 12 },
          padding: 10,
          cornerRadius: 12,
          displayColors: false,
          callbacks: {
            title: function(items) {
              return `Ngày ${items[0].label} (${chartData.month_label})`;
            },
            label: function(context) {
              const val = context.parsed.y;
              const rate = total > 0 ? Math.round((val / total) * 100) : 0;
              return `Đã hoàn thành: ${val}/${total} thói quen (${rate}%)`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: { family: 'inherit', size: 10, weight: '600' },
            color: '#786B60',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 16
          }
        },
        y: {
          min: 0,
          max: Math.max(total, ...completed) + 1,
          grid: {
            color: 'rgba(222, 205, 181, 0.35)',
            borderDash: [3, 3]
          },
          ticks: {
            stepSize: 1,
            precision: 0,
            font: { family: 'inherit', size: 10 },
            color: '#786B60'
          }
        }
      }
    }
  });
}

async function toggleHabitLog(habitId, date) {
  try {
    playTickSound();
    const res = await fetch(`/api/habits/${habitId}/toggle?date=${date}`, { method: 'POST' });
    if (!res.ok) throw new Error('Không thể cập nhật thói quen');
    loadHabits();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function quickAddHabit() {
  const name = prompt('Nhập tên thói quen mới (ví dụ: Uống 2L nước, Đọc sách 30p, Đi ngủ trước 23h):');
  if (!name || !name.trim()) return;

  try {
    const res = await fetch('/api/habits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), icon: 'sparkles', color: '#5F7465' })
    });
    if (!res.ok) throw new Error('Không thể thêm thói quen');
    showToast('Đã thêm thói quen mới thành công!', 'success');
    loadHabits();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editHabit(id) {
  const habit = lifeState.habits.find(h => h.id === id);
  if (!habit) return;

  const newName = prompt('Chỉnh sửa tên thói quen:', habit.name);
  if (newName === null) return; // Người dùng ấn hủy
  const trimmed = newName.trim();
  if (!trimmed) {
    showToast('Tên thói quen không được để trống!', 'error');
    return;
  }

  if (trimmed === habit.name) return;

  try {
    const res = await fetch(`/api/habits/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed })
    });
    if (!res.ok) throw new Error('Không thể cập nhật tên thói quen');
    showToast(`Đã đổi tên thói quen thành: "${trimmed}"`, 'success');
    loadHabits();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteHabit(id) {
  if (!confirm('Bạn có chắc muốn xóa thói quen này không?')) return;
  try {
    const res = await fetch(`/api/habits/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Không thể xóa thói quen');
    showToast('Đã xóa thói quen', 'success');
    loadHabits();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =========================================================================
// SECTION 4: DAILY JOURNAL & MOOD (AppFlowy)
// =========================================================================

function stepJournalDate(delta) {
  const parts = lifeState.currentJournalDate.split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + delta);
  const nextDateStr = d.toISOString().split('T')[0];
  loadJournal(nextDateStr);
}

function jumpJournalToday() {
  const todayStr = new Date().toISOString().split('T')[0];
  loadJournal(todayStr);
}

async function loadJournal(date) {
  lifeState.currentJournalDate = date || new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('journalDateInput');
  if (dateInput) dateInput.value = lifeState.currentJournalDate;

  const saveStatus = document.getElementById('journalSaveStatus');
  if (saveStatus) saveStatus.textContent = '';

  try {
    const res = await fetch(`/api/journal?date=${lifeState.currentJournalDate}`);
    const data = await res.json();
    const entry = data.entry;

    const titleElem = document.getElementById('journalTitleInput');
    const gratElem = document.getElementById('journalGratitudeInput');
    const impElem = document.getElementById('journalImprovementInput');
    const contentElem = document.getElementById('journalContentInput');

    if (entry) {
      if (titleElem) titleElem.value = entry.title || '';
      if (gratElem) gratElem.value = entry.gratitude || '';
      if (impElem) impElem.value = entry.improvement || '';
      if (contentElem) contentElem.value = entry.content || '';
      setJournalMood(entry.mood || 'good');
    } else {
      if (titleElem) titleElem.value = '';
      if (gratElem) gratElem.value = '';
      if (impElem) impElem.value = '';
      if (contentElem) contentElem.value = '';
      setJournalMood('good');
    }
  } catch (err) {
    console.error('loadJournal error:', err);
  }
}

function setJournalMood(mood) {
  lifeState.currentJournalMood = mood;
  const moods = ['great', 'good', 'neutral', 'tired', 'stressed'];
  moods.forEach(m => {
    const btn = document.getElementById(`moodBtn_${m}`);
    if (btn) {
      if (m === mood) {
        btn.classList.add('border-[#5F7465]', 'bg-[#F0F5F2]', 'scale-105', 'font-black');
      } else {
        btn.classList.remove('border-[#5F7465]', 'bg-[#F0F5F2]', 'scale-105', 'font-black');
      }
    }
  });
}

async function saveCurrentJournal() {
  const payload = {
    date: lifeState.currentJournalDate,
    title: document.getElementById('journalTitleInput')?.value.trim() || '',
    mood: lifeState.currentJournalMood,
    gratitude: document.getElementById('journalGratitudeInput')?.value.trim() || '',
    improvement: document.getElementById('journalImprovementInput')?.value.trim() || '',
    content: document.getElementById('journalContentInput')?.value.trim() || ''
  };

  try {
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Không thể lưu nhật ký');
    showToast('Đã lưu nhật ký thành công!', 'success');

    const saveStatus = document.getElementById('journalSaveStatus');
    if (saveStatus) {
      const now = new Date();
      saveStatus.textContent = `✓ Đã lưu lúc ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    loadJournalHistory();

    const todayStr = new Date().toISOString().split('T')[0];
    if (lifeState.currentJournalDate === todayStr) {
      loadDashboard();
    }
    if (window.scheduleAutoSync) window.scheduleAutoSync();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadJournalHistory() {
  try {
    const res = await fetch('/api/journal?limit=10');
    const data = await res.json();
    const container = document.getElementById('journalHistoryList');
    if (!container) return;

    const entries = data.entries || [];
    if (entries.length === 0) {
      container.innerHTML = '<p class="text-xs text-[#A49688] py-4 text-center">Chưa có bài viết nào</p>';
      return;
    }

    const moodIcons = {
      great: '😄 Rất tốt',
      good: '😊 Vui vẻ',
      neutral: '😐 Bình thường',
      tired: '🥱 Mệt mỏi',
      stressed: '😰 Căng thẳng'
    };

    container.innerHTML = entries.map(e => `
      <div onclick="loadJournal('${e.date}')" class="p-3 rounded-2xl border ${e.date === lifeState.currentJournalDate ? 'border-[#5F7465] bg-[#F0F5F2]' : 'border-[#DECDB5] bg-[#FFFDF9]'} hover:border-[#5F7465] transition cursor-pointer shadow-2xs space-y-1">
        <div class="flex items-center justify-between text-xs">
          <span class="font-extrabold text-[#2B231D]">${formatDisplayDate(e.date)}</span>
          <span class="text-[10px] font-bold">${moodIcons[e.mood] || '😊'}</span>
        </div>
        <p class="font-semibold text-xs text-[#626037] truncate">${escapeHtml(e.title || 'Không có tiêu đề')}</p>
        <p class="text-[11px] text-[#786B60] line-clamp-2">${escapeHtml(e.content || e.gratitude || '')}</p>
      </div>
    `).join('');
  } catch (err) {
    console.error('loadJournalHistory error:', err);
  }
}

// =========================================================================
// SECTION 5: NOTES & SECOND BRAIN (AppFlowy & Vikunja)
// =========================================================================

async function loadNotes() {
  try {
    let url = `/api/notes?category=${encodeURIComponent(lifeState.notesCategory)}`;
    if (lifeState.notesSearch) url += `&q=${encodeURIComponent(lifeState.notesSearch)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không thể tải ghi chú');
    lifeState.notes = await res.json();
    renderNotes();
  } catch (err) {
    console.error('loadNotes error:', err);
  }
}

function renderNotes() {
  const container = document.getElementById('notesGridContainer');
  if (!container) return;

  const badge = document.getElementById('sidebarNotesBadge');
  if (badge) badge.textContent = lifeState.notes.length;

  if (lifeState.notes.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-16 text-[#A49688]">
        <i data-lucide="sticky-note" class="w-12 h-12 mx-auto mb-2 opacity-40"></i>
        <p class="font-bold text-sm text-[#786B60]">Không tìm thấy ghi chú nào</p>
        <p class="text-xs">Bấm "+ Tạo ghi chú" để lưu trữ ý tưởng của bạn!</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = lifeState.notes.map(n => `
    <div class="p-5 rounded-3xl bg-[#FFFDF9] border ${n.is_pinned ? 'border-[#D39526]' : 'border-[#DECDB5]'} hover:border-[#5F7465] transition shadow-xs flex flex-col justify-between space-y-4 group">
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EFE7D8] text-[#626037] border border-[#DECDB5]">${escapeHtml(n.category)}</span>
          <div class="flex items-center gap-1">
            <button onclick="copyNoteContent(${n.id})" class="p-1.5 rounded-lg text-[#786B60] hover:text-[#5F7465] hover:bg-[#F0F5F2] transition cursor-pointer" title="Sao chép nội dung">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="togglePinNote(${n.id})" class="p-1.5 rounded-lg text-[#786B60] hover:text-[#D39526] hover:bg-[#FDF6E2] transition cursor-pointer" title="${n.is_pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}">
              <i data-lucide="pin" class="w-3.5 h-3.5 ${n.is_pinned ? 'fill-[#D39526] text-[#D39526]' : ''}"></i>
            </button>
            <button onclick="deleteNote(${n.id})" class="p-1.5 rounded-lg text-[#A49688] hover:text-[#B14720] hover:bg-[#FDF3EE] transition opacity-0 group-hover:opacity-100 cursor-pointer" title="Xóa ghi chú">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
        <h4 class="font-black text-base text-[#2B231D] tracking-tight hover:text-[#5F7465] cursor-pointer" onclick="openNoteModal(${n.id})">${escapeHtml(n.title)}</h4>
        <p class="text-xs text-[#786B60] whitespace-pre-line line-clamp-6 leading-relaxed">${escapeHtml(n.content)}</p>
      </div>

      <div class="pt-2.5 border-t border-[#DECDB5]/40 flex items-center justify-between text-[11px] text-[#A49688]">
        <span>${formatDisplayDate(n.updated_at || n.created_at)}</span>
        <button onclick="openNoteModal(${n.id})" class="font-semibold text-[#5F7465] hover:text-[#233329] hover:underline cursor-pointer">Mở ghi chú →</button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function openNoteModal(noteId = null) {
  const modal = document.getElementById('noteModal');
  const idInput = document.getElementById('noteModalId');
  const header = document.getElementById('noteModalHeader');
  const title = document.getElementById('noteModalTitle');
  const cat = document.getElementById('noteModalCategory');
  const pinned = document.getElementById('noteModalIsPinned');
  const content = document.getElementById('noteModalContent');

  if (!modal) return;

  if (noteId) {
    const note = lifeState.notes.find(n => n.id === noteId);
    if (!note) return;
    if (idInput) idInput.value = note.id;
    if (header) header.textContent = 'Chỉnh Sửa Ghi Chú';
    if (title) title.value = note.title;
    if (cat) cat.value = note.category || 'Ý tưởng';
    if (pinned) pinned.checked = !!note.is_pinned;
    if (content) content.value = note.content || '';
  } else {
    if (idInput) idInput.value = '';
    if (header) header.textContent = 'Ghi Chú Mới';
    if (title) title.value = '';
    if (cat) cat.value = 'Ý tưởng';
    if (pinned) pinned.checked = false;
    if (content) content.value = '';
  }

  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
  setTimeout(() => title?.focus(), 50);
}

function closeNoteModal() {
  const modal = document.getElementById('noteModal');
  if (modal) modal.classList.add('hidden');
}

async function saveNoteModalAction() {
  const idInput = document.getElementById('noteModalId');
  const title = document.getElementById('noteModalTitle')?.value.trim();
  const category = document.getElementById('noteModalCategory')?.value || 'Ý tưởng';
  const is_pinned = document.getElementById('noteModalIsPinned')?.checked ? 1 : 0;
  const content = document.getElementById('noteModalContent')?.value.trim() || '';

  if (!title) {
    showToast('Vui lòng nhập tiêu đề ghi chú!', 'error');
    return;
  }

  const isEdit = idInput && idInput.value;
  const payload = { title, category, is_pinned, content };

  try {
    let res;
    if (isEdit) {
      res = await fetch(`/api/notes/${idInput.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) throw new Error('Không thể lưu ghi chú');
    closeNoteModal();
    showToast(isEdit ? 'Đã cập nhật ghi chú!' : 'Đã tạo ghi chú mới!', 'success');
    loadNotes();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function copyNoteContent(id) {
  const note = lifeState.notes.find(n => n.id === id);
  if (!note) return;
  const text = `${note.title}\n\n${note.content || ''}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Đã sao chép nội dung ghi chú vào bộ nhớ tạm!', 'success');
  }).catch(() => {
    showToast('Không thể sao chép vào bộ nhớ tạm', 'error');
  });
}

async function quickAddNote() {
  openNoteModal();
}

async function editNotePrompt(id) {
  openNoteModal(id);
}

async function togglePinNote(id) {
  try {
    const res = await fetch(`/api/notes/${id}/pin`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Không thể ghim ghi chú');
    loadNotes();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync(300);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteNote(id) {
  if (!confirm('Bạn có chắc muốn xóa ghi chú này?')) return;
  try {
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Không thể xóa ghi chú');
    showToast('Đã xóa ghi chú', 'success');
    loadNotes();
    loadDashboard();
    if (window.scheduleAutoSync) window.scheduleAutoSync();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setNoteFilter(cat) {
  lifeState.notesCategory = cat;
  const cats = ['all', 'Ý tưởng', 'Công việc', 'Học tập', 'Tài chính'];
  cats.forEach(c => {
    const btn = document.getElementById(`noteFilterBtn_${c}`);
    if (btn) {
      if (c === cat) {
        btn.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-[#233329] text-[#FFFDF9] shadow-2xs transition cursor-pointer';
      } else {
        btn.className = 'px-2.5 py-1 text-xs font-semibold text-[#786B60] hover:text-[#2B231D] hover:bg-[#FFFDF9] transition cursor-pointer';
      }
    }
  });
  loadNotes();
}

function searchNotes(q) {
  lifeState.notesSearch = q.trim();
  loadNotes();
}

// =========================================================================
// POMODORO FOCUS TIMER (Super Productivity) & RETRO AUDIO CHIME
// =========================================================================

function playPomodoroChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Dual-tone retro bell: Note 1 (D5: 587.33Hz) -> Note 2 (A5: 880Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.28, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.85);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.28);
    gain2.gain.setValueAtTime(0.32, now + 0.28);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.28);
    osc2.stop(now + 1.3);
  } catch (e) {
    console.log('Audio chime not supported', e);
  }
}

function playTickSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  } catch (e) {}
}

function setPomoMode(mode) {
  lifeState.pomoMode = mode;
  if (lifeState.pomoIsRunning) {
    clearInterval(lifeState.pomoTimerId);
    lifeState.pomoIsRunning = false;
  }

  const modeDurations = {
    focus: 25 * 60,
    short: 5 * 60,
    long: 15 * 60
  };

  lifeState.pomoTimeLeft = modeDurations[mode] || 25 * 60;

  // Update mode selector buttons
  const modes = ['focus', 'short', 'long'];
  modes.forEach(m => {
    const btn = document.getElementById(`pomoMode_${m}`);
    if (btn) {
      if (m === mode) {
        btn.className = 'py-1 rounded-lg bg-[#233329] text-[#FFFDF9] shadow-2xs transition cursor-pointer font-bold';
      } else {
        btn.className = 'py-1 rounded-lg text-[#786B60] hover:text-[#2B231D] hover:bg-[#EFE7D8] transition cursor-pointer font-semibold';
      }
    }
  });

  updatePomoUI();
}

function startPomoForTodo(id, title) {
  lifeState.pomoActiveTodo = { id, title };
  setPomoMode('focus');
  togglePomodoro();
  showToast(`🎯 Bắt đầu tập trung cho: "${title}"`, 'info');
}

function clearActivePomoTask() {
  lifeState.pomoActiveTodo = null;
  updatePomoUI();
}

function togglePomodoro() {
  if (lifeState.pomoIsRunning) {
    clearInterval(lifeState.pomoTimerId);
    lifeState.pomoIsRunning = false;
    updatePomoUI();
  } else {
    lifeState.pomoIsRunning = true;
    lifeState.pomoTimerId = setInterval(tickPomodoro, 1000);
    updatePomoUI();
  }
}

function resetPomodoro() {
  clearInterval(lifeState.pomoTimerId);
  lifeState.pomoIsRunning = false;
  const modeDurations = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  lifeState.pomoTimeLeft = modeDurations[lifeState.pomoMode] || 25 * 60;
  updatePomoUI();
}

async function tickPomodoro() {
  if (lifeState.pomoTimeLeft > 0) {
    lifeState.pomoTimeLeft--;
    updatePomoUI();
  } else {
    clearInterval(lifeState.pomoTimerId);
    lifeState.pomoIsRunning = false;
    playPomodoroChime();

    if (lifeState.pomoMode === 'focus') {
      lifeState.pomoSessions++;

      // If linked to an active task, automatically increment pomo count in DB!
      if (lifeState.pomoActiveTodo) {
        try {
          await fetch(`/api/todos/${lifeState.pomoActiveTodo.id}/pomodoro-done`, { method: 'POST' });
          showToast(`🎉 Hoàn thành 1 phiên Pomodoro cho: "${lifeState.pomoActiveTodo.title}"! Hãy nghỉ ngơi 5 phút nhé!`, 'success');
          loadTodos();
          loadTodoStats();
          loadDashboard();
        } catch (e) {
          showToast('🎉 Hoàn thành phiên Pomodoro 25 phút! Hãy nghỉ ngơi 5 phút nhé!', 'success');
        }
      } else {
        showToast('🎉 Hoàn thành phiên Pomodoro 25 phút! Hãy nghỉ ngơi 5 phút nhé!', 'success');
      }

      setPomoMode('short');
    } else {
      showToast('⏰ Hết giờ nghỉ giải lao! Đã sẵn sàng cho phiên tập trung tiếp theo chưa?', 'info');
      setPomoMode('focus');
    }

    updatePomoUI();
  }
}

function updatePomoUI() {
  const display = document.getElementById('pomoTimeDisplay');
  const icon = document.getElementById('pomoPlayIcon');
  const sessions = document.getElementById('pomoSessionCount');
  const banner = document.getElementById('pomoActiveTaskBanner');
  const activeTitle = document.getElementById('pomoActiveTaskTitle');

  if (display) {
    const mins = Math.floor(lifeState.pomoTimeLeft / 60);
    const secs = lifeState.pomoTimeLeft % 60;
    display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  if (icon) {
    icon.setAttribute('data-lucide', lifeState.pomoIsRunning ? 'pause' : 'play');
    if (window.lucide) lucide.createIcons();
  }

  if (sessions) {
    sessions.textContent = `${lifeState.pomoSessions} phiên`;
  }

  if (banner && activeTitle) {
    if (lifeState.pomoActiveTodo) {
      activeTitle.textContent = lifeState.pomoActiveTodo.title;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }
}

// Helper formatting functions
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split(' ')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Mobile Connection & QR Code Modal
async function openMobileConnectModal() {
  const modal = document.getElementById('mobileConnectModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  try {
    const res = await fetch('/api/system/network-info');
    if (res.ok) {
      const data = await res.json();
      const input = document.getElementById('mobileConnectUrlInput');
      const img = document.getElementById('mobileQrImg');
      if (input) input.value = data.url;
      if (img) {
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=svg&data=${encodeURIComponent(data.url)}`;
      }
    }
  } catch (e) {
    console.error('Error fetching network info:', e);
  }
  if (window.lucide) lucide.createIcons();
}

function closeMobileConnectModal() {
  const modal = document.getElementById('mobileConnectModal');
  if (modal) modal.classList.add('hidden');
}

function copyMobileUrl() {
  const input = document.getElementById('mobileConnectUrlInput');
  const btn = document.getElementById('mobileCopyBtn');
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    if (btn) {
      const oldText = btn.textContent;
      btn.textContent = 'Đã chép! ✓';
      btn.classList.add('bg-[#5F7465]');
      setTimeout(() => {
        btn.textContent = oldText;
        btn.classList.remove('bg-[#5F7465]');
      }, 2000);
    }
    showToast('Đã sao chép đường dẫn: ' + input.value, 'success');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Đã sao chép đường dẫn!', 'success');
  });
}

// Cloud Run 2-way Sync
async function loadSyncStatus() {
  try {
    const res = await fetch('/api/sync/status');
    if (res.ok) {
      const data = await res.json();
      const input = document.getElementById('settingsCloudUrl');
      const badge = document.getElementById('syncLastTimeBadge');
      if (input && data.cloud_run_url) input.value = data.cloud_run_url;
      if (badge && data.last_cloud_sync) badge.textContent = `Đã đồng bộ: ${data.last_cloud_sync}`;
    }
  } catch (err) {
    console.error('Error loading sync status:', err);
  }
}

async function triggerCloudSyncNow() {
  const input = document.getElementById('settingsCloudUrl');
  const btn = document.getElementById('btnTriggerSync');
  const icon = document.getElementById('syncSpinIcon');
  const badge = document.getElementById('syncLastTimeBadge');

  const cloudUrl = input ? input.value.trim() : '';
  if (!cloudUrl) {
    showToast('Vui lòng nhập link Cloud Run trước khi đồng bộ', 'warning');
    if (input) input.focus();
    return;
  }

  if (icon) icon.classList.add('animate-spin');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/sync/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloud_url: cloudUrl })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Không thể đồng bộ với Cloud');

    showToast(data.message || 'Đồng bộ 2 chiều thành công!', 'success');
    if (badge && data.last_synced) badge.textContent = `Đã đồng bộ: ${data.last_synced}`;

    // Reload active tab data to reflect changes
    reloadActiveTabData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (icon) icon.classList.remove('animate-spin');
    if (btn) btn.disabled = false;
  }
}

// Auto-run on DOM ready

// =========================================================================
// AUTOMATIC 2-WAY SYNC ENGINE (PC <-> Render Cloud)
// =========================================================================
function isLocalEnvironment() {
  const h = window.location.hostname;
  return h === '127.0.0.1' || h === 'localhost' || /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(h);
}

let autoSyncTimeout = null;
let lastAutoSyncTime = 0;
let isSyncing = false;

function updateSyncStatusUI(status) {
  const dot = document.getElementById('syncPulseDot');
  const text = document.getElementById('syncStatusText');
  if (!dot) return;

  if (status === 'syncing') {
    dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    if (text) text.textContent = 'Đang lưu & đồng bộ...';
  } else if (status === 'synced') {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500 transition-colors';
    if (text) text.textContent = 'Đã đồng bộ';
  } else if (status === 'error') {
    dot.className = 'w-2 h-2 rounded-full bg-rose-500';
    if (text) text.textContent = 'Lỗi kết nối';
  }
}

async function autoCloudSync(silent = true, isBackgroundPoll = false) {
  const isLocal = isLocalEnvironment();
  if (!isLocal || isSyncing) return;

  isSyncing = true;
  updateSyncStatusUI('syncing');

  const badge = document.getElementById('syncLastTimeBadge');
  const icon = document.getElementById('syncSpinIcon');
  if (icon && !silent) icon.classList.add('animate-spin');

  try {
    const res = await fetch('/api/sync/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (res.ok) {
      const data = await res.json();
      lastAutoSyncTime = Date.now();
      updateSyncStatusUI('synced');
      if (badge && data.last_synced) {
        badge.textContent = `Đã đồng bộ: ${data.last_synced}`;
      }
      if (!silent) {
        showToast(data.message || 'Đồng bộ 2 chiều thành công!', 'success');
      }
      // Silently refresh view ONLY if this was a background poll that actually received new items from phone,
      // avoiding canvas chart recreation or scroll jumps right after local user clicks!
      if (isBackgroundPoll && data.pulled_changes) {
        reloadActiveTabData(true);
      }
    } else {
      updateSyncStatusUI('error');
    }
  } catch (err) {
    updateSyncStatusUI('error');
    if (!silent) {
      showToast(err.message, 'error');
    }
    console.warn('Auto sync skipped/failed:', err);
  } finally {
    isSyncing = false;
    if (icon && !silent) icon.classList.remove('animate-spin');
  }
}

window.scheduleAutoSync = function(delayMs = 300) {
  const isLocal = isLocalEnvironment();
  if (!isLocal) return;
  updateSyncStatusUI('syncing');
  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(() => {
    autoCloudSync(true, false); // Local mutation push -> do NOT reload active tab!
  }, delayMs);
};

document.addEventListener('DOMContentLoaded', () => {
  // Initial sync immediately after UI boot (500ms)
  setTimeout(() => { autoCloudSync(true, true); }, 500);

  // Fast periodic auto-sync every 10s on PC so mobile changes appear within 10 seconds!
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      if (isLocalEnvironment()) {
        autoCloudSync(true, true);
      } else {
        reloadActiveTabData(true);
      }
    }
  }, 10000);

  // Auto-sync immediately when app window gets focused
  window.addEventListener('focus', () => {
    autoCloudSync(true, true);
  });

  // Reload active tab when user returns to app/tab (crucial on mobile phones)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const isLocal = isLocalEnvironment();
      if (isLocal) {
        autoCloudSync(true);
      } else {
        reloadActiveTabData(true);
      }
    }
  });

  // Load initial Dashboard data
  loadDashboard();
  loadSyncStatus();

  // Preload badges & count
  setTimeout(() => {
    loadTodoStats();
    loadHabits();
    loadNotes();
  }, 300);

  // Close habit month dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('habitMonthDropdownMenu');
    const btn = document.getElementById('habitMonthDropdownBtn');
    if (menu && !menu.classList.contains('hidden')) {
      if (btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add('hidden');
      }
    }
  });

  // Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+S or Cmd+S in Journal tab
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      if (lifeState.currentTab === 'journal') {
        e.preventDefault();
        saveCurrentJournal();
      }
    }

    // Escape key closes open modals
    if (e.key === 'Escape') {
      closeTodoModal();
      closeNoteModal();
      if (typeof closeUploadModal === 'function') closeUploadModal();
      if (typeof closeSettingsModal === 'function') closeSettingsModal();
      if (typeof closeAddTransactionModal === 'function') closeAddTransactionModal();
      if (typeof closeMobileConnectModal === 'function') closeMobileConnectModal();
    }
  });

  // Modal Backdrop Click to Close
  ['todoModal', 'noteModal', 'uploadModal', 'settingsModal', 'addTransactionModal', 'mobileConnectModal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    }
  });
});

// =========================================================================
// HEADER SYNC ACTIONS: TẢI LÊN & TẢI VỀ (Mobile & Desktop)
// =========================================================================

// 1. Tải lên (Push to Cloud / Import Backup)
async function headerPushData() {
  const btn = document.getElementById('btnHeaderPush');
  const icon = document.getElementById('headerPushIcon');
  const isLocal = isLocalEnvironment();

  if (icon) icon.classList.add('animate-spin');
  if (btn) btn.disabled = true;

  try {
    if (isLocal) {
      showToast('Đang tải toàn bộ dữ liệu lên Cloud...', 'info');
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = { detail: `HTTP ${res.status}: ${res.statusText || 'Lỗi phản hồi máy chủ'}` };
      }
      if (!res.ok) throw new Error(data.detail || 'Không thể tải dữ liệu lên Cloud');

      const badge = document.getElementById('syncLastTimeBadge');
      if (badge && data.last_synced) badge.textContent = `Đã đồng bộ: ${data.last_synced}`;

      showToast(data.message || '✅ Đã tải dữ liệu lên Cloud thành công!', 'success');
    } else {
      const proceed = confirm('Bạn có muốn tải tệp sao lưu dữ liệu (.json) lên hệ thống không?');
      if (proceed) {
        const fileInput = document.getElementById('headerBackupFileInput');
        if (fileInput) fileInput.click();
      }
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  } finally {
    if (icon) icon.classList.remove('animate-spin');
    if (btn) btn.disabled = false;
  }
}

// 2. Tải về (Pull from Cloud / Export Backup)
async function headerPullData() {
  const btn = document.getElementById('btnHeaderPull');
  const icon = document.getElementById('headerPullIcon');
  const isLocal = isLocalEnvironment();

  if (icon) icon.classList.add('animate-spin');
  if (btn) btn.disabled = true;

  try {
    if (isLocal) {
      showToast('Đang tải dữ liệu từ Cloud về máy...', 'info');
      const res = await fetch('/api/sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = { detail: `HTTP ${res.status}: ${res.statusText || 'Lỗi phản hồi máy chủ'}` };
      }
      if (!res.ok) throw new Error(data.detail || 'Không thể tải dữ liệu từ Cloud');

      const badge = document.getElementById('syncLastTimeBadge');
      if (badge && data.last_synced) badge.textContent = `Đã đồng bộ: ${data.last_synced}`;

      showToast(data.message || '✅ Đã tải dữ liệu từ Cloud về máy thành công!', 'success');
      reloadActiveTabData(true);
    } else {
      showToast('Đang làm mới & tải tệp dữ liệu về máy...', 'info');
      const res = await fetch('/api/sync/export-data');
      if (!res.ok) throw new Error('Không thể xuất dữ liệu từ máy chủ');
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      a.href = url;
      a.download = `life_hub_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      reloadActiveTabData(true);
      showToast('✅ Đã tải dữ liệu về máy thành công!', 'success');
    }
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, 'error');
  } finally {
    if (icon) icon.classList.remove('animate-spin');
    if (btn) btn.disabled = false;
  }
}

// 3. Handle upload of backup JSON file
async function handleHeaderBackupUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const btn = document.getElementById('btnHeaderPush');
  const icon = document.getElementById('headerPushIcon');
  if (icon) icon.classList.add('animate-spin');
  if (btn) btn.disabled = true;

  try {
    showToast('Đang đọc và nạp tệp sao lưu...', 'info');
    const text = await file.text();
    const payload = JSON.parse(text);

    const res = await fetch('/api/sync/import-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = { detail: `HTTP ${res.status}: ${res.statusText || 'Lỗi nạp tệp'}` };
    }
    if (!res.ok) throw new Error(data.detail || 'Không thể nhập dữ liệu');

    showToast('✅ Đã nạp và cập nhật dữ liệu thành công!', 'success');
    reloadActiveTabData(true);
  } catch (err) {
    showToast(`Lỗi nạp tệp: ${err.message}`, 'error');
  } finally {
    if (icon) icon.classList.remove('animate-spin');
    if (btn) btn.disabled = false;
    event.target.value = '';
  }
}
