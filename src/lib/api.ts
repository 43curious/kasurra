import { STORAGE_KEY } from './store';
import type { Record, Category, User, CategoryMap, Pool } from './types';

const DATA_EVENT = 'zeken:data-changed';

function notifyDataChanged() {
    localStorage.setItem(DATA_EVENT, Date.now().toString());
    window.dispatchEvent(new CustomEvent(DATA_EVENT));
}

async function parseResponse<T>(res: Response): Promise<T> {
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

export const API = {
    async loadCategories(): Promise<{ CATS: CategoryMap, INCOME_CATS: CategoryMap }> {
        const res = await fetch('/api/categories');
        const data = await parseResponse<Category[]>(res);
        
        const CATS: CategoryMap = {};
        const INCOME_CATS: CategoryMap = {};
        
        data.forEach(c => {
            if (c.type === 'expense') {
                CATS[c.id] = { emoji: c.emoji, label: c.name, color: c.color };
            } else {
                INCOME_CATS[c.id] = { emoji: c.emoji, label: c.name, color: c.color };
            }
        });
        
        if (Object.keys(CATS).length === 0) CATS.fallback = { emoji: '📦', label: 'Other', color: '#64748b' };
        if (Object.keys(INCOME_CATS).length === 0) INCOME_CATS.fallback = { emoji: '⊞', label: 'Other Income', color: '#64748b' };
        
        return { CATS, INCOME_CATS };
    },

    async loadCategoryList(): Promise<Category[]> {
        const res = await fetch('/api/categories');
        return await parseResponse<Category[]>(res);
    },

    async loadPools(year: number): Promise<Pool[]> {
        const res = await fetch(`/api/pools?year=${year}`);
        return await parseResponse<Pool[]>(res);
    },

    async loadRecords(): Promise<Record[]> {
        const res = await fetch('/api/records');
        return await parseResponse<Record[]>(res);
    },

    async addRecord(record: Partial<Record>): Promise<Record> {
        const res = await fetch('/api/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
        });
        const data = await parseResponse<Record>(res);
        notifyDataChanged();
        return data;
    },

    async deleteRecord(id: string): Promise<{ success: boolean }> {
        const res = await fetch('/api/records', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await parseResponse<{ success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async addCategory(category: Pick<Category, 'type' | 'name' | 'emoji' | 'color'>): Promise<{ id: string; success: boolean }> {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(category)
        });
        const data = await parseResponse<{ id: string; success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async updateCategory(category: Pick<Category, 'id' | 'type' | 'name' | 'emoji' | 'color'>): Promise<{ success: boolean }> {
        const res = await fetch('/api/categories', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(category)
        });
        const data = await parseResponse<{ success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async deleteCategory(id: string): Promise<{ success: boolean }> {
        const res = await fetch('/api/categories', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const data = await parseResponse<{ success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async reorderCategories(type: 'expense' | 'income', orderedIds: string[]): Promise<{ success: boolean }> {
        const res = await fetch('/api/categories', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, orderedIds })
        });
        const data = await parseResponse<{ success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async addPool(payload: { name: string; linkedCategoryIds: string[]; target?: number | null }): Promise<{ id: string; success: boolean }> {
        const res = await fetch('/api/pools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await parseResponse<{ id: string; success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async withdrawFromPool(payload: { poolId: string; amount: number; description: string; date: string }): Promise<{ id: string; success: boolean }> {
        const res = await fetch('/api/pools', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await parseResponse<{ id: string; success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async togglePoolStatus(poolId: string, isClosed: boolean): Promise<{ success: boolean }> {
        const res = await fetch('/api/pools', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poolId, isClosed })
        });
        const data = await parseResponse<{ success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async getUser(): Promise<User> {
        const res = await fetch('/api/users');
        return await parseResponse<User>(res);
    },

    async updateUser(payload: Partial<User>): Promise<User> {
        const res = await fetch('/api/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await parseResponse<User>(res);
        notifyDataChanged();
        return data;
    },

    async clearAllData(): Promise<{ success: boolean }> {
        const res = await fetch('/api/users', {
            method: 'DELETE'
        });
        const data = await parseResponse<{ success: boolean }>(res);
        notifyDataChanged();
        return data;
    },

    async requireUser() {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
            return false;
        }
        return true;
    },

    async migrate() {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
            try {
                const data = JSON.parse(local);
                console.log(`Migrating ${data.length} records to SQLite...`);
                for (const r of data) {
                    await this.addRecord(r);
                }
                localStorage.removeItem(STORAGE_KEY);
            } catch (e) {
                console.error("Migration error:", e);
            }
        }
    }
};

export { DATA_EVENT };
