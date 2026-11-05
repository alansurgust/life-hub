
// =========================================================================
// ANIMATE-UI ENGINE (Micro-interactions, Springs, Sliding Pills, Numbers, Ripples)
// Inspired by: imskyleen/animate-ui
// =========================================================================

// 1. Sliding Pill Indicator (Bottom Nav & Sidebar)
function updateSlidingPills(activeTabKey) {
  if (!activeTabKey) activeTabKey = lifeState.currentTab || 'dashboard';

  // A. Mobile Bottom Nav Pill
  const bottomNav = document.querySelector('.app-bottom-nav');
  const bottomPill = document.getElementById('bottomNavPill');
  const activeMobileBtn = document.getElementById(`mobileNav_${activeTabKey}`);
  if (bottomNav && bottomPill && activeMobileBtn) {
    const navRect = bottomNav.getBoundingClientRect();
    const btnRect = activeMobileBtn.getBoundingClientRect();
    const leftOffset = btnRect.left - navRect.left + 4;
    const width = Math.max(0, btnRect.width - 8);
    bottomPill.style.transform = `translateX(${leftOffset}px)`;
    bottomPill.style.width = `${width}px`;
    bottomPill.classList.remove('opacity-0');

    // Spring scale bounce on active icon
    const icon = activeMobileBtn.querySelector('i, svg');
    if (icon) {
      icon.classList.remove('animate-spring-icon');
      void icon.offsetWidth;
      icon.classList.add('animate-spring-icon');
    }
  }

  // B. Desktop Sidebar Pill
  const sidebarNav = document.querySelector('#appSidebar nav');
  const sidebarPill = document.getElementById('sidebarNavPill');
  const activeDesktopBtn = document.getElementById(`navTab${activeTabKey.charAt(0).toUpperCase() + activeTabKey.slice(1)}`);
  if (sidebarNav && sidebarPill && activeDesktopBtn) {
    const navRect = sidebarNav.getBoundingClientRect();
    const btnRect = activeDesktopBtn.getBoundingClientRect();
    const topOffset = btnRect.top - navRect.top;
    const height = btnRect.height;
    sidebarPill.style.transform = `translateY(${topOffset}px)`;
    sidebarPill.style.height = `${height}px`;
    sidebarPill.classList.remove('opacity-0');

    const icon = activeDesktopBtn.querySelector('i, svg');
    if (icon) {
      icon.classList.remove('animate-spring-icon');
      void icon.offsetWidth;
      icon.classList.add('animate-spring-icon');
    }
  }
}

window.addEventListener('resize', () => {
  if (lifeState.currentTab) updateSlidingPills(lifeState.currentTab);
});

// 2. Rolling Number Counter (Odometer Animation)
function animateNumberValue(elOrId, targetValue, duration = 650, formatFn = null) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;

  const currentText = el.textContent || '';
  const numMatch = currentText.replace(/[^\d.-]/g, '');
  let startValue = 0;
  if (numMatch && !isNaN(parseFloat(numMatch))) {
    startValue = parseFloat(numMatch);
  }

  const startTime = performance.now();
  const diff = targetValue - startValue;
  if (Math.abs(diff) < 0.001) {
    el.textContent = formatFn ? formatFn(targetValue) : targetValue;
    return;
  }

  el.classList.add('number-counter');

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const currentVal = startValue + diff * ease;

    el.textContent = formatFn ? formatFn(currentVal) : Math.round(currentVal);

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = formatFn ? formatFn(targetValue) : targetValue;
    }
  }

  requestAnimationFrame(update);
}

// 3. Dopamine Checkmark Pop & Micro-Confetti Sparkles
function triggerDopamineCheck(element, x, y) {
  if (!element) return;

  element.classList.remove('animate-checkmark-pop');
  void element.offsetWidth;
  element.classList.add('animate-checkmark-pop');

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate([15, 25, 20]); } catch (e) {}
  }

  if (x === undefined || y === undefined) {
    const rect = element.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }

  const colors = ['#5F7465', '#D39526', '#B14720', '#626037', '#C3651F', '#233329'];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI + (Math.random() * 0.4 - 0.2);
    const dist = 24 + Math.random() * 18;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const size = 4 + Math.random() * 4;

    const p = document.createElement('div');
    p.className = 'sparkle-particle';
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.backgroundColor = colors[i % colors.length];
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--dy', `${dy}px`);

    document.body.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

// 4. Interactive Ripple Wave on Tap/Click
function initRippleEffects() {
  document.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('button, .tap-spring, [role="button"]');
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const circle = document.createElement('span');
    const diameter = Math.max(rect.width, rect.height);
    const radius = diameter / 2;

    target.classList.add('ripple-container');
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - rect.left - radius}px`;
    circle.style.top = `${e.clientY - rect.top - radius}px`;
    circle.classList.add('ripple-wave');

    const prevWave = target.querySelector('.ripple-wave');
    if (prevWave) prevWave.remove();

    target.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
  }, { passive: true });
}

// 5. Modal Spring Slide-up & Bottom Sheet Controller
function openAnimatedModal(modalId) {
  const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!modal) return;
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-visible'); syncAllCustomSelects();
  });
  if (window.lucide) lucide.createIcons({ root: modal });
}

function closeAnimatedModal(modalId) {
  const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!modal) return;
  modal.classList.remove('modal-visible');
  setTimeout(() => {
    if (!modal.classList.contains('modal-visible')) {
      modal.classList.add('hidden');
    }
  }, 320);
}

// Global click outside modal dialog closes modal smoothly
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay-animate') && e.target.classList.contains('modal-visible')) {
    closeAnimatedModal(e.target);
  }
});


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

// Vintage Brand Category Palette
const VINTAGE_CATEGORY_PALETTE = {
  'Công việc': { color: '#233329', bg: '#EAE6DC', border: '#DECDB5', chartColor: '#233329', dot: 'bg-[#233329]' },
  'Học tập': { color: '#B37812', bg: '#FDF6E2', border: '#DECDB5', chartColor: '#D39526', dot: 'bg-[#D39526]' },
  'Sức khỏe': { color: '#425848', bg: '#EDF4F0', border: '#C5D6CA', chartColor: '#5F7465', dot: 'bg-[#5F7465]' },
  'Cá nhân': { color: '#9C3916', bg: '#FDF3EE', border: '#E8C5B8', chartColor: '#B14720', dot: 'bg-[#B14720]' },
  'Tài chính': { color: '#A85314', bg: '#FAEDE4', border: '#E8CBB5', chartColor: '#C3651F', dot: 'bg-[#C3651F]' },
  'Khác': { color: '#4F4E29', bg: '#F4F3E8', border: '#D8D6BC', chartColor: '#626037', dot: 'bg-[#626037]' }
};

function getCategoryBadgeHtml(catName) {
  const meta = VINTAGE_CATEGORY_PALETTE[catName] || VINTAGE_CATEGORY_PALETTE['Khác'];
  return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border transition shadow-2xs" style="color: ${meta.color}; background-color: ${meta.bg}; border-color: ${meta.border};">
    <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${meta.chartColor};"></span>
    <span>${escapeHtml(catName || 'Công việc')}</span>
  </span>`;
}

let lifeState = {
  currentTab: 'dashboard', // dashboard, finance, todos, habits, journal, notes
  notebookSubTab: 'journal', // journal or notes for mobile 5-tab nav
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

// Instant client greeting localized to Vietnam time (UTC+7) across 4 periods
function getClientGreeting() {
  try {
    const vnFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hour12: false });
    const h = parseInt(vnFormatter.format(new Date()), 10);
    if (!isNaN(h)) {
      if (h >= 5 && h < 11) return 'Chào buổi sáng!';
      if (h >= 11 && h < 14) return 'Chào buổi trưa!';
      if (h >= 14 && h < 18) return 'Chào buổi chiều!';
      return 'Chào buổi tối!';
    }
  } catch (e) {}
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'Chào buổi sáng!';
  if (h >= 11 && h < 14) return 'Chào buổi trưa!';
  if (h >= 14 && h < 18) return 'Chào buổi chiều!';
  return 'Chào buổi tối!';
}

// Immediate application upon script load
try {
  const heroElem = document.getElementById('dashHeroGreeting');
  if (heroElem) heroElem.textContent = getClientGreeting();
} catch (e) {}

// =========================================================================
// TAB SWITCHING LOGIC WITH SMOOTH FADE UP/OUT & FLOAT UP/IN ANIMATIONS
// =========================================================================


// Tactile & Haptic Feedback Helpers (iOS Safari & WebKit vibration)
function triggerHaptic(duration = 25) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch (e) {}
}

let todoTouchStartCoords = {};
function handleTodoTouchStart(e, id) {
  if (e.touches && e.touches[0]) {
    todoTouchStartCoords[id] = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  }
}

function handleTodoTouchEnd(e, id) {
  const start = todoTouchStartCoords[id];
  if (!start || !e.changedTouches || !e.changedTouches[0]) return;
  const dx = e.changedTouches[0].clientX - start.x;
  const dy = e.changedTouches[0].clientY - start.y;
  const dt = Date.now() - start.time;
  delete todoTouchStartCoords[id];

  // If clean horizontal swipe: dx > 55, dy < 45, dt < 500
  if (Math.abs(dx) > 55 && Math.abs(dy) < 45 && dt < 500) {
    if (dx > 55) {
      // Swipe right -> complete task
      triggerHaptic([25, 35]);
      playTickSound();
      toggleTodo(id);
    } else if (dx < -55) {
      // Swipe left -> open edit modal
      openTodoModal(id);
    }
  }
}

function toggleHabitMonthView(habitId) {
  const el = document.getElementById(`habitMonthGrid_${habitId}`);
  const chev = document.getElementById(`habitMonthChevron_${habitId}`);
  const txt = document.getElementById(`habitMonthToggleText_${habitId}`);
  if (!el) return;
  const isHidden = el.classList.contains('hidden');
  if (isHidden) {
    el.classList.remove('hidden');
    if (chev) chev.style.transform = 'rotate(180deg)';
    if (txt) txt.textContent = 'Thu gọn';
  } else {
    el.classList.add('hidden');
    if (chev) chev.style.transform = 'rotate(0deg)';
    if (txt) txt.textContent = 'Lịch tháng';
  }
  if (window.lucide) lucide.createIcons();
}

const habitToggleLock = new Set();
const todoToggleLock = new Set();

async function toggleHabitLogWithFeedback(event, habitId, date) {
  const lockKey = `${habitId}_${date}`;
  if (habitToggleLock.has(lockKey)) return;
  habitToggleLock.add(lockKey);

  const btn = event ? event.currentTarget : null;
  triggerHaptic([20, 30, 40]);
  playTickSound();

  // Optimistic UI feedback: Flip state on screen immediately (< 10ms)
  let prevClass = '';
  if (btn) {
    triggerDopamineCheck(btn, event?.clientX, event?.clientY);
    prevClass = btn.className;
    const isDone = btn.classList.contains('bg-[#5F7465]');
    if (isDone) {
      btn.classList.remove('bg-[#5F7465]', 'text-white');
      btn.classList.add('border', 'border-[#5F7465]', 'bg-[#FFFDF9]', 'text-[#5F7465]');
    } else {
      btn.classList.remove('border', 'border-[#5F7465]', 'bg-[#FFFDF9]', 'text-[#5F7465]');
      btn.classList.add('bg-[#5F7465]', 'text-white');
    }
  }

  try {
    await toggleHabitLog(habitId, date);
  } catch (err) {
    if (btn && prevClass) btn.className = prevClass;
    showToast(err.message, 'error');
  } finally {
    setTimeout(() => {
      habitToggleLock.delete(lockKey);
    }, 280);
  }
}

async function toggleTodoWithFeedback(event, id) {
  if (todoToggleLock.has(id)) return;
  todoToggleLock.add(id);

  if (event && event.currentTarget) {
    triggerDopamineCheck(event.currentTarget, event?.clientX, event?.clientY);
  }
  triggerHaptic(30);
  playTickSound();

  try {
    await toggleTodo(id);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setTimeout(() => {
      todoToggleLock.delete(id);
    }, 280);
  }
}

// Vintage Skeleton Loading Placeholders
function renderHabitSkeletons() {
  const container = document.getElementById('habitListContainer');
  if (!container) return;
  container.innerHTML = [1, 2, 3].map(() => `
    <div class="p-4 sm:p-5 rounded-2xl bg-[#FFFDF9] border border-[#DECDB5]/70 shadow-xs flex flex-col md:flex-row gap-4 items-stretch justify-between">
      <div class="flex items-start gap-3.5 flex-1 min-w-0">
        <div class="w-10 h-10 rounded-2xl skeleton shrink-0"></div>
        <div class="space-y-2 flex-1 min-w-0">
          <div class="h-4 w-44 rounded-md skeleton"></div>
          <div class="h-3 w-28 rounded-full skeleton"></div>
          <div class="h-2 w-52 rounded-full skeleton"></div>
        </div>
      </div>
      <div class="w-full md:w-[260px] h-14 rounded-xl skeleton shrink-0"></div>
    </div>
  `).join('');
}

function renderNotesSkeletons() {
  const container = document.getElementById('notesGridContainer');
  if (!container) return;
  container.innerHTML = [1, 2, 3, 4].map(() => `
    <div class="p-4 rounded-2xl bg-[#FFFDF9] border border-[#DECDB5]/70 shadow-xs space-y-3">
      <div class="flex items-center justify-between">
        <div class="h-3.5 w-16 rounded-full skeleton"></div>
        <div class="h-3.5 w-12 rounded-md skeleton"></div>
      </div>
      <div class="h-4 w-3/4 rounded-md skeleton"></div>
      <div class="space-y-1.5">
        <div class="h-3 w-full rounded skeleton"></div>
        <div class="h-3 w-5/6 rounded skeleton"></div>
      </div>
      <div class="pt-2 border-t border-[#DECDB5]/40 flex justify-between">
        <div class="h-2.5 w-20 rounded skeleton"></div>
        <div class="h-2.5 w-14 rounded skeleton"></div>
      </div>
    </div>
  `).join('');
}

function renderTodoSkeletons() {
  const container = document.getElementById('todoListContainer');
  if (!container) return;
  container.innerHTML = [1, 2, 3, 4].map(() => `
    <div class="p-3.5 rounded-2xl bg-[#FFFDF9] border border-[#DECDB5]/70 shadow-xs flex items-start gap-3">
      <div class="w-5 h-5 rounded-full skeleton shrink-0 mt-0.5"></div>
      <div class="space-y-2 flex-1">
        <div class="h-4 w-2/3 rounded-md skeleton"></div>
        <div class="h-3 w-1/3 rounded-full skeleton"></div>
      </div>
    </div>
  `).join('');
}

let tabSwitchTransitionId = 0;


function switchNotebookSubTab(sub) {
  lifeState.notebookSubTab = sub;
  const jView = document.getElementById('notebookJournalView');
  const nView = document.getElementById('notebookNotesView');
  const jBtn = document.getElementById('subtabBtnJournal');
  const nBtn = document.getElementById('subtabBtnNotes');

  if (sub === 'journal') {
    if (jView) jView.classList.remove('hidden');
    if (nView) nView.classList.add('hidden');
    if (jBtn) jBtn.className = 'flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-[#FFFDF9] text-[#233329] shadow-2xs border border-[#DECDB5]/80';
    if (nBtn) nBtn.className = 'flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer text-[#786B60] hover:text-[#2B231D]';
    loadJournal(lifeState.currentJournalDate);
    loadJournalHistory();
  } else {
    if (jView) jView.classList.add('hidden');
    if (nView) nView.classList.remove('hidden');
    if (nBtn) nBtn.className = 'flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-[#FFFDF9] text-[#233329] shadow-2xs border border-[#DECDB5]/80';
    if (jBtn) jBtn.className = 'flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer text-[#786B60] hover:text-[#2B231D]';
    loadNotes();
  }
  if (window.lucide) lucide.createIcons();
}

function switchLifeTab(tabName) {
  // Support legacy routing for journal and notes
  if (tabName === 'journal' || tabName === 'notes') {
    lifeState.notebookSubTab = tabName;
    tabName = 'notebook';
  }

  const prevTab = lifeState.currentTab;

  // Reset scroll to top immediately on container and window
  const scrollArea = document.getElementById('mainScrollArea');
  if (scrollArea) scrollArea.scrollTop = 0;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  if (prevTab === tabName) {
    if (tabName === 'notebook') {
      switchNotebookSubTab(lifeState.notebookSubTab || 'journal');
    }
    return;
  }

  const currentTransitionId = ++tabSwitchTransitionId;
  lifeState.currentTab = tabName;

  // 5 standard unified tabs everywhere: Desktop & Mobile
  const tabs = ['dashboard', 'finance', 'todos', 'habits', 'notebook'];

  // Immediately spring slide navigation indicator pill on both desktop & mobile
  updateSlidingPills(tabName);

  // Update sidebar active classes immediately (keep z-10 and transparent background so sliding pill shows cleanly behind)
  tabs.forEach(t => {
    const btn = document.getElementById(`navTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      if (t === tabName) {
        btn.className = 'relative z-10 w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer text-[#FFFDF9] bg-transparent tap-spring';
      } else {
        btn.className = 'relative z-10 w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition cursor-pointer text-[#786B60] hover:text-[#2B231D] hover:bg-[#E7DEC8]/40 bg-transparent tap-spring';
      }
    }
  });

  // Update sidebar badge styling to match active/inactive pill background
  const dashBadge = document.getElementById('sidebarDashBadge');
  if (dashBadge) dashBadge.className = tabName === 'dashboard' ? 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/20 text-[#FFFDF9]' : 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#DECDB5] text-[#2B231D]';
  const todosBadge = document.getElementById('sidebarTodosBadge');
  if (todosBadge) todosBadge.className = tabName === 'todos' ? 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/20 text-[#FFFDF9]' : 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#DECDB5] text-[#2B231D]';
  const habitsBadge = document.getElementById('sidebarHabitsBadge');
  if (habitsBadge) habitsBadge.className = tabName === 'habits' ? 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/20 text-[#FFFDF9]' : 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#DECDB5] text-[#2B231D]';

  // Update mobile bottom navigation bar active button (keep z-10 and tap-spring)
  tabs.forEach(t => {
    const mBtn = document.getElementById(`mobileNav_${t}`);
    if (mBtn) {
      if (t === tabName) {
        mBtn.className = 'relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 text-[#233329] font-bold text-[10px] py-1.5 rounded-xl transition cursor-pointer tap-spring';
      } else {
        mBtn.className = 'relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 text-[#786B60] font-medium text-[10px] py-1.5 rounded-xl transition cursor-pointer tap-spring';
      }
    }
  });

  // Minimalist, crisp single-word header titles
  const titles = {
    dashboard: { title: 'Tổng quan', sub: '' },
    finance: { title: 'Tài chính', sub: '' },
    todos: { title: 'Việc cần làm', sub: '' },
    habits: { title: 'Thói quen', sub: '' },
    notebook: { title: 'Sổ tay', sub: '' }
  };

  const pTitle = document.getElementById('pageTitle');
  const pSub = document.getElementById('pageSubtitle');
  if (pTitle && titles[tabName]) pTitle.textContent = titles[tabName].title;
  if (pSub) pSub.textContent = '';

  // Toggle Header action button groups
  const ctrlGroups = ['Dashboard', 'Finance', 'Todos', 'Habits', 'Notebook'];
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

  // Pre-fetch active tab data with immediate skeleton fallback
  if (tabName === 'dashboard') {
    loadDashboard();
  } else if (tabName === 'todos') {
    if (!lifeState.todos || lifeState.todos.length === 0) renderTodoSkeletons();
    loadTodos();
    loadTodoStats();
  } else if (tabName === 'habits') {
    if (!lifeState.habits || lifeState.habits.length === 0) renderHabitSkeletons();
    loadHabits();
  } else if (tabName === 'notebook') {
    switchNotebookSubTab(lifeState.notebookSubTab || 'journal');
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

    // Reset scroll to top again on section mount
    const sa = document.getElementById('mainScrollArea');
    if (sa) sa.scrollTop = 0;
    window.scrollTo(0, 0);

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
        box.style.animationDelay = `${idx * 25}ms`;
      });

      const enterDuration = 260 + newBoxes.length * 25 + 30;
      setTimeout(() => {
        if (currentTransitionId !== tabSwitchTransitionId) return;
        newBoxes.forEach(box => {
          box.classList.remove('tab-box-enter');
          box.style.animationDelay = '';
        });
      }, enterDuration);
    }

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
      setTimeout(() => {
        if (currentTransitionId !== tabSwitchTransitionId) return;
        if (lifeState.todoStats) {
          renderTodoCharts(lifeState.todoStats);
        } else {
          loadTodoStats();
        }
      }, 50);
    } else if (tabName === 'finance') {
      setTimeout(() => {
        if (currentTransitionId !== tabSwitchTransitionId) return;
        if (typeof renderCategoryPieChart === 'function') renderCategoryPieChart();
        if (typeof renderActiveTrendChart === 'function') renderActiveTrendChart();
      }, 50);
    }

    if (window.lucide) lucide.createIcons();
    initAllCustomSelects();
    syncAllCustomSelects();
  };

  if (oldSec && !oldSec.classList.contains('hidden') && oldBoxes.length > 0) {
    oldBoxes.forEach((box, idx) => {
      box.classList.remove('tab-box-enter');
      box.classList.add('tab-box-exit');
      box.style.animationDelay = `${idx * 15}ms`;
    });

    const exitDuration = 120 + oldBoxes.length * 15;
    setTimeout(() => {
      if (currentTransitionId !== tabSwitchTransitionId) return;
      oldBoxes.forEach(box => {
        box.classList.remove('tab-box-exit');
        box.style.animationDelay = '';
      });
      showNewSection();
    updateSlidingPills(tabName);
    }, exitDuration);
  } else {
    showNewSection();
    updateSlidingPills(tabName);
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
  } else if (lifeState.currentTab === 'notebook' || lifeState.currentTab === 'journal' || lifeState.currentTab === 'notes') {
    if ((lifeState.notebookSubTab || 'journal') === 'journal') {
      loadJournal(lifeState.currentJournalDate);
      loadJournalHistory();
    } else {
      loadNotes();
    }
  }

  setTimeout(() => {
    if (icon && !silent) icon.classList.remove('animate-spin');
    if (!silent) {
      showToast('Đã làm mới dữ liệu từ ổ D:\\app\\finance', 'success');
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

  if (heroGreeting) heroGreeting.textContent = data.greeting || getClientGreeting();
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
    animateNumberValue(pulseBalance, data.finance.balance, 700, v => formatVND(v));
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

      const allTopTodos = data.todos.top_todos || [];
      const displayTodos = allTopTodos.slice(0, 3);
      const remainingTodosCount = allTopTodos.length - displayTodos.length;

      todoContainer.innerHTML = displayTodos.map(t => {
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
                  ${getCategoryBadgeHtml(t.category)}
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
      }).join('') + (remainingTodosCount > 0 ? `
        <button onclick="switchLifeTab('todos')" class="w-full text-center py-2 text-xs font-bold text-[#5F7465] hover:text-[#233329] hover:bg-[#F7F2E8] rounded-xl transition cursor-pointer border border-dashed border-[#DECDB5]/80">
          Xem thêm ${remainingTodosCount} việc còn lại →
        </button>
      ` : '');
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
      const allHabitItems = data.habits.items || [];
      const displayHabits = allHabitItems.slice(0, 4);
      const remainingHabitsCount = allHabitItems.length - displayHabits.length;

      habitContainer.innerHTML = displayHabits.map(h => {
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
      }).join('') + (remainingHabitsCount > 0 ? `
        <div class="col-span-full pt-1">
          <button onclick="switchLifeTab('habits')" class="w-full text-center py-2 text-xs font-bold text-[#5F7465] hover:text-[#233329] hover:bg-[#F7F2E8] rounded-xl transition cursor-pointer border border-dashed border-[#DECDB5]/80">
            Xem tất cả ${allHabitItems.length} thói quen →
          </button>
        </div>
      ` : '');
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
        const allRecentTx = data.finance.recent_transactions || [];
        const displayTx = allRecentTx.slice(0, 3);
        const remainingTxCount = allRecentTx.length - displayTx.length;

        recentList.innerHTML = displayTx.map(tx => {
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
        }).join('') + (remainingTxCount > 0 ? `
          <button onclick="switchLifeTab('finance')" class="w-full text-center py-1.5 text-xs font-bold text-[#5F7465] hover:text-[#233329] hover:bg-[#F7F2E8] rounded-xl transition cursor-pointer border border-dashed border-[#DECDB5]/80">
            Xem toàn bộ sổ giao dịch →
          </button>
        ` : '');
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
          <button onclick="switchLifeTab('notebook')" class="px-3 py-1.5 rounded-xl bg-[#5F7465] text-white text-xs font-bold hover:bg-[#4d5e52] transition cursor-pointer">
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

  // Velocity mode: Strictly Stacked as requested ("chỉ để bảng xếp chồng thôi")
  // Soft, muted pastel vintage tones so it doesn't clash with the adjacent Category chart
  const ctxVel = document.getElementById('todoVelocityChart');
  if (ctxVel) {
    const backlogData = stats.chart.backlog || [];
    const newData = stats.chart.new_tasks || stats.chart.created || [];
    const completedData = stats.chart.completed || [];

    if (todoCharts.velocity) {
      todoCharts.velocity.data.labels = stats.chart.labels;
      todoCharts.velocity.data.datasets[0].data = completedData;
      todoCharts.velocity.data.datasets[0].stack = 'completed';
      todoCharts.velocity.data.datasets[1].data = backlogData;
      todoCharts.velocity.data.datasets[1].stack = 'workload';
      todoCharts.velocity.data.datasets[2].data = newData;
      todoCharts.velocity.data.datasets[2].stack = 'workload';
      todoCharts.velocity.update('none');
    } else {
      todoCharts.velocity = new Chart(ctxVel.getContext('2d'), {
        type: 'bar',
        data: {
          labels: stats.chart.labels,
          datasets: [
            {
              label: 'Hoàn thành',
              data: completedData,
              backgroundColor: '#8FA896', // Muted Pastel Sage Green (cột 1 độc lập)
              borderRadius: 5,
              borderSkipped: false,
              barPercentage: 0.85,
              categoryPercentage: 0.72,
              stack: 'completed'
            },
            {
              label: 'Tồn đọng cũ',
              data: backlogData,
              backgroundColor: '#D89B88', // Muted Pastel Terracotta (cột 2: nằm ở dưới)
              borderRadius: 5,
              borderSkipped: false,
              borderWidth: 1.5,
              borderColor: '#FFFDF9',
              barPercentage: 0.85,
              categoryPercentage: 0.72,
              stack: 'workload'
            },
            {
              label: 'Mới trong ngày',
              data: newData,
              backgroundColor: '#E5C78A', // Muted Pastel Warm Wheat (cột 2: xếp chồng lên trên)
              borderRadius: 5,
              borderSkipped: false,
              borderWidth: 1.5,
              borderColor: '#FFFDF9',
              barPercentage: 0.85,
              categoryPercentage: 0.72,
              stack: 'workload'
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
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { family: 'inherit', size: 11, weight: '700' },
                color: '#2B231D',
                boxWidth: 12,
                usePointStyle: true,
                pointStyle: 'circle',
                padding: 14
              }
            },
            tooltip: {
              backgroundColor: '#233329',
              titleFont: { family: 'inherit', size: 12, weight: 'bold' },
              bodyFont: { family: 'inherit', size: 11 },
              padding: 10,
              cornerRadius: 12,
              boxPadding: 4,
              callbacks: {
                label: function(context) {
                  const label = context.dataset.label || '';
                  const val = context.parsed.y || 0;
                  return `  ${label}: ${val} việc`;
                },
                footer: function(items) {
                  let totalWorkload = 0;
                  let done = 0;
                  items.forEach(it => {
                    if (it.datasetIndex === 0) done += (it.parsed.y || 0);
                    if (it.datasetIndex === 1 || it.datasetIndex === 2) totalWorkload += (it.parsed.y || 0);
                  });
                  return `──────────────────────\n📌 Tổng việc: ${totalWorkload + done} việc | ✓ Đã xong: ${done}`;
                }
              }
            }
          },
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              ticks: { font: { family: 'inherit', size: 10, weight: '600' }, color: '#786B60' }
            },
            y: {
              stacked: true,
              grid: { color: 'rgba(222, 205, 181, 0.4)' },
              ticks: { stepSize: 1, precision: 0, font: { family: 'inherit', size: 10 }, color: '#786B60' }
            }
          }
        }
      });
    }
  }

  // 2. Category breakdown Donut Chart (Distinct Vintage Palette mapping)
  const ctxCat = document.getElementById('todoCategoryChart');
  if (ctxCat && stats.categories && stats.categories.length > 0) {
    const catColors = stats.categories.map(c => {
      const meta = VINTAGE_CATEGORY_PALETTE[c.category] || VINTAGE_CATEGORY_PALETTE['Khác'];
      return meta.chartColor;
    });

    if (todoCharts.category) {
      todoCharts.category.data.labels = stats.categories.map(c => c.category);
      todoCharts.category.data.datasets[0].data = stats.categories.map(c => c.count);
      todoCharts.category.data.datasets[0].backgroundColor = catColors;
      todoCharts.category.update('none');
    } else {
      todoCharts.category = new Chart(ctxCat.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: stats.categories.map(c => c.category),
        datasets: [{
          data: stats.categories.map(c => c.count),
          backgroundColor: catColors,
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
      <div ontouchstart="handleTodoTouchStart(event, ${t.id})" ontouchend="handleTodoTouchEnd(event, ${t.id})" 
           class="p-3 sm:p-3.5 rounded-2xl bg-[#FFFDF9] border border-[#DECDB5] hover:border-[#5F7465] transition shadow-2xs group space-y-2">
        <!-- Top Row: Checkbox, Title (full width), Edit & Delete Actions -->
        <div class="flex items-start justify-between gap-2.5">
          <div class="flex items-start gap-2.5 min-w-0 flex-1">
            <button onclick="toggleTodoWithFeedback(event, ${t.id})" class="min-w-[36px] min-h-[36px] -ml-1 -mt-1 flex items-center justify-center transition shrink-0 cursor-pointer" title="${isDone ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}">
              <span class="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 ${isDone ? 'bg-[#5F7465] border-[#5F7465] text-white' : 'border-[#DECDB5] hover:border-[#5F7465] bg-transparent'} flex items-center justify-center transition shrink-0 hover:scale-105 active:scale-95">
                ${isDone ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>' : ''}
              </span>
            </button>
            <div class="min-w-0 flex-1">
              <h4 class="font-bold text-xs sm:text-sm leading-snug ${isDone ? 'line-through text-[#A49688]' : 'text-[#2B231D]'} break-words">${escapeHtml(t.title)}</h4>
              ${t.description ? `<p class="text-[11px] sm:text-xs text-[#786B60] mt-0.5 line-clamp-2 leading-relaxed break-words">${escapeHtml(t.description)}</p>` : ''}
            </div>
          </div>

          <!-- Quick Action Buttons: Accessible on mobile -->
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
        <div class="flex items-center justify-between gap-2 flex-wrap pt-0.5 text-xs">
          <!-- Left: Clean Typographic Metadata -->
          <div class="flex items-center gap-1.5 flex-wrap text-[11px] text-[#786B60]">
            ${getCategoryBadgeHtml(t.category)}
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
            ${getCategoryBadgeHtml(t.category)} <span class="px-2 py-0.5 rounded-full border ${pri.bg} ${pri.text} ${pri.border} font-bold">${pri.label}</span>
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
  const isLocal = isLocalEnvironment();
  const todoItem = (lifeState.todos || []).find(t => t.id === id);

  try {
    const res = await fetch(`/api/todos/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Không thể cập nhật việc');
    const updated = await res.json();

    loadTodos();
    loadTodoStats();
    loadDashboard();

    if (isLocal && todoItem) {
      // Instant direct delta sync to Cloud Render (< 200ms)
      const cloudUrl = (lifeState.cloudRunUrl || 'https://life-hub-cv9l.onrender.com').trim().replace(/\/+$/, '');
      if (cloudUrl) {
        updateSyncStatusUI('syncing');
        fetch(`${cloudUrl}/api/sync/todo-toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: todoItem.title,
            due_date: todoItem.due_date,
            status: updated.status
          })
        }).then(() => {
          updateSyncStatusUI('synced');
        }).catch((err) => {
          console.warn('Delta todo sync warning:', err);
          updateSyncStatusUI('synced');
        });
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
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

  openAnimatedModal('todoModal');
  setTimeout(() => title?.focus(), 80);
}

function closeTodoModal() {
  closeAnimatedModal('todoModal');
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
  const todayStr = data.today_str || new Date().toISOString().split('T')[0];

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
  if (consistencyElem) animateNumberValue(consistencyElem, consistencyRate, 650, v => `${Math.round(v)}%`);

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
    // 1. Generate empty padding cells for 1st day offset in full month
    let paddingCells = '';
    for (let p = 0; p < firstWeekday; p++) {
      paddingCells += '<div class="h-6"></div>';
    }

    // 2. Generate Full Month Calendar Day Cells
    const daysCells = (h.month_days || []).map(ws => {
      const isDone = ws.completed;
      const isToday = ws.is_today;
      const isPast = ws.is_past;

      if (isToday) {
        return `
          <button onclick="toggleHabitLogWithFeedback(event, ${h.id}, '${ws.date}')" class="flex items-center justify-center rounded-lg ${isDone ? 'bg-[#5F7465] text-white shadow-2xs' : 'border border-[#5F7465] bg-[#FFFDF9] text-[#5F7465] hover:border-[#233329]'} cursor-pointer select-none h-6 text-[10px] font-bold transition" title="Hôm nay (${ws.day}): Bấm để ${isDone ? 'hủy' : 'tích hoàn thành'}">
            <span>${ws.day}</span>
            ${isDone ? '<i data-lucide="check" class="w-2.5 h-2.5 ml-0.5 stroke-[3]"></i>' : '<i data-lucide="plus" class="w-2.5 h-2.5 ml-0.5 opacity-70"></i>'}
          </button>
        `;
      } else if (isPast) {
        if (isDone) {
          return `
            <div class="flex items-center justify-center rounded-lg bg-[#5F7465] text-white shadow-2xs select-none transition h-6 text-[10px] font-bold" title="Ngày ${ws.day}: Đã hoàn thành">
              <span>${ws.day}</span>
            </div>
          `;
        } else {
          return `
            <div class="flex items-center justify-center rounded-lg bg-[#F7F2E8]/60 text-[#A49688] select-none h-6 text-[10px] font-medium" title="Ngày ${ws.day}: Chưa hoàn thành">
              <span>${ws.day}</span>
            </div>
          `;
        }
      } else {
        return `
          <div class="flex items-center justify-center rounded-lg bg-transparent text-[#DECDB5]/60 select-none h-6 text-[10px]">
            <span>${ws.day}</span>
          </div>
        `;
      }
    }).join('');

    // 3. Generate 7-Day Rolling Mini-Grid (Monday to Sunday of active week, or rolling 7 days)
    const monthDaysList = h.month_days || [];
    let weekDays = [];
    const todayIdx = monthDaysList.findIndex(d => d.is_today);
    if (todayIdx !== -1) {
      const todayObj = monthDaysList[todayIdx];
      const wd = typeof todayObj.weekday === 'number' ? todayObj.weekday : 0;
      const startIdx = todayIdx - wd;
      if (startIdx >= 0 && startIdx + 7 <= monthDaysList.length) {
        weekDays = monthDaysList.slice(startIdx, startIdx + 7);
      } else if (startIdx < 0) {
        weekDays = monthDaysList.slice(0, Math.min(7, monthDaysList.length));
      } else {
        weekDays = monthDaysList.slice(Math.max(0, monthDaysList.length - 7));
      }
    } else {
      weekDays = monthDaysList.slice(0, Math.min(7, monthDaysList.length));
    }

    const weekdayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const miniWeekStrip = weekDays.map((ws, wIdx) => {
      const isDone = ws.completed;
      const isToday = ws.is_today;
      const isPast = ws.is_past;
      const wdName = weekdayNames[ws.weekday !== undefined ? ws.weekday : (wIdx % 7)];

      if (isToday) {
        return `
          <button onclick="toggleHabitLogWithFeedback(event, ${h.id}, '${ws.date}')" 
               class="flex flex-col items-center justify-center py-1 px-0.5 rounded-xl ${isDone ? 'bg-[#5F7465] text-white shadow-2xs' : 'border-2 border-[#5F7465] bg-[#FFFDF9] text-[#5F7465]'} cursor-pointer transition select-none hover:scale-105 active:scale-95" 
               title="Hôm nay (${ws.day}): Bấm để ${isDone ? 'hủy' : 'hoàn thành'}">
            <span class="text-[8px] uppercase font-bold opacity-80">${wdName}</span>
            <span class="text-xs font-black mt-0.5">${ws.day}</span>
            <i data-lucide="${isDone ? 'check' : 'plus'}" class="w-3 h-3 mt-0.5 stroke-[2.5]"></i>
          </button>
        `;
      } else if (isPast) {
        if (isDone) {
          return `
            <div class="flex flex-col items-center justify-center py-1 px-0.5 rounded-xl bg-[#5F7465] text-white shadow-2xs select-none transition" 
                 title="Ngày ${ws.day}: Đã làm">
              <span class="text-[8px] uppercase font-bold opacity-80">${wdName}</span>
              <span class="text-xs font-bold mt-0.5">${ws.day}</span>
              <i data-lucide="check" class="w-3 h-3 mt-0.5 stroke-[2.5]"></i>
            </div>
          `;
        } else {
          return `
            <div class="flex flex-col items-center justify-center py-1 px-0.5 rounded-xl bg-[#F7F2E8] text-[#A49688] select-none border border-[#DECDB5]/60" 
                 title="Ngày ${ws.day}: Chưa làm">
              <span class="text-[8px] uppercase font-semibold">${wdName}</span>
              <span class="text-xs font-semibold mt-0.5">${ws.day}</span>
              <span class="w-1.5 h-1.5 rounded-full bg-[#DECDB5] mt-1"></span>
            </div>
          `;
        }
      } else {
        return `
          <div class="flex flex-col items-center justify-center py-1 px-0.5 rounded-xl bg-transparent text-[#DECDB5] select-none" 
               title="Ngày ${ws.day}">
            <span class="text-[8px] uppercase font-medium">${wdName}</span>
            <span class="text-xs font-medium mt-0.5">${ws.day}</span>
            <span class="w-1 h-1 rounded-full bg-[#DECDB5]/40 mt-1"></span>
          </div>
        `;
      }
    }).join('');

    const completedRate = Math.round(((h.month_completed_count || 0) / daysInMonth) * 100);

    return `
      <div class="p-4 sm:p-5 rounded-2xl bg-[#FFFDF9] border border-[#DECDB5] hover:border-[#5F7465] transition shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-4 sm:gap-6">
        <!-- Habit Metadata & Details: Generous room for titles -->
        <div class="flex items-start gap-3.5 sm:gap-4 flex-1 min-w-0">
          <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center bg-[#FDF3EE] border border-[#DECDB5] text-[#B14720] shrink-0 mt-0.5">
            <i data-lucide="${h.icon || 'sparkles'}" class="w-5 h-5"></i>
          </div>
          <div class="space-y-2 flex-1 min-w-0">
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

            <!-- Streak & Record Badges -->
            <div class="flex items-center gap-2 flex-wrap">
              <span class="inline-flex items-center gap-1 text-xs font-bold text-[#C3651F] bg-[#FDF6E2] px-2.5 py-0.5 rounded-full border border-[#DECDB5]">
                <i data-lucide="flame" class="w-3.5 h-3.5 fill-[#C3651F]"></i> ${h.streak} ngày liên tiếp
              </span>
              <span class="text-xs text-[#786B60]">Kỷ lục: ${h.best_streak} ngày</span>
            </div>

            <!-- Progress Bar -->
            <div class="space-y-1 pt-0.5 max-w-sm">
              <div class="flex items-center justify-between text-xs font-semibold text-[#5F7465]">
                <span class="flex items-center gap-1.5"><i data-lucide="calendar-check" class="w-3.5 h-3.5"></i> Tiến độ: <strong>${h.month_completed_count || 0} / ${daysInMonth}</strong> ngày</span>
                <span>${completedRate}%</span>
              </div>
              <div class="h-1.5 w-full bg-[#EFE7D8] rounded-full overflow-hidden border border-[#DECDB5]/60">
                <div class="h-full bg-[#5F7465] rounded-full transition-all duration-500" style="width: ${completedRate}%;"></div>
              </div>
            </div>

            <!-- Quick Today Check-in Button -->
            <div class="pt-0.5">
              ${h.completed_today ? `
                <button onclick="toggleHabitLogWithFeedback(event, ${h.id}, '${todayStr}')" class="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#5F7465] bg-[#F0F5F2] px-2.5 py-1 rounded-xl border border-[#D7E4DB] transition cursor-pointer">
                  <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Đã làm ✓
                </button>
              ` : `
                <button onclick="toggleHabitLogWithFeedback(event, ${h.id}, '${todayStr}')" class="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#786B60] hover:text-[#2B231D] bg-[#F7F2E8] hover:bg-[#EFE7D8] px-2.5 py-1 rounded-xl border border-[#DECDB5] transition cursor-pointer">
                  <i data-lucide="circle" class="w-3.5 h-3.5"></i> Check-in
                </button>
              `}
            </div>
          </div>
        </div>

        <!-- 7-Day Rolling Mini-Grid & Collapsible Monthly Calendar -->
        <div class="w-full md:w-[280px] lg:w-[300px] shrink-0 flex flex-col justify-between gap-2 self-start">
          <!-- Mini Grid Header -->
          <div class="flex items-center justify-between pb-0.5">
            <span class="text-[11px] font-bold text-[#626037] flex items-center gap-1">
              <i data-lucide="calendar" class="w-3.5 h-3.5 text-[#5F7465]"></i> 7 ngày gần nhất
            </span>
            <button onclick="toggleHabitMonthView(${h.id})" class="inline-flex items-center gap-1 text-[11px] font-bold text-[#5F7465] hover:text-[#233329] bg-[#EFE7D8] hover:bg-[#E2D6C0] px-2 py-0.5 rounded-lg border border-[#DECDB5] transition cursor-pointer">
              <span id="habitMonthToggleText_${h.id}">Lịch tháng</span>
              <i data-lucide="chevron-down" id="habitMonthChevron_${h.id}" class="w-3 h-3 transition-transform"></i>
            </button>
          </div>

          <!-- 7-Day Mini-Grid (Compact 1-row) -->
          <div class="grid grid-cols-7 gap-1 bg-[#F7F2E8] p-1.5 rounded-xl border border-[#DECDB5]">
            ${miniWeekStrip}
          </div>

          <!-- Expandable Full Month Calendar Grid (Hidden by default) -->
          <div id="habitMonthGrid_${h.id}" class="hidden bg-[#F7F2E8] p-2.5 rounded-xl border border-[#DECDB5] shadow-2xs space-y-1.5 mt-1">
            <div class="flex items-center justify-between text-[10px] font-bold text-[#626037] pb-1 border-b border-[#DECDB5]/60">
              <span>Toàn bộ tháng ${data.month_label}</span>
              <span class="text-[#5F7465]">${h.month_completed_count || 0}/${daysInMonth} ngày</span>
            </div>
            <div class="grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-[#786B60] uppercase tracking-wider">
              <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
            </div>
            <div class="grid grid-cols-7 gap-1">
              ${paddingCells}
              ${daysCells}
            </div>
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
    return; // Will be rendered when unhidden
  }

  const completed = chartData.completed || [];
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

  // Destroy previous chart so canvas dimensions always measure correctly on mobile
  if (habitCharts.area) {
    try {
      habitCharts.area.destroy();
    } catch (e) {}
    habitCharts.area = null;
  }

  const ctx = canvas.getContext('2d');
  const gradHeight = canvas.clientHeight || 180;
  const gradient = ctx.createLinearGradient(0, 0, 0, gradHeight);
  gradient.addColorStop(0, 'rgba(95, 116, 101, 0.42)'); // Top: soft vintage sage
  gradient.addColorStop(0.65, 'rgba(95, 116, 101, 0.12)');
  gradient.addColorStop(1, 'rgba(95, 116, 101, 0.01)');  // Bottom: transparent

  habitCharts.area = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'Số thói quen hoàn thành',
          data: completed,
          fill: true,
          backgroundColor: gradient,
          borderColor: '#5F7465',
          borderWidth: 2.5,
          tension: 0.35,
          pointBackgroundColor: '#FFFDF9',
          pointBorderColor: '#5F7465',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5.5,
          pointHoverBackgroundColor: '#5F7465',
          pointHoverBorderColor: '#FFFDF9',
          pointHoverBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 100,
      animation: {
        duration: 550,
        easing: 'easeOutQuart'
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
            maxTicksLimit: 15
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
  const isLocal = isLocalEnvironment();
  const habitObj = (lifeState.habits || []).find(h => h.id === habitId);
  const habitName = habitObj ? habitObj.name : '';

  try {
    const res = await fetch(`/api/habits/${habitId}/toggle?date=${date}`, { method: 'POST' });
    if (!res.ok) throw new Error('Không thể cập nhật thói quen');
    const resData = await res.json();

    loadHabits();
    loadDashboard();

    if (isLocal && habitName) {
      // Instant direct delta sync to Cloud Render (< 200ms)
      const cloudUrl = (lifeState.cloudRunUrl || 'https://life-hub-cv9l.onrender.com').trim().replace(/\/+$/, '');
      if (cloudUrl) {
        updateSyncStatusUI('syncing');
        fetch(`${cloudUrl}/api/sync/habit-toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            habit_name: habitName,
            date: date,
            status: resData.is_done ? 1 : 0
          })
        }).then(() => {
          updateSyncStatusUI('synced');
        }).catch((err) => {
          console.warn('Delta sync warning:', err);
          updateSyncStatusUI('synced');
        });
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
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
    <div class="p-3.5 sm:p-4 rounded-2xl bg-[#FFFDF9] border ${n.is_pinned ? 'border-[#D39526]' : 'border-[#DECDB5]'} hover:border-[#5F7465] transition shadow-xs flex flex-col justify-between space-y-2.5 sm:space-y-3 group">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EFE7D8] text-[#626037] border border-[#DECDB5]">${escapeHtml(n.category)}</span>
          <div class="flex items-center gap-1">
            <button onclick="copyNoteContent(${n.id})" class="p-1.5 rounded-lg text-[#786B60] hover:text-[#5F7465] hover:bg-[#F0F5F2] transition cursor-pointer" title="Sao chép nội dung">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="togglePinNote(${n.id})" class="p-1.5 rounded-lg text-[#786B60] hover:text-[#D39526] hover:bg-[#FDF6E2] transition cursor-pointer" title="${n.is_pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}">
              <i data-lucide="pin" class="w-3.5 h-3.5 ${n.is_pinned ? 'fill-[#D39526] text-[#D39526]' : ''}"></i>
            </button>
            <button onclick="deleteNote(${n.id})" class="p-1.5 rounded-lg text-[#A49688] hover:text-[#B14720] hover:bg-[#FDF3EE] transition md:opacity-0 md:group-hover:opacity-100 cursor-pointer" title="Xóa ghi chú">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
        <h4 class="font-bold text-sm sm:text-base text-[#2B231D] tracking-tight hover:text-[#5F7465] cursor-pointer" onclick="openNoteModal(${n.id})">${escapeHtml(n.title)}</h4>
        <p class="text-xs text-[#786B60] whitespace-pre-line line-clamp-3 leading-relaxed">${escapeHtml(n.content)}</p>
      </div>

      <div class="pt-2 border-t border-[#DECDB5]/40 flex items-center justify-between text-[11px] text-[#A49688]">
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

  openAnimatedModal('todoModal');
  setTimeout(() => title?.focus(), 80);
}

function closeNoteModal() {
  closeAnimatedModal('noteModal');
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
  triggerHaptic(25);
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
  openAnimatedModal('mobileConnectModal');

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
  closeAnimatedModal('mobileConnectModal');
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
  const icon = document.getElementById('liveSyncCloudIcon');
  const container = document.getElementById('liveSyncStatus');
  if (!dot) return;

  if (status === 'syncing') {
    dot.className = 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 animate-ping ring-1 ring-white';
    if (icon) icon.className = 'w-4 h-4 text-amber-600 animate-pulse';
    if (container) container.title = 'Đang đồng bộ dữ liệu thời gian thực...';
  } else if (status === 'synced') {
    dot.className = 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 transition-colors ring-1 ring-white';
    if (icon) icon.className = 'w-4 h-4 text-[#5F7465] transition-colors';
    if (container) container.title = 'Đồng bộ thời gian thực: Đã cập nhật';
  } else if (status === 'error') {
    dot.className = 'absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-1 ring-white';
    if (icon) icon.className = 'w-4 h-4 text-rose-500';
    if (container) container.title = 'Lỗi kết nối đồng bộ';
  }
}

async function autoCloudSync(silent = true, isBackgroundPoll = false) {
  const isLocal = isLocalEnvironment();
  if (isSyncing) return;
  if (!isLocal) {
    // On Mobile: pull directly from GitHub Gist via Cloud endpoint
    try {
      const res = await fetch('/api/sync/restore-gist', { method: 'POST' });
      if (res.ok) {
        if (!silent) showToast('Đã đồng bộ từ Cloud Gist!', 'success');
        reloadActiveTabData(true);
      }
    } catch (e) {}
    return;
  }

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

// ================= REALTIME WEBSOCKET SYNC CLIENT =================
let realtimeWs = null;
let wsReconnectTimeout = null;
let wsReconnectDelay = 1500;

function getRealtimeWsUrl() {
  const isLocal = isLocalEnvironment();
  if (isLocal) {
    const cloudSetting = (lifeState.cloudRunUrl || 'https://life-hub-cv9l.onrender.com').trim().replace(/\/+$/, '');
    const wsProto = cloudSetting.startsWith('https:') ? 'wss://' : 'ws://';
    const hostPart = cloudSetting.replace(/^https?:\/\//, '');
    return `${wsProto}${hostPart}/ws/sync`;
  } else {
    const wsProto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    return `${wsProto}${location.host}/ws/sync`;
  }
}

function initRealtimeSync() {
  if (realtimeWs && (realtimeWs.readyState === WebSocket.OPEN || realtimeWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const wsUrl = getRealtimeWsUrl();
  try {
    realtimeWs = new WebSocket(wsUrl);

    realtimeWs.onopen = () => {
      console.log('⚡ [Realtime Sync] Connected to:', wsUrl);
      wsReconnectDelay = 1500;
      updateSyncStatusUI('synced');
    };

    realtimeWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'data_changed') {
          console.log('⚡ [Realtime Sync] Event received:', msg);
          const isLocal = isLocalEnvironment();
          if (isLocal) {
            if (msg.source === 'cloud_sync' || msg.source === 'cloud_pull') {
              reloadActiveTabData(true);
            } else {
              pullFromCloudSilently();
            }
          } else {
            reloadActiveTabData(true);
          }
        }
      } catch (e) {
        console.debug('WS parse error:', e);
      }
    };

    realtimeWs.onclose = () => {
      if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
      wsReconnectTimeout = setTimeout(initRealtimeSync, wsReconnectDelay);
      wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, 10000);
    };

    realtimeWs.onerror = () => {
      try { realtimeWs.close(); } catch (e) {}
    };
  } catch (err) {
    console.debug('WebSocket connection failed:', err);
  }
}


let isPullingFromCloud = false;
async function pullFromCloudSilently() {
  if (isPullingFromCloud) return;
  isPullingFromCloud = true;
  try {
    const res = await fetch('/api/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (res.ok) {
      const data = await res.json();
      const badge = document.getElementById('syncLastTimeBadge');
      if (badge && data.last_synced) badge.textContent = `Đã đồng bộ: ${data.last_synced}`;
      reloadActiveTabData(true);
      console.log('⚡ [Realtime Sync] Desktop pulled latest data from cloud successfully');
    }
  } catch (err) {
    console.debug('Silent cloud pull error:', err);
  } finally {
    isPullingFromCloud = false;
  }
}

window.scheduleAutoSync = function(delayMs = 80) {
  const isLocal = isLocalEnvironment();
  if (!isLocal) {
    // On Mobile: notify Cloud that user performed an action
    try {
      if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
        realtimeWs.send(JSON.stringify({ action: "notify", event: "data_changed", source: "mobile" }));
      } else {
        fetch('/api/sync/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'data_changed', source: 'mobile' })
        }).catch(() => {});
      }
    } catch (e) {}
    return;
  }
  updateSyncStatusUI('syncing');
  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(() => {
    autoCloudSync(true, false); // Local mutation push
  }, delayMs);
};

document.addEventListener('DOMContentLoaded', () => {
  initRippleEffects();
  initAllCustomSelects();
  setTimeout(() => updateSlidingPills(lifeState.currentTab || 'dashboard'), 100);
  // Handle direct tab deep-linking via hash or query param (e.g. ?tab=habits or #habits)
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || window.location.hash.replace('#', '');
  if (initialTab && ['dashboard', 'finance', 'todos', 'habits', 'journal', 'notes', 'notebook'].includes(initialTab)) {
    setTimeout(() => { switchLifeTab(initialTab); }, 50);
  }

  // Initial sync immediately after UI boot (500ms)
  setTimeout(() => { autoCloudSync(true, true); }, 500);

  // Event-Driven Realtime Sync: Connected via WebSockets (No periodic intervals!)
  setTimeout(() => {
    initRealtimeSync();
  }, 200);

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


// =========================================================================
// UNIVERSAL MODERN VINTAGE CUSTOM DROPDOWN ENGINE (100% Rounded & Soft Elevation)
// =========================================================================
function enhanceSelectElement(selectEl) {
  if (!selectEl || selectEl.dataset.customEnhanced === 'true') return;
  if (!selectEl.parentNode) return;

  const isFullWidth = selectEl.classList.contains('w-full') || 
                      selectEl.style.width === '100%' || 
                      (selectEl.parentElement && selectEl.parentElement.classList.contains('w-full'));

  // Container
  const wrapper = document.createElement('div');
  wrapper.className = `custom-dropdown-container ${isFullWidth ? 'w-full' : ''}`;
  wrapper.dataset.targetId = selectEl.id || '';

  // Trigger
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `custom-dropdown-trigger ${isFullWidth ? 'w-full' : ''}`;
  
  const labelSpan = document.createElement('span');
  labelSpan.className = 'custom-dropdown-label flex items-center gap-1.5 truncate text-left';
  
  const chevron = document.createElement('span');
  chevron.className = 'shrink-0 text-[#A49688] transition-transform duration-200 pointer-events-none';
  chevron.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

  trigger.appendChild(labelSpan);
  trigger.appendChild(chevron);

  // Popup Menu
  const menu = document.createElement('div');
  menu.className = 'custom-dropdown-menu hidden';
  if (isFullWidth) menu.style.minWidth = '100%';

  function getOptionFormattedHtml(opt) {
    const text = (opt.text || opt.textContent || '').trim();
    const val = opt.value;
    if (text.includes('🔴') || val === 'urgent') {
      return `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#B14720] shrink-0"></span> <span>${escapeHtml(text.replace(/[🔴🟢🟡🟠⚪🟣]/g, '').trim())}</span></span>`;
    } else if (text.includes('🟡') || text.includes('🟠') || val === 'high') {
      return `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#D39526] shrink-0"></span> <span>${escapeHtml(text.replace(/[🔴🟢🟡🟠⚪🟣]/g, '').trim())}</span></span>`;
    } else if (text.includes('🟢') || val === 'normal') {
      return `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#5F7465] shrink-0"></span> <span>${escapeHtml(text.replace(/[🔴🟢🟡🟠⚪🟣]/g, '').trim())}</span></span>`;
    } else if (text.includes('⚪') || text.includes('🟣') || val === 'low') {
      return `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#A49688] shrink-0"></span> <span>${escapeHtml(text.replace(/[🔴🟢🟡🟠⚪🟣]/g, '').trim())}</span></span>`;
    } else if (typeof VINTAGE_CATEGORY_PALETTE !== 'undefined' && VINTAGE_CATEGORY_PALETTE[text]) {
      const meta = VINTAGE_CATEGORY_PALETTE[text];
      return `<span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${meta.chartColor};"></span> <span>${escapeHtml(text)}</span></span>`;
    }
    return `<span>${escapeHtml(text)}</span>`;
  }

  function renderOptions() {
    menu.innerHTML = '';
    const options = Array.from(selectEl.options);
    const selectedVal = selectEl.value;
    let selectedOpt = null;

    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'custom-dropdown-item';
      const isSelected = opt.value === selectedVal || (!selectedVal && opt === options[0]);
      if (isSelected) {
        item.classList.add('selected');
        selectedOpt = opt;
      }

      const formattedHtml = getOptionFormattedHtml(opt);
      item.innerHTML = `<span>${formattedHtml}</span>${isSelected ? '<span class="text-xs text-[#5F7465] font-bold">✓</span>' : ''}`;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectEl.value = opt.value;
        labelSpan.innerHTML = formattedHtml;
        closeAllCustomDropdowns();
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof selectEl.onchange === 'function') {
          selectEl.onchange();
        }
        renderOptions();
      });

      menu.appendChild(item);
    });

    if (!selectedOpt && options.length > 0) {
      selectedOpt = options[0];
    }
    if (selectedOpt) {
      labelSpan.innerHTML = getOptionFormattedHtml(selectedOpt);
    }
  }

  wrapper._renderOptions = renderOptions;
  renderOptions();

  // Watch for dynamic changes to <option> elements inside selectEl
  try {
    const optObserver = new MutationObserver(() => {
      renderOptions();
    });
    optObserver.observe(selectEl, { childList: true, subtree: true, characterData: true });
  } catch (e) {}

  // Intercept selectEl.value setter so programmatic changes immediately update UI
  try {
    const valDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (valDescriptor && !selectEl._valueIntercepted) {
      selectEl._valueIntercepted = true;
      Object.defineProperty(selectEl, 'value', {
        get() {
          return valDescriptor.get.call(this);
        },
        set(newVal) {
          valDescriptor.set.call(this, newVal);
          renderOptions();
        },
        configurable: true
      });
    }
  } catch (e) {}

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = menu.classList.contains('hidden');
    closeAllCustomDropdowns();
    if (isHidden) {
      renderOptions();
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 220 && rect.top > 220) {
        menu.classList.add('open-up');
      } else {
        menu.classList.remove('open-up');
      }
      if (rect.left + 220 > window.innerWidth) {
        menu.classList.add('align-right');
      } else {
        menu.classList.remove('align-right');
      }
      menu.classList.remove('hidden');
      trigger.classList.add('active');
      chevron.style.transform = 'rotate(180deg)';
    }
  });

  // Insert wrapper before selectEl and move selectEl inside wrapper
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  wrapper.appendChild(selectEl);

  // Visually hide native select but preserve form & event functionality
  selectEl.style.position = 'absolute';
  selectEl.style.width = '0';
  selectEl.style.height = '0';
  selectEl.style.opacity = '0';
  selectEl.style.pointerEvents = 'none';
  selectEl.style.margin = '0';
  selectEl.style.padding = '0';
  selectEl.style.border = 'none';
  selectEl.tabIndex = -1;

  selectEl.dataset.customEnhanced = 'true';
}

function closeAllCustomDropdowns() {
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.custom-dropdown-trigger').forEach(t => {
    t.classList.remove('active');
    const chev = t.querySelector('span:last-child');
    if (chev) chev.style.transform = 'rotate(0deg)';
  });
}

function syncCustomDropdown(selectIdOrEl) {
  const el = typeof selectIdOrEl === 'string' ? document.getElementById(selectIdOrEl) : selectIdOrEl;
  if (!el) return;
  const wrapper = el.closest('.custom-dropdown-container');
  if (!wrapper) {
    enhanceSelectElement(el);
    return;
  }
  if (typeof wrapper._renderOptions === 'function') {
    wrapper._renderOptions();
  }
}

function syncAllCustomSelects() {
  document.querySelectorAll('select').forEach(s => {
    if (s.dataset.customEnhanced === 'true') {
      syncCustomDropdown(s);
    } else {
      enhanceSelectElement(s);
    }
  });
}

function initAllCustomSelects() {
  document.querySelectorAll('select:not([data-custom-enhanced="true"])').forEach(s => enhanceSelectElement(s));
}

// Global dismiss on click outside or escape
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown-container')) {
    closeAllCustomDropdowns();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllCustomDropdowns();
});

// Auto-run custom dropdowns on immediate script load and DOM lifecycle
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllCustomSelects);
} else {
  initAllCustomSelects();
}
window.addEventListener('load', initAllCustomSelects);

// Observer for dynamically added selects
try {
  let _selectObserverTimer = null;
  const _selectObserver = new MutationObserver(() => {
    if (_selectObserverTimer) clearTimeout(_selectObserverTimer);
    _selectObserverTimer = setTimeout(() => {
      initAllCustomSelects();
    }, 60);
  });
  if (document.body) {
    _selectObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      _selectObserver.observe(document.body, { childList: true, subtree: true });
    });
  }
} catch (e) {
  // Graceful fallback
}
