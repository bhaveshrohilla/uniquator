/* file: src/js/tools_home.js */
document.addEventListener('DOMContentLoaded', () => {
    // Loader Fade-out
    const loader = document.getElementById('global-loader');
    if (loader) {
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => { loader.style.display = 'none'; }, 500);
        }, 300);
    }

    // Search Logic
    const searchInput = document.querySelector('.tool-search');
    const main = document.querySelector('main');
    if (!searchInput || !main) return;

    const categories = Array.from(document.querySelectorAll('.tool-category'));
    categories.forEach((cat, i) => cat.dataset.originalIndex = i);

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        let filterCat = query.match(/category:\s*(\w+)/)?.[1];
        let textQuery = filterCat ? query.replace(/category:\s*\w+/, '').trim() : query;

        const results = [];
        categories.forEach(cat => {
            const cards = cat.querySelectorAll('.tool-card');
            let matchCount = 0;
            let catMatch = !filterCat || cat.dataset.category.includes(filterCat);

            cards.forEach(card => {
                const isMatch = catMatch && (!textQuery || card.innerText.toLowerCase().includes(textQuery));
                card.style.display = isMatch ? 'flex' : 'none';
                if (isMatch) matchCount++;
            });

            cat.style.display = matchCount > 0 ? 'block' : 'none';
            results.push({ el: cat, count: matchCount, index: parseInt(cat.dataset.originalIndex) });
        });

        results.sort((a, b) => query ? b.count - a.count : a.index - b.index);
        results.forEach(r => main.appendChild(r.el));
    });
});
