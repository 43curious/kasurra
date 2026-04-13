export interface Category {
    id: string;
    name: string;
    emoji: string;
    color: string;
    type: 'expense' | 'income';
    sortOrder?: number;
}

export type PoolType = 'rollover' | 'savings';

export interface PoolLinkedCategory {
    id: string;
    name: string;
    emoji: string;
    color: string;
}

export interface Pool {
    id: string;
    name: string;
    type: PoolType;
    balance: number;
    totalWithdrawals: number;
    availableBalance: number;
    isClosed: boolean;
    target?: number | null;
    linkedCategoryIds: string[];
    linkedCategories: PoolLinkedCategory[];
    withdrawals?: PoolWithdrawal[];
}

export interface PoolWithdrawal {
    id: string;
    poolId: string;
    amount: number;
    description: string;
    date: string;
    created: string;
}

export interface CategoryMap {
    [key: string]: {
        emoji: string;
        label: string;
        color: string;
    };
}

export interface Record {
    id: string;
    userId: string;
    type: 'expense' | 'income';
    name: string;
    amount: number;
    categoryId: string;
    location?: string;
    date: string;
    created: string;
}

export interface User {
    id: string;
    name: string;
    email: string;
    bankBalance: number;
}

export type ViewType = 'dashboard' | 'income' | 'calendar' | 'all' | 'categories' | 'yearly' | 'setup';
