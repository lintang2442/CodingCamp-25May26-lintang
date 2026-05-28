// ===== State =====
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let spendingLimit = parseFloat(localStorage.getItem('spendingLimit')) || 0;
let chart = null;

const CATEGORY_COLORS = {
    Food:          '#f97316',
    Transport:     '#3b82f6',
    Shopping:      '#ec4899',
    Entertainment: '#8b5cf6',
    Health:        '#10b981',
    Education:     '#06b6d4',
    Salary:        '#22c55e',
    Other:         '#94a3b8',
};

// ===== DOM References =====
const form            = document.getElementById('transactionForm');
const itemNameInput   = document.getElementById('itemName');
const amountInput     = document.getElementById('amount');
const typeInput       = document.getElementById('type');
const categoryInput   = document.getElementById('category');
const limitInput      = document.getElementById('spendingLimit');
const sortSelect      = document.getElementById('sortBy');
const transactionList = document.getElementById('transactionList');
const emptyState      = document.getElementById('emptyState');
const limitWarning    = document.getElementById('limitWarning');
const themeToggle     = document.getElementById('themeToggle');
const themeIcon       = document.getElementById('themeIcon');
const chartEmpty      = document.getElementById('chartEmpty');

// ===== Init =====
function init() {
    // Restore theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeIcon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

    // Restore spending limit
    if (spendingLimit > 0) limitInput.value = spendingLimit;

    render();
}

// ===== Save to LocalStorage =====
function save() {
    localStorage.setItem('transactions', JSON.stringify(transactions));
}

// ===== Add Transaction =====
form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name     = itemNameInput.value.trim();
    const amount = parseFloat(amountInput.value.replace(/\./g, '').replace(',', '.'));
    const type     = typeInput.value;
    const category = categoryInput.value;
    const limit    = parseFloat(limitInput.value) || 0;

    if (!name || isNaN(amount) || amount <= 0) return;

    // Save spending limit
    if (limit > 0) {
        spendingLimit = limit;
        localStorage.setItem('spendingLimit', limit);
    }

    const transaction = {
        id: Date.now(),
        name,
        amount,
        type,
        category,
        date: new Date().toISOString(),
    };

    transactions.unshift(transaction);
    save();
    render();

    // Reset form (keep limit)
    itemNameInput.value = '';
    amountInput.value   = '';
    typeInput.value     = 'expense';
    categoryInput.value = 'Food';
});

// ===== Delete Transaction =====
function deleteTransaction(id) {
    transactions = transactions.filter(t => t.id !== id);
    save();
    render();
}

// ===== Sort Transactions =====
function getSorted() {
    const sorted = [...transactions];
    const by = sortSelect.value;

    if (by === 'amount') {
        sorted.sort((a, b) => b.amount - a.amount);
    } else if (by === 'category') {
        sorted.sort((a, b) => a.category.localeCompare(b.category));
    } else {
        // date (default — already newest first)
        sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return sorted;
}

sortSelect.addEventListener('change', render);

// ===== Render All =====
function render() {
    renderBalance();
    renderTransactions();
    renderChart();
    renderMonthlySummary();
    checkSpendingLimit();
}

// ===== Render Balance =====
function renderBalance() {
    let income  = 0;
    let expense = 0;

    transactions.forEach(t => {
        if (t.type === 'income')  income  += t.amount;
        if (t.type === 'expense') expense += t.amount;
    });

    const balance = income - expense;

    document.getElementById('totalBalance').textContent = formatCurrency(balance);
    document.getElementById('totalIncome').textContent  = formatCurrency(income);
    document.getElementById('totalExpense').textContent = formatCurrency(expense);

    // Color balance
    const balanceEl = document.getElementById('totalBalance');
    balanceEl.style.color = balance < 0 ? '#fca5a5' : '#fff';
}

// ===== Render Transactions =====
function renderTransactions() {
    const sorted = getSorted();

    // Clear existing items (keep empty state)
    const items = transactionList.querySelectorAll('.transaction-item');
    items.forEach(el => el.remove());

    if (sorted.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    sorted.forEach(t => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.innerHTML = `
            <div class="transaction-info">
                <span class="transaction-name">${escapeHtml(t.name)}</span>
                <div class="transaction-meta">
                    <span class="transaction-category">${t.category}</span>
                    <span class="transaction-date">${formatDate(t.date)}</span>
                </div>
            </div>
            <div class="transaction-right">
                <span class="transaction-amount ${t.type}">
                    ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                </span>
                <button class="btn-delete" onclick="deleteTransaction(${t.id})">Delete</button>
            </div>
        `;
        transactionList.appendChild(item);
    });
}

// ===== Render Chart =====
function renderChart() {
    const expenses = transactions.filter(t => t.type === 'expense');

    // Group by category
    const categoryTotals = {};
    expenses.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    const labels  = Object.keys(categoryTotals);
    const data    = Object.values(categoryTotals);
    const colors  = labels.map(l => CATEGORY_COLORS[l] || '#94a3b8');

    const canvas = document.getElementById('spendingChart');
    const legendEl = document.getElementById('chartLegend');

    if (labels.length === 0) {
        canvas.classList.add('hidden');
        chartEmpty.classList.remove('hidden');
        legendEl.innerHTML = '';
        if (chart) { chart.destroy(); chart = null; }
        return;
    }

    canvas.classList.remove('hidden');
    chartEmpty.classList.add('hidden');

    if (chart) chart.destroy();

    chart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: getComputedStyle(document.documentElement)
                    .getPropertyValue('--bg-card').trim() || '#16213e',
            }]
        },
        options: {
            responsive: true,
            cutout: '60%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.raw)}`
                    }
                }
            }
        }
    });

    // Custom legend
    legendEl.innerHTML = labels.map((label, i) => `
        <div class="legend-item">
            <span class="legend-dot" style="background:${colors[i]}"></span>
            <span>${label}</span>
        </div>
    `).join('');
}

// ===== Monthly Summary =====
function renderMonthlySummary() {
    const summaryEl = document.getElementById('monthlySummary');
    const expenses  = transactions.filter(t => t.type === 'expense');

    if (expenses.length === 0) {
        summaryEl.innerHTML = '<p class="empty-text">No data available</p>';
        return;
    }

    // Group by month
    const monthTotals = {};
    expenses.forEach(t => {
        const key = new Date(t.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
        monthTotals[key] = (monthTotals[key] || 0) + t.amount;
    });

    summaryEl.innerHTML = Object.entries(monthTotals)
        .sort((a, b) => new Date(b[0]) - new Date(a[0]))
        .map(([month, total]) => `
            <div class="month-row">
                <span class="month-name">📅 ${month}</span>
                <span class="month-amount">${formatCurrency(total)}</span>
            </div>
        `).join('');
}

// ===== Spending Limit Check =====
function checkSpendingLimit() {
    if (!spendingLimit || spendingLimit <= 0) {
        limitWarning.classList.add('hidden');
        return;
    }

    const totalExpense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    if (totalExpense > spendingLimit) {
        limitWarning.classList.remove('hidden');
    } else {
        limitWarning.classList.add('hidden');
    }
}

// ===== Theme Toggle =====
themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    themeIcon.textContent = next === 'dark' ? '🌙' : '☀️';
    localStorage.setItem('theme', next);
    renderChart(); // re-render chart with new border color
});

// ===== Helpers =====
function formatCurrency(amount) {
    return 'Rp ' + new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// ===== Start =====
init();
