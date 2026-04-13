import { MAX_YEAR, MIN_YEAR, Store } from './store';

const MOBILE_SIDEBAR_QUERY = '(max-width: 900px)';

export const UI = {
    applySidebarState(collapsed: boolean) {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        const isMobile = window.matchMedia(MOBILE_SIDEBAR_QUERY).matches;

        if (!sidebar) return;

        sidebar.classList.toggle('collapsed', !isMobile && collapsed);
        sidebar.classList.toggle('mobile-hidden', isMobile && collapsed);
        sidebar.classList.toggle('mobile-open', isMobile && !collapsed);

        if (backdrop) {
            backdrop.classList.toggle('visible', isMobile && !collapsed);
        }

        document.documentElement.style.setProperty('--sidebar-w', isMobile ? '0px' : collapsed ? '80px' : '256px');
    },

    showToast(msg: string) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('visible');
        setTimeout(() => t.classList.remove('visible'), 3000);
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        const isMobile = window.matchMedia(MOBILE_SIDEBAR_QUERY).matches;
        const isCollapsed = isMobile
            ? sidebar.classList.contains('mobile-hidden')
            : sidebar.classList.contains('collapsed');
        const nextCollapsed = !isCollapsed;

        this.applySidebarState(nextCollapsed);
        Store.setSidebarCollapsed(nextCollapsed);
    },

    initSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        const syncSidebar = () => this.applySidebarState(Store.getSidebarCollapsed());
        syncSidebar();

        const toggle = document.getElementById('sidebar-toggle');
        const mobileToggle = document.getElementById('sidebar-toggle-mobile');
        const backdrop = document.getElementById('sidebar-backdrop');

        if (toggle) toggle.onclick = () => this.toggleSidebar();
        if (mobileToggle) mobileToggle.onclick = () => this.toggleSidebar();
        if (backdrop) backdrop.onclick = () => {
            this.applySidebarState(true);
            Store.setSidebarCollapsed(true);
        };
        document.querySelectorAll('.nav-item').forEach(el => {
            el.addEventListener('click', () => {
                if (window.matchMedia(MOBILE_SIDEBAR_QUERY).matches) {
                    this.applySidebarState(true);
                    Store.setSidebarCollapsed(true);
                }
            });
        });

        window.addEventListener('resize', syncSidebar);
    },

    initMonthNavigation(onChange: () => void) {
        const monthDisplay = document.getElementById('month-display');
        const prevBtn = document.getElementById('btn-prev-month');
        const nextBtn = document.getElementById('btn-next-month');
        if (!monthDisplay || !prevBtn || !nextBtn) return;

        const lowerBound = { month: 0, year: MIN_YEAR };
        const upperNow = (() => {
            const now = new Date();
            return {
                month: now.getMonth(),
                year: Math.min(now.getFullYear(), MAX_YEAR)
            };
        })();

        const compareMonthYear = (left: { month: number; year: number }, right: { month: number; year: number }) => {
            if (left.year !== right.year) return left.year - right.year;
            return left.month - right.month;
        };

        const updateMonth = () => {
            const current = { year: Store.getCurrentYear(), month: Store.getCurrentMonth() };
            const d = new Date(current.year, current.month, 1);
            monthDisplay.textContent = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            prevBtn.toggleAttribute('disabled', compareMonthYear(current, lowerBound) <= 0);
            nextBtn.toggleAttribute('disabled', compareMonthYear(current, upperNow) >= 0);
        };

        prevBtn.onclick = () => {
            if (prevBtn.hasAttribute('disabled')) return;
            let month = Store.getCurrentMonth() - 1;
            let year = Store.getCurrentYear();
            if (month < 0) {
                month = 11;
                year -= 1;
            }
            Store.setCurrentMonth(month);
            Store.setCurrentYear(year);
            updateMonth();
            onChange();
        };

        nextBtn.onclick = () => {
            if (nextBtn.hasAttribute('disabled')) return;
            let month = Store.getCurrentMonth() + 1;
            let year = Store.getCurrentYear();
            if (month > 11) {
                month = 0;
                year += 1;
            }
            Store.setCurrentMonth(month);
            Store.setCurrentYear(year);
            updateMonth();
            onChange();
        };

        updateMonth();
    },

    initDateInputBounds(...inputIds: string[]) {
        const min = `${MIN_YEAR}-01-01`;
        const max = new Date().toISOString().split('T')[0];

        inputIds.forEach((inputId) => {
            const input = document.getElementById(inputId) as HTMLInputElement | null;
            if (!input) return;
            input.min = min;
            input.max = max;

            if (!input.value) {
                input.value = max;
                return;
            }

            if (input.value < min) input.value = min;
            if (input.value > max) input.value = max;
        });
    },

    bindDataRefresh(onChange: () => void) {
        const rerender = () => void onChange();
        window.addEventListener('pageshow', rerender);
        window.addEventListener('kasurra:data-changed', rerender as EventListener);
        window.addEventListener('storage', (event) => {
            if (event.key === 'kasurra:data-changed') {
                rerender();
            }
        });
    },

    esc(s: string) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};
