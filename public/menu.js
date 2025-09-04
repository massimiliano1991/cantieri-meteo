/* eslint-env browser, es2021 */

(function() {
    const menuItems = [
        { href: 'index.html', icon: '📊', text: 'Dashboard' },
        { href: 'main.html', icon: '🗺️', text: 'Mappa Cantieri' },
        { href: 'ore.html', icon: '🕖', text: 'Gestione Ore' },
        { href: 'magazzino.html', icon: '📦', text: 'Gestione Magazzino' },
        { href: 'admin-dipendenti.html', icon: '👥', text: 'Gestione Dipendenti' },
        { href: 'admin-pianifica.html', icon: '🗓️', text: 'Pianificazione' }
    ];

    const nav = document.querySelector('.menu-nav');
    if (!nav) return;

    let menuHtml = '<ul>';
    const currentPage = window.location.pathname.split('/').pop();

    menuItems.forEach(item => {
        const isActive = item.href === currentPage;
        menuHtml += `
            <li class="${isActive ? 'active' : ''}">
                <a href="${item.href}">
                    <span class="icon">${item.icon}</span>
                    <span class="text">${item.text}</span>
                </a>
            </li>
        `;
    });
    menuHtml += '</ul>';
    nav.innerHTML = menuHtml;
})();