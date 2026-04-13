import { UI } from './ui-utils';
import { Store } from './store';
import { API } from './api';
import type { Record as BudgetRecord, CategoryMap } from './types';

export const Renderers = {
    renderList(records: BudgetRecord[], cats: CategoryMap, incomeCats: CategoryMap, onDelete: () => void, filterCategoryId: string | null = null) {
        const el = document.getElementById('expense-list');
        if (!el) return;
        
        let displayRecords = records;
        if (filterCategoryId && filterCategoryId !== 'all') {
            displayRecords = records.filter(r => r.categoryId === filterCategoryId);
        }

        if (displayRecords.length === 0) {
            el.innerHTML = `
                <div class="panel-card" style="text-align:center; padding: 48px; border-style: dashed; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);">
                    <div style="font-size: 32px; margin-bottom: 12px; color: var(--muted);">◈</div>
                    <p style="color: var(--muted); font-size: 14px;">No records found${filterCategoryId ? ' for this category' : ''}.</p>
                </div>`;
            return;
        }

        el.innerHTML = displayRecords.map(r => {
            const isIncome = r.type === 'income';
            const fallback = isIncome
                ? Object.values(incomeCats).find(c => c.label.toLowerCase().startsWith('other')) || { emoji: '⊞', label: 'Other Income', color: '#64748b' }
                : Object.values(cats).find(c => c.label.toLowerCase().startsWith('other')) || { emoji: '📦', label: 'Other', color: '#64748b' };
            const cat = isIncome ? (incomeCats[r.categoryId] || fallback) : (cats[r.categoryId] || fallback);
            const [y, m, d] = r.date.split('-');
            const ds = `${d}/${m}`;
            const locH = !isIncome && r.location ? `<span class="location-tag">📍 ${UI.esc(r.location)}</span>` : '';
            const amtPrefix = isIncome ? '+' : '';
            const amtColor = isIncome ? 'var(--accent)' : 'var(--text)';
            
            return `
                <div class="expense-item">
                    <div class="cat-icon clickable-cat" title="Filter by ${cat.label}" data-id="${r.categoryId}" style="background: ${cat.color}20; color: ${cat.color}">${cat.emoji}</div>
                    <div class="expense-info">
                        <div class="expense-name">${UI.esc(r.name)}</div>
                        <div class="expense-meta"><span class="tag clickable-cat" data-id="${r.categoryId}">${cat.label}</span>${locH}</div>
                    </div>
                    <div style="text-align:right">
                        <div class="expense-amount" style="color: ${amtColor}">${amtPrefix}€${parseFloat(r.amount as any).toFixed(2)}</div>
                        <div class="expense-date-col">${ds}</div>
                        <button class="delete-btn" title="Delete" data-id="${r.id}">✕</button>
                    </div>
                </div>`;
        }).join('');

        el.querySelectorAll('.delete-btn').forEach(btn => {
            (btn as HTMLElement).onclick = async (e) => {
                e.stopPropagation();
                if (confirm('Delete this record?')) {
                    await API.deleteRecord((btn as HTMLElement).dataset.id!);
                    UI.showToast('Record removed');
                    onDelete();
                }
            };
        });

        el.querySelectorAll('.clickable-cat').forEach(btn => {
            (btn as HTMLElement).onclick = () => {
                const id = (btn as HTMLElement).dataset.id!;
                const pills = document.querySelectorAll('.filter-pill');
                pills.forEach(p => {
                    const isActive = (p as HTMLElement).dataset.cat === id;
                    p.classList.toggle('active', isActive);
                    if (isActive) p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                });
                Renderers.renderList(records, cats, incomeCats, onDelete, id);
            };
        });
    },

    renderFilters(records: BudgetRecord[], cats: CategoryMap, incomeCats: CategoryMap, onFilter: (catId: string | null) => void) {
        const el = document.querySelector('.filter-pills');
        if (!el) return;

        const usedCatIds = [...new Set(records.map(r => r.categoryId))];
        const allCats = { ...cats, ...incomeCats };
        
        const categories = usedCatIds.map(id => ({ id, ...allCats[id] })).filter(c => c.label);

        if (categories.length < 2) {
            el.innerHTML = ''; // Hide filters if only one category exists
            return;
        }

        el.innerHTML = `
            <span class="filter-pill active" data-cat="all">All</span>
            ${categories.map(c => `
                <span class="filter-pill" data-cat="${c.id}" title="${c.label}">${c.emoji}</span>
            `).join('')}
        `;

        el.querySelectorAll('.filter-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                const id = (e.currentTarget as HTMLElement).dataset.cat || 'all';
                el.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p === e.currentTarget));
                onFilter(id === 'all' ? null : id);
            });
        });
    },

    renderCategoryBars(records: BudgetRecord[], cats: CategoryMap) {
        const el = document.getElementById('cat-bars');
        if (!el) return;

        const expenses = records.filter(r => r.type === 'expense');
        const totals = expenses.reduce<Record<string, number>>((acc, record) => {
            acc[record.categoryId] = (acc[record.categoryId] || 0) + record.amount;
            return acc;
        }, {});

        const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) {
            el.innerHTML = `
                <div class="empty-state">
                    <div class="empty-mark">◌</div>
                    <p>No expense categories for this period yet.</p>
                </div>`;
            return;
        }

        const max = Math.max(...entries.map(([, amount]) => amount), 1);
        el.innerHTML = entries.map(([categoryId, amount]) => {
            const fallback = Object.values(cats).find(c => c.label.toLowerCase().startsWith('other')) || { emoji: '📦', label: 'Other', color: '#64748b' };
            const cat = cats[categoryId] || fallback;
            const pct = Math.max((amount / max) * 100, 4);

            return `
                <div class="cat-bar-item">
                    <div class="cat-bar-info">
                        <div class="cat-bar-name"><span>${cat.emoji}</span>${UI.esc(cat.label)}</div>
                        <div class="cat-bar-amt">€${amount.toFixed(2)}</div>
                    </div>
                    <div class="cat-bar-track">
                        <div class="cat-bar-fill" style="width: ${pct}%; background: ${cat.color}"></div>
                    </div>
                </div>`;
        }).join('');
    },

    renderStats(records: BudgetRecord[], view: string, currentMonth: number, currentYear: number) {
        const expenses = records.filter(r => r.type === 'expense');
        const incomes = records.filter(r => r.type === 'income');

        const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
        const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
        const remaining = totalIncome - totalSpent;

        const totalEl = document.getElementById('stat-total');
        const labelTotal = document.getElementById('label-total');
        const remainingEl = document.getElementById('stat-remaining');
        const cardTotal = document.getElementById('card-total');
        const cardRemaining = document.getElementById('card-remaining');
        const cardAvg = document.getElementById('card-avg');
        const cardTop = document.getElementById('card-top');
        const avgEl = document.getElementById('stat-avg');
        const avgSubEl = document.getElementById('stat-avg-sub');

        if (cardTotal) cardTotal.classList.remove('stat-red', 'stat-blue');
        if (cardRemaining) cardRemaining.classList.remove('stat-red', 'stat-blue');

        if (view === 'income') {
            if (labelTotal) labelTotal.textContent = 'Total Income';
            if (totalEl) totalEl.textContent = `€${totalIncome.toFixed(2)}`;
            if (cardTotal) cardTotal.classList.add('stat-blue');
            if (cardAvg) (cardAvg as HTMLElement).style.display = 'none';
            if (cardTop) (cardTop as HTMLElement).style.display = 'none';
        } else {
            if (labelTotal) labelTotal.textContent = 'Total Spent';
            if (totalEl) totalEl.textContent = `€${totalSpent.toFixed(2)}`;
            if (cardTotal) cardTotal.classList.add('stat-red');
            if (cardAvg) (cardAvg as HTMLElement).style.display = 'grid';
            if (cardTop) (cardTop as HTMLElement).style.display = 'grid';
        }

        if (remainingEl) {
            remainingEl.textContent = `€${remaining.toFixed(2)}`;
            if (cardRemaining) {
                cardRemaining.classList.add(remaining < 0 ? 'stat-red' : 'stat-blue');
            }
        }

        const dInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const today = new Date();
        const daysElapsed = (currentYear === today.getFullYear() && currentMonth === today.getMonth()) 
            ? today.getDate() 
            : dInMonth;
        
        if (avgEl) avgEl.textContent = daysElapsed > 0 ? `€${(totalSpent / daysElapsed).toFixed(2)}` : '€0';
        if (avgSubEl) avgSubEl.textContent = `over ${daysElapsed} day${daysElapsed !== 1 ? 's' : ''}`;
    },

    renderSidebarTotal(records: BudgetRecord[]) {
        const totalSpent = records.filter(r => r.type === 'expense').reduce((s, e) => s + e.amount, 0);
        const totalIncome = records.filter(r => r.type === 'income').reduce((s, i) => s + i.amount, 0);
        const net = totalIncome - totalSpent;

        const el = document.getElementById('sidebar-total');
        if (el) {
            el.textContent = `€${net.toFixed(2)}`;
            (el as HTMLElement).style.color = net < 0 ? 'var(--danger)' : 'var(--accent)';
        }
    }
};
