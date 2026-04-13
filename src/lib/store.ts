export const STORAGE_KEY = 'kasurra_v2_storage';
const MONTH_KEY = 'kasurra_current_month';
const YEAR_KEY = 'kasurra_current_year';
export const MIN_YEAR = 2015;
export const MAX_YEAR = 2100;

function clampMonthYear(month: number, year: number) {
    const now = new Date();
    let safeYear = Number.isFinite(year) ? Math.trunc(year) : now.getFullYear();
    let safeMonth = Number.isFinite(month) ? Math.trunc(month) : now.getMonth();

    safeYear = Math.min(Math.max(safeYear, MIN_YEAR), MAX_YEAR);
    safeMonth = Math.min(Math.max(safeMonth, 0), 11);

    const isAfterCurrentMonth =
        safeYear > now.getFullYear() ||
        (safeYear === now.getFullYear() && safeMonth > now.getMonth());

    if (isAfterCurrentMonth) {
        safeYear = now.getFullYear();
        safeMonth = now.getMonth();
    }

    return { month: safeMonth, year: safeYear };
}

export const Store = {
    getCurrentMonth(): number {
        const m = localStorage.getItem(MONTH_KEY);
        const y = localStorage.getItem(YEAR_KEY);
        return clampMonthYear(
            m !== null ? parseInt(m, 10) : new Date().getMonth(),
            y !== null ? parseInt(y, 10) : new Date().getFullYear()
        ).month;
    },
    setCurrentMonth(m: number) {
        const clamped = clampMonthYear(m, this.getCurrentYear());
        localStorage.setItem(MONTH_KEY, clamped.month.toString());
        localStorage.setItem(YEAR_KEY, clamped.year.toString());
    },

    getCurrentYear(): number {
        const m = localStorage.getItem(MONTH_KEY);
        const y = localStorage.getItem(YEAR_KEY);
        return clampMonthYear(
            m !== null ? parseInt(m, 10) : new Date().getMonth(),
            y !== null ? parseInt(y, 10) : new Date().getFullYear()
        ).year;
    },
    setCurrentYear(y: number) {
        const clamped = clampMonthYear(this.getCurrentMonth(), y);
        localStorage.setItem(MONTH_KEY, clamped.month.toString());
        localStorage.setItem(YEAR_KEY, clamped.year.toString());
    },

    getSidebarCollapsed(): boolean {
        return localStorage.getItem('kasurra_sidebar_collapsed') === 'true';
    },
    setSidebarCollapsed(collapsed: boolean) {
        localStorage.setItem('kasurra_sidebar_collapsed', collapsed.toString());
    }
};
