// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const supabaseUrl = 'https://uozmlevtkfqskdgqxejw.supabase.co';
const supabaseKey = 'sb_publishable_GS6J9I_G7vfn3mDExAEq1A_tGfctcjF';

// Initialize Client
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Global state for modals
window.globalPublications = [];

// ==========================================
// DOM Ready & Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
    initializeWebsite();
});

function initializeWebsite() {
    initSmoothScroll();
    initHeaderEffects();
    initScrollAnimations();
    initNavHighlighting();
    initExpandableCards();

    // Load dynamic data from Supabase
    loadMembersData();
    loadNewsData();
    loadPublicationsData();
}

// ==========================================
// DYNAMIC DATA FETCHING (SUPABASE)
// ==========================================

async function loadMembersData() {
    try {
        const { data: membersList, error } = await supabaseClient
            .from('members')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Categorize members based on role_category from DB
        // UPDATED: Use .filter() instead of .find() so it catches BOTH Co-Directors!
        const directors = membersList.filter(m => m.role_category === 'director');

        const collaborators = membersList.filter(m => m.role_category === 'collaborator');
        const phdStudents = membersList.filter(m => m.role_category === 'phd');
        const msStudents = membersList.filter(m => m.role_category === 'ms');
        const alumni = membersList.filter(m => m.role_category.startsWith('alumni'));
        const coordinators = membersList.filter(m => m.role_category === 'sig_coordinator');
        const sigMembers = membersList.filter(m => m.role_category === 'sig_member');

        // Render Co-Directors (Allows multiple)
        const directorGrid = document.querySelector('.director-grid');
        if (directorGrid && directors.length > 0) {
            directorGrid.innerHTML = directors.map(d => renderMemberCard(d, 'director')).join('');
        }

        // Render Collaborators
        const collaboratorGrid = document.querySelector('.collaborator-grid');
        if (collaboratorGrid && collaborators.length) {
            collaboratorGrid.innerHTML = collaborators.map(m => renderMemberCard(m, 'collaborator')).join('');
        }

        // Render Current Students
        const studentGrid = document.querySelector('.student-grid');
        if (studentGrid) {
            let studentsHTML = '';
            studentsHTML += phdStudents.map(m => renderMemberCard(m, 'phd')).join('');
            studentsHTML += msStudents.map(m => renderMemberCard(m, 'msc')).join('');
            studentGrid.innerHTML = studentsHTML;
        }

        // Render Alumni
        const alumniGrid = document.querySelector('.alumni-grid');
        if (alumniGrid && alumni.length) {
            alumniGrid.innerHTML = alumni.map(m => renderMemberCard(m, m.role_category.split('_')[1] || 'alumni')).join('');
        }

        // Re-initialize member filtering interactions
        setTimeout(() => {
            initMemberFiltering();
            const allButton = document.querySelector('.filter-btn[data-filter="all"]');
            if (allButton) allButton.click();
        }, 300);

    } catch (err) {
        console.error('Failed to load members:', err);
    }
}

async function loadNewsData() {
    try {
        const { data: news, error } = await supabaseClient
            .from('news')
            .select('*')
            .order('year', { ascending: false });

        if (error) throw error;
        displayDetailedNews(news);

    } catch (err) {
        console.error('Failed to load news:', err);
    }
}

async function loadPublicationsData() {
    try {
        const { data: publications, error } = await supabaseClient
            .from('publications')
            .select('*')
            .order('year', { ascending: false });

        if (error) throw error;

        // Save globally so the BibTex modal can find them later
        window.globalPublications = publications;

        // Dynamically calculate total citations from the database
        const dynamicTotalCitations = publications.reduce((sum, pub) => sum + (pub.citations || 0), 0);

        // Keep a static profile block for metrics, but inject dynamic citations
        const profileMetrics = {
            totalCitations: dynamicTotalCitations > 0 ? dynamicTotalCitations : 694,
            citationsSince2020: 386,
            hIndex: 14,
            i10Index: 22,
            lastUpdated: new Date().toISOString().split('T')[0]
        };

        updateLabMetrics(profileMetrics);

        // Display current year by default
        const currentYear = new Date().getFullYear();
        const recentPubs = publications.filter(pub => pub.year === currentYear);

        // Fallback to all if no pubs this year yet
        displayPublications(recentPubs.length > 0 ? recentPubs : publications.slice(0, 10));

        initPublicationFilters(publications);

    } catch (err) {
        console.error('Failed to load publications:', err);
    }
}

// ==========================================
// UI & RENDERING FUNCTIONS
// ==========================================

function getInitials(name) {
    if (!name) return '';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
}

function renderMemberCard(member, category) {
    const avatarContent = member.image_url
        ? `<img src="${member.image_url}" alt="${member.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
        : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold; background:#f0f0f0; border-radius:50%; color:#333;">${getInitials(member.name)}</div>`;

    // Hexagon shape for directors, standard circle for others
    const isDirector = category === 'director';
    const finalAvatar = isDirector
        ? `<div class="hexagon-avatar"><div class="hexagon-inner">${member.image_url ? `<img src="${member.image_url}" alt="${member.name}">` : getInitials(member.name)}</div></div>`
        : `<div class="member-avatar">${avatarContent}</div>`;

    return `
        <div class="member-card ${isDirector ? 'director-card' : ''}" data-name="${member.name}">
            <div class="member-avatar-wrapper">${finalAvatar}</div>
            <div class="member-info">
                <h4 class="member-name">${member.name}</h4>
                <p class="${isDirector ? 'member-title' : 'member-affiliation'}">${member.affiliation || member.title || ''}</p>
                <span class="member-badge ${category}">${category.replace('_', ' ').toUpperCase()}</span>
                ${member.linkedin_url ? `<a href="${member.linkedin_url}" target="_blank" class="member-linkedin">LinkedIn</a>` : ''}
            </div>
        </div>
    `;
}

function displayDetailedNews(newsItems) {
    const grid = document.getElementById('detailedNewsGrid');
    if (!grid) return;

    grid.innerHTML = newsItems.map(item => `
        <div class="news-item ${item.is_featured ? 'featured-news' : ''}">
            ${item.is_featured ? '<div class="news-badge featured">Featured</div>' : ''}
            <div class="news-date-badge">
                <span class="news-month">${item.month || ''}</span>
                <span class="news-year">${item.year}</span>
            </div>
            <div class="news-content">
                <h3>${item.title}</h3>
                <p class="news-summary">${item.description || ''}</p>
                <div class="news-tags">
                    ${(item.tags || []).map(tag => `<span class="news-tag default">${tag}</span>`).join('')}
                </div>
            </div>
        </div>
    `).join('');
}

function updateLabMetrics(profile) {
    const metrics = document.getElementById('labMetrics');
    if (!metrics) return;
    metrics.innerHTML = `
        <div class="metric-item"><div class="metric-number">${profile.totalCitations}</div><div class="metric-label">Total Citations</div></div>
        <div class="metric-item"><div class="metric-number">${profile.hIndex}</div><div class="metric-label">h-index</div></div>
        <div class="metric-item"><div class="metric-number">${profile.i10Index}</div><div class="metric-label">i10-index</div></div>
        <div class="metric-item"><div class="metric-number">${profile.citationsSince2020}</div><div class="metric-label">Recent Citations</div></div>
    `;
}

function displayPublications(publications) {
    const grid = document.getElementById('publicationsGrid');
    if (!grid) return;

    grid.innerHTML = publications.map(pub => {
        const isJournal = pub.venue && !pub.venue.includes('Conference');
        const pubType = isJournal ? 'journal' : 'conference';

        return `
            <div class="publication-card ${pubType}-paper" data-year="${pub.year}">
                <div class="pub-type-badge ${pubType}">${isJournal ? 'Journal' : 'Conference'}</div>
                ${pub.citations ? `<div class="pub-citations">${pub.citations} citations</div>` : ''}
                <div class="pub-content">
                    <h3>${pub.title}</h3>
                    <div class="pub-authors">${pub.authors}</div>
                    <div class="pub-venue">${pub.venue}, ${pub.year}</div>
                    <div class="pub-actions">
                        ${pub.doi ? `<a href="${pub.doi.startsWith('http') ? pub.doi : 'https://doi.org/' + pub.doi}" target="_blank" class="pub-link-btn">View Paper</a>` : ''}
                        <button class="pub-cite-btn" onclick="showBibtex('${pub.id}')">Cite</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function initPublicationFilters(allPublications) {
    const buttons = document.querySelectorAll('.pub-filter-btn');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const filter = button.dataset.filter;
            let filtered = [];
            if (filter === 'all') filtered = allPublications.slice(0, 20);
            else if (filter === 'high-impact') filtered = allPublications.filter(p => p.citations >= 200);
            else if (filter.includes('-')) {
                const [start, end] = filter.split('-');
                filtered = allPublications.filter(p => p.year >= parseInt(start) && p.year <= parseInt(end));
            } else {
                filtered = allPublications.filter(p => p.year === parseInt(filter));
            }
            displayPublications(filtered);
        });
    });
}

// ==========================================
// INTERACTIONS & SCROLL EFFECTS
// ==========================================

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerHeight = document.querySelector('.header').offsetHeight + 46;
                window.scrollTo({
                    top: targetElement.offsetTop - headerHeight,
                    behavior: 'smooth'
                });
            }
        });
    });
}

function initHeaderEffects() {
    window.addEventListener('scroll', function () {
        const header = document.querySelector('.header');
        if (header) {
            header.style.boxShadow = window.pageYOffset > 50
                ? '0 2px 10px rgba(0,0,0,0.15)'
                : '0 2px 5px rgba(0,0,0,0.1)';
        }
    });
}

function initScrollAnimations() {
    const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -100px 0px' };
    const animateOnScroll = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.news-card, .partner-card, .intro-text, .section-heading, .theme-card, .research-intro').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease';
        animateOnScroll.observe(el);
    });
}

function initNavHighlighting() {
    window.addEventListener('scroll', function () {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-link');
        const scrollPosition = window.pageYOffset + 200;

        sections.forEach(section => {
            if (scrollPosition >= section.offsetTop && scrollPosition < section.offsetTop + section.offsetHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + section.getAttribute('id')) link.classList.add('active');
                });
            }
        });
    });
}

function initExpandableCards() {
    document.querySelectorAll('.expand-btn').forEach(button => {
        button.addEventListener('click', function () {
            const card = this.closest('.theme-card');
            const details = card.querySelector('.theme-details');
            if (card.classList.contains('expanded')) {
                card.classList.remove('expanded');
                details.style.maxHeight = '0';
                details.style.opacity = '0';
                this.textContent = '+';
            } else {
                card.classList.add('expanded');
                details.style.maxHeight = details.scrollHeight + 'px';
                details.style.opacity = '1';
                this.textContent = '-';
            }
        });
    });
}

function initMemberFiltering() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const searchInput = document.getElementById('memberSearch');
    const memberSections = document.querySelectorAll('.member-section');

    filterButtons.forEach(button => {
        button.addEventListener('click', function () {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            filterMembers(this.getAttribute('data-filter'), searchInput?.value.toLowerCase() || '');
        });
    });

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            const activeFilter = document.querySelector('.filter-btn.active')?.getAttribute('data-filter') || 'all';
            filterMembers(activeFilter, this.value.toLowerCase());
        });
    }

    function filterMembers(categoryFilter, searchTerm) {
        memberSections.forEach(section => {
            const categoryType = section.getAttribute('data-category');
            const sectionCards = section.querySelectorAll('.member-card');
            let sectionVisible = false;

            if (categoryFilter === 'all' || categoryFilter === categoryType) {
                sectionCards.forEach(card => {
                    const name = card.getAttribute('data-name')?.toLowerCase() || '';
                    if (searchTerm === '' || name.includes(searchTerm)) {
                        card.style.display = 'flex';
                        sectionVisible = true;
                    } else {
                        card.style.display = 'none';
                    }
                });
                section.style.display = sectionVisible ? 'block' : 'none';
            } else {
                section.style.display = 'none';
            }
        });
    }
}

// ==========================================
// GLOBAL EXPORTS (For inline HTML handlers)
// ==========================================
window.showBibtex = function (pubId) {
    const pub = window.globalPublications.find(p => p.id === pubId);
    if (!pub || !pub.bibtex) return alert("BibTex not available for this publication.");

    const modal = document.createElement('div');
    modal.className = 'bibtex-modal';
    modal.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;`;
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; max-width: 700px; width: 90%; position: relative;">
            <h3>Citation</h3>
            <pre style="background: #f5f5f5; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 12px; margin-top: 15px;">${pub.bibtex}</pre>
            <button onclick="this.closest('.bibtex-modal').remove()" style="margin-top: 15px; background: #1A2744; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
};

// Scroll to top button logic
const scrollToTopBtn = document.getElementById("scrollToTop");
if (scrollToTopBtn) {
    window.addEventListener("scroll", () => {
        if (window.pageYOffset > 300) {
            scrollToTopBtn.classList.add("visible");
        } else {
            scrollToTopBtn.classList.remove("visible");
        }
    });
    scrollToTopBtn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
} j