import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.4.16/+esm';

// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
const supabaseUrl = 'https://uozmlevtkfqskdgqxejw.supabase.co';
const supabaseKey = 'sb_publishable_GS6J9I_G7vfn3mDExAEq1A_tGfctcjF';
const supabase = createClient(supabaseUrl, supabaseKey);
window.supabase = supabase; // Export for inline handlers

// Globals
window.currentUser = null;
let quillEditor = null;
let loadedBlogs = [];
let allPublications = [];
let allNewsItems = [];
let allJobs = [];
let loadedMembers = [];
let contentReady = false;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SITE_TITLE = document.title;
const HOME_LIMITS = { blogs: 3, news: 3, publications: 4 };
const ROLE_LABELS = { director: 'Co-Director', collaborator: 'External Collaborator', phd: 'PhD Student', ms: 'MS Student', alumni: 'Alumni' };
const STUDENT_ORDER = { phd: 0, ms: 1, alumni: 2 };
const SOCIAL_LINKS = [
    ['website_url', 'Website', 'fa-solid fa-globe'],
    ['google_scholar_url', 'Google Scholar', 'fa-brands fa-google-scholar'],
    ['linkedin_url', 'LinkedIn', 'fa-brands fa-linkedin-in'],
    ['github_url', 'GitHub', 'fa-brands fa-github'],
];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ==========================================
// SAFE RENDERING HELPERS
// ==========================================
// Everything from the database is escaped or sanitized before it goes into innerHTML.
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Rich text from the Quill editors (blog content, news/job descriptions)
function safeHtml(html) {
    return DOMPurify.sanitize(html || '', { ADD_ATTR: ['target'] });
}

// Only allow http(s) links; anything else (javascript:, data:, ...) is dropped
function safeUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url, window.location.href);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
    } catch {
        return '';
    }
}

// Plain text of an HTML string (DOMParser does not run scripts or load images)
function htmlToText(html) {
    // A space after each block keeps words from separate paragraphs apart
    const spaced = (html || '').replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>|<br\s*\/?>/gi, '$& ');
    return new DOMParser().parseFromString(spaced, 'text/html').body.textContent || '';
}

function excerptOf(html, length) {
    const text = htmlToText(html).replace(/\s+/g, ' ').trim();
    return text.length > length ? text.substring(0, length) + '…' : text;
}

function readTimeOf(html) {
    const words = htmlToText(html).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
}

function avatarFallback(name, size = 200) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Lab')}&size=${size}&background=e6eef5&color=014776&bold=true`;
}

// Blog authors are stored by name; use the matching member's photo when there is one
function authorAvatar(name) {
    const member = loadedMembers.find(m => m.name === name);
    return safeUrl(member?.image_url) || avatarFallback(name, 96);
}

function formatDate(value, month = 'short') {
    const date = new Date(value);
    return isNaN(date) ? '' : date.toLocaleDateString('en-US', { year: 'numeric', month, day: 'numeric' });
}

function stateMessage(text) {
    return `<p class="state-message">${esc(text)}</p>`;
}

function renderTags(tags) {
    return (tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
}

let toastTimer = null;
function showToast(text) {
    const toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// Uploads an image to the public bucket and returns its public URL
async function uploadImage(prefix, file) {
    if (!IMAGE_TYPES.includes(file.type)) throw new Error('Image must be JPEG, PNG, WebP or GIF.');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be 5 MB or smaller.');
    const ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
    const fileName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('profile-images').upload(fileName, file, { contentType: file.type });
    if (error) throw new Error('Image upload failed: ' + error.message);
    return supabase.storage.from('profile-images').getPublicUrl(fileName).data.publicUrl;
}

// RLS silently skips rows a user may not change, so check that something was actually written
function assertChanged(data) {
    if (!data || data.length === 0) throw new Error('Nothing was changed. Your account may not have editor access.');
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('footer-year').textContent = new Date().getFullYear();
    initNavigation();
    initMemberFilters();
    loadPublicContent();
    initAuth();
    initEditors();
});

async function loadPublicContent() {
    // Article and archive links need the content first; keep the homepage from flashing meanwhile
    if (location.hash.startsWith('#/')) document.getElementById('home-view').classList.add('hidden');

    // Blog author photos and job advisors come from the members list
    await Promise.allSettled([
        fetchMembersPublic().then(() => Promise.all([fetchBlogsPublic(), fetchJobsPublic()])),
        fetchNewsPublic(),
        fetchPublicationsPublic(),
    ]);
    contentReady = true;
    route();
}

async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.currentUser = session.user;
        updateNavbarLoginState(true);
    }

    // Keep UI in sync when the session expires or is ended in another tab
    supabase.auth.onAuthStateChange((event, session) => {
        window.currentUser = session?.user || null;
        updateNavbarLoginState(!!session);
        if (event === 'SIGNED_OUT') window.closeAdmin();
    });
}

// Rich text editors in the member workspace
function initEditors() {
    if (typeof Quill === 'undefined') return;

    quillEditor = new Quill('#quill-editor', {
        theme: 'snow',
        placeholder: 'Write your story...',
        modules: {
            toolbar: [
                [{ 'header': [2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'image', 'code-block'],
                ['clean']
            ]
        }
    });

    window.newsQuillEditor = new Quill('#quill-news-editor', {
        theme: 'snow',
        placeholder: 'Write a detailed description of this news item…',
        modules: {
            toolbar: [
                [{ 'header': [2, 3, false] }],
                ['bold', 'italic', 'underline', 'blockquote'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link', 'image'],
                ['clean']
            ]
        }
    });

    window.jobQuillEditor = new Quill('#quill-job-editor', {
        theme: 'snow',
        placeholder: 'Describe the job requirements, responsibilities, and how to apply...',
        modules: {
            toolbar: [
                [{ 'header': [2, 3, false] }],
                ['bold', 'italic', 'underline', 'blockquote'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['link'],
                ['clean']
            ]
        }
    });
}


// ==========================================
// NAVIGATION & ROUTING
// ==========================================
// #/blog/<id> and #/news/<id> open the article page; #/blog, #/news and #/publications are archive pages.
// Any other hash is a homepage section, e.g. #members.
const VIEWS = ['home-view', 'reader-view', 'all-blogs-view', 'all-news-view', 'all-publications-view'];
const ARCHIVES = {
    blog: { view: 'all-blogs-view', title: 'Blog' },
    news: { view: 'all-news-view', title: 'News' },
    publications: { view: 'all-publications-view', title: 'Publications' },
};

function initNavigation() {
    history.scrollRestoration = 'manual';
    const header = document.querySelector('.header');

    // Shadow under the sticky header once the page has scrolled
    const markScrolled = () => header.classList.toggle('is-scrolled', window.scrollY > 0);
    window.addEventListener('scroll', markScrolled, { passive: true });
    markScrolled();

    // Highlight the nav link of the section crossing the middle of the screen
    const spy = new IntersectionObserver(entries => {
        if (document.getElementById('home-view').classList.contains('hidden')) return;
        entries.forEach(entry => { if (entry.isIntersecting) setActiveNav(entry.target.id); });
    }, { rootMargin: '-45% 0px -54% 0px' });
    document.querySelectorAll('#home-view > section[id]').forEach(section => spy.observe(section));

    document.addEventListener('click', e => {
        if (!e.target.closest('.header')) window.toggleMobileMenu(false);

        // In-page links are routed here so views switch and scrolling clears the sticky header
        const link = e.target.closest('a[href^="#"]');
        if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const href = link.getAttribute('href');
        if (href === '#') return;
        e.preventDefault();
        window.toggleMobileMenu(false);
        if (link.classList.contains('skip-link')) return document.getElementById('main').focus();
        if (link.dataset.historyBack) return history.back();
        if (href !== location.hash) {
            history.replaceState({ ...history.state, scrollY: window.scrollY }, '');
            history.pushState({ from: location.hash }, '', href);
        }
        route({ smooth: true, focus: true });
    });

    // Back/forward returns to the scroll position the page was left at
    window.addEventListener('popstate', e => route({ scrollY: e.state?.scrollY }));

    document.addEventListener('keydown', e => {
        if (!document.getElementById('modal-overlay').classList.contains('hidden')) {
            if (e.key === 'Escape') window.closeModal();
            if (e.key === 'Tab') trapFocus(e, document.getElementById('content-modal'));
        } else if (e.key === 'Escape' && header.classList.contains('menu-open')) {
            window.toggleMobileMenu(false);
            header.querySelector('.mobile-menu-toggle').focus();
        }
    });

    window.matchMedia('(min-width: 961px)').addEventListener('change', e => {
        if (e.matches) window.toggleMobileMenu(false);
    });
}

function route({ scrollY, smooth = false, focus = false } = {}) {
    window.closeModal();
    const match = location.hash.match(/^#\/(blog|news|publications)(?:\/([\w-]+))?\/?$/);
    if (!match) return showHome(location.hash.slice(1), { scrollY, smooth, focus });
    if (!contentReady) return; // routed again once content has loaded
    const [, page, id] = match;
    if (id && page === 'blog') showBlogPost(id, { scrollY, focus });
    else if (id && page === 'news') showNewsItem(id, { scrollY, focus });
    else showArchive(page, { scrollY, focus });
}

function setView(viewId, navSection) {
    VIEWS.forEach(id => document.getElementById(id).classList.toggle('hidden', id !== viewId));
    if (navSection) setActiveNav(navSection);
}

function setActiveNav(section) {
    document.querySelectorAll('.nav-link').forEach(link => {
        const active = link.dataset.section === section;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
    });
}

function showHome(sectionId, { scrollY, smooth, focus }) {
    const homeView = document.getElementById('home-view');
    const wasVisible = !homeView.classList.contains('hidden');
    setView('home-view');
    document.title = SITE_TITLE;

    const target = sectionId ? document.getElementById(sectionId) : null;
    const section = target && homeView.contains(target) ? target : null;
    if (typeof scrollY === 'number') window.scrollTo(0, scrollY);
    else if (section) scrollToSection(section, smooth && wasVisible);
    else if (!wasVisible) window.scrollTo(0, 0);

    if (section && focus) {
        setActiveNav(sectionId);
        focusElement(section);
    }
}

function scrollToSection(section, smooth) {
    const top = section.id === 'home' ? 0
        : section.getBoundingClientRect().top + window.scrollY - document.querySelector('.header').offsetHeight;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduceMotion.matches ? 'smooth' : 'auto' });
}

// Moves keyboard focus without scrolling, so the next Tab continues from there
function focusElement(el) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
}

function showBlogPost(id, opts) {
    const post = loadedBlogs.find(b => b.id === id);
    if (!post) return showMissing('blog', opts);
    showReader({
        section: 'blog',
        eyebrow: post.category || 'Article',
        title: post.title,
        author: post.author_name || 'Lab member',
        avatar: authorAvatar(post.author_name),
        date: formatDate(post.created_at, 'long'),
        html: safeHtml(post.content),
        image: safeUrl(post.image_url),
        tags: post.tags,
    }, opts);
}

function showNewsItem(id, opts) {
    const item = allNewsItems.find(n => n.id === id);
    if (!item) return showMissing('news', opts);
    showReader({
        section: 'news',
        eyebrow: 'Lab news',
        title: item.title,
        author: 'SERA Lab',
        avatar: 'assets/sera_mark.svg',
        date: [item.month, item.year].filter(Boolean).join(' '),
        html: newsHtml(item.description),
        image: safeUrl(item.image_url),
        tags: item.tags,
    }, opts);
}

// Unpublished or deleted item: show the list instead
function showMissing(page, { focus }) {
    history.replaceState(history.state, '', `#/${page}`);
    showArchive(page, { focus });
}

// True when the visitor got here by following a link on the homepage
function cameFromHome() {
    const from = history.state?.from;
    return typeof from === 'string' && !from.startsWith('#/');
}

// Blog posts and news items share the article page
function showReader(article, { scrollY, focus }) {
    // Back returns to the homepage or list the visitor came from, at the same scroll position;
    // visitors who arrived on a direct link get the full list instead
    const fromHome = cameFromHome();
    const back = document.getElementById('reader-back');
    back.href = `#/${article.section}`;
    back.dataset.historyBack = fromHome || history.state?.from === `#/${article.section}` ? 'true' : '';
    document.getElementById('reader-back-label').textContent = fromHome ? 'Back' : article.section === 'news' ? 'All news' : 'All articles';
    document.getElementById('reader-category').textContent = article.eyebrow;
    document.getElementById('reader-title').textContent = article.title;
    document.getElementById('reader-author-name').textContent = article.author;
    const avatar = document.getElementById('reader-author-img');
    avatar.src = article.avatar;
    avatar.classList.toggle('reader-avatar--logo', article.section === 'news');
    const readTime = article.html ? `${readTimeOf(article.html)} min read` : '';
    document.getElementById('reader-sub').textContent = [article.date, readTime].filter(Boolean).join(' · ');
    document.getElementById('reader-content').innerHTML = article.html;

    const cover = document.getElementById('reader-cover');
    cover.classList.toggle('hidden', !article.image);
    if (article.image) cover.src = article.image;
    else cover.removeAttribute('src');

    const tags = document.getElementById('reader-tags');
    tags.innerHTML = renderTags(article.tags);
    tags.classList.toggle('hidden', !article.tags?.length);

    const url = encodeURIComponent(location.href);
    const title = encodeURIComponent(article.title);
    document.getElementById('share-linkedin').href = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    document.getElementById('share-x').href = `https://twitter.com/intent/tweet?url=${url}&text=${title}`;
    document.getElementById('share-email').href = `mailto:?subject=${title}&body=${url}`;

    setView('reader-view', article.section);
    document.title = `${article.title} · SERA Lab`;
    window.scrollTo(0, scrollY ?? 0);
    if (focus) focusElement(document.getElementById('reader-title'));
}

function showArchive(page, { scrollY, focus }) {
    const archive = ARCHIVES[page];
    setView(archive.view, page);
    document.querySelector(`#${archive.view} .back-link`).dataset.historyBack = cameFromHome() ? 'true' : '';
    document.title = `${archive.title} · SERA Lab`;
    window.scrollTo(0, scrollY ?? 0);
    if (focus) focusElement(document.querySelector(`#${archive.view} .page-title`));
}

window.toggleMobileMenu = function (force) {
    const header = document.querySelector('.header');
    const open = header.classList.toggle('menu-open', force);
    const button = header.querySelector('.mobile-menu-toggle');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    button.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
};

window.copyUrl = async function () {
    try {
        await navigator.clipboard.writeText(location.href);
        showToast('Link copied to clipboard');
    } catch {
        showToast('Could not copy the link');
    }
};

// ==========================================
// PEOPLE
// ==========================================
function initMemberFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => applyMemberFilter(btn.dataset.filter));
    });
}

function applyMemberFilter(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const active = btn.dataset.filter === filter;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });

    // Hide non-matching cards, and any group left empty
    document.querySelectorAll('#members .people-group').forEach(group => {
        let shown = 0;
        group.querySelectorAll('.member-card').forEach(card => {
            const match = filter === 'all' || card.dataset.role === filter;
            card.classList.toggle('hidden', !match);
            if (match) shown++;
        });
        group.classList.toggle('hidden', shown === 0);
    });
}

async function fetchMembersPublic() {
    const status = document.getElementById('members-status');
    const filters = document.querySelector('.member-filters');
    let members = null;
    let relations = [];
    try {
        const [membersRes, relationsRes] = await Promise.all([
            supabase.from('members').select('*').order('name'),
            supabase.from('member_directors').select('*')
        ]);
        if (membersRes.error) throw membersRes.error;
        members = membersRes.data || [];
        relations = relationsRes.data || [];
    } catch {
        members = null;
    }

    if (!members?.length) {
        status.textContent = members ? 'No people are listed yet.' : 'People could not be loaded right now. Please try again later.';
        status.classList.remove('hidden');
        filters.classList.add('hidden');
        document.querySelectorAll('#members .people-group').forEach(group => group.classList.add('hidden'));
        return;
    }
    loadedMembers = members; // Blog authors and job advisors look people up here

    // Advisor names for each student
    const directorNames = {};
    members.filter(m => m.role_category === 'director').forEach(d => { directorNames[d.id] = d.name; });
    const advisorsOf = {};
    relations.forEach(r => {
        if (directorNames[r.director_id]) (advisorsOf[r.member_id] ||= []).push(directorNames[r.director_id]);
    });

    const directors = members.filter(m => m.role_category === 'director');
    const collaborators = members.filter(m => m.role_category === 'collaborator');
    const students = members
        .filter(m => m.role_category !== 'director' && m.role_category !== 'collaborator')
        .sort((a, b) => (STUDENT_ORDER[a.role_category] ?? 9) - (STUDENT_ORDER[b.role_category] ?? 9));

    document.getElementById('co-directors-grid').innerHTML = directors.map(m => renderMemberCard(m, [], true)).join('');
    document.getElementById('collaborators-grid').innerHTML = collaborators.map(m => renderMemberCard(m)).join('');
    document.getElementById('students-grid').innerHTML = students.map(m => renderMemberCard(m, advisorsOf[m.id])).join('');

    // Filter buttons show how many people each holds; empty categories are hidden
    const counts = { all: members.length };
    members.forEach(m => { counts[m.role_category] = (counts[m.role_category] || 0) + 1; });
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const count = counts[btn.dataset.filter] || 0;
        btn.querySelector('.filter-count').textContent = count;
        btn.classList.toggle('hidden', count === 0);
    });

    const current = document.querySelector('.filter-btn.active')?.dataset.filter;
    status.classList.add('hidden');
    filters.classList.remove('hidden');
    applyMemberFilter(counts[current] ? current : 'all');
}

function renderMemberCard(m, advisors = [], featured = false) {
    const label = ROLE_LABELS[m.role_category] || m.role_category || '';
    const photo = safeUrl(m.image_url) || avatarFallback(m.name);

    const meta = [];
    const metaItem = (icon, html) => `<li><i class="${icon}" aria-hidden="true"></i><span>${html}</span></li>`;
    if (m.affiliation) meta.push(metaItem('fa-solid fa-building-columns', esc(m.affiliation)));
    if (advisors.length) meta.push(metaItem('fa-solid fa-user-tie', `Advised by ${esc(advisors.join(', '))}`));

    // Email, phone and profiles as icon links; hovering shows the address or site
    const iconLink = (href, icon, title, label, external) =>
        `<a class="member-social-link" href="${esc(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''} title="${esc(title)}" aria-label="${esc(label)}"><i class="${icon}" aria-hidden="true"></i></a>`;
    const social = [
        m.email && iconLink(`mailto:${encodeURI(m.email)}`, 'fa-solid fa-envelope', m.email, `Email ${m.name}`),
        m.contact_number && iconLink(`tel:${m.contact_number.replace(/[^\d+]/g, '')}`, 'fa-solid fa-phone', m.contact_number, `Call ${m.name}`),
        ...SOCIAL_LINKS.map(([field, site, icon]) => {
            const href = safeUrl(m[field]);
            return href && iconLink(href, icon, site, `${m.name} on ${site}`, true);
        }),
    ].filter(Boolean).join('');

    return `
    <article class="member-card${featured ? ' member-card--featured' : ''}" data-role="${esc(m.role_category)}">
        <div class="member-avatar">
            <img src="${esc(photo)}" alt="" width="128" height="128" loading="lazy"
                 data-fallback="${esc(avatarFallback(m.name))}" onerror="this.onerror=null;this.src=this.dataset.fallback">
        </div>
        <div class="member-info">
            <p class="member-role">${esc(label)}</p>
            <h4 class="member-name">${esc(m.name)}</h4>
            ${m.title && m.title !== label ? `<p class="member-title">${esc(m.title)}</p>` : ''}
            ${meta.length ? `<ul class="member-meta">${meta.join('')}</ul>` : ''}
            ${social ? `<div class="member-social">${social}</div>` : ''}
        </div>
    </article>`;
}

// ==========================================
// PUBLICATIONS
// ==========================================
async function fetchPublicationsPublic() {
    const list = document.getElementById('publicationsGrid');
    const viewAll = document.getElementById('pubs-view-all-wrapper');
    try {
        const { data, error } = await supabase.from('publications').select('*')
            .order('year', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });
        if (error) throw error;
        allPublications = data || [];
    } catch {
        allPublications = [];
        list.innerHTML = stateMessage('Publications could not be loaded right now. Please try again later.');
        renderAllPublications();
        viewAll.classList.add('hidden');
        return;
    }

    list.innerHTML = allPublications.length
        ? allPublications.slice(0, HOME_LIMITS.publications).map(p => renderPubItem(p)).join('')
        : stateMessage('No publications yet.');
    renderAllPublications();
    viewAll.classList.toggle('hidden', !allPublications.length);
}

function renderPubItem(p) {
    const doiHref = p.doi ? safeUrl(p.doi.startsWith('http') ? p.doi : 'https://doi.org/' + p.doi) : '';
    const title = doiHref
        ? `<a href="${esc(doiHref)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}</a>`
        : esc(p.title);
    const actions = [
        doiHref && `<a class="pub-action" href="${esc(doiHref)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> DOI</a>`,
        p.bibtex && `<button type="button" class="pub-action" aria-expanded="false" onclick="window.toggleBibtex(this)"><i class="fa-solid fa-quote-right" aria-hidden="true"></i> BibTeX</button>`,
        p.citations > 0 && `<span class="pub-cited">Cited by ${esc(p.citations)}</span>`,
    ].filter(Boolean).join('');

    return `
    <article class="pub-item">
        <div class="pub-year">${esc(p.year || '—')}</div>
        <div class="pub-body">
            <h3 class="pub-title">${title}</h3>
            <p class="pub-authors">${esc(p.authors)}</p>
            ${p.venue ? `<p class="pub-venue">${esc(p.venue)}</p>` : ''}
            ${actions ? `<div class="pub-actions">${actions}</div>` : ''}
            ${p.bibtex ? `<div class="pub-bibtex hidden"><pre>${esc(p.bibtex)}</pre><button type="button" class="btn btn-secondary btn-sm pub-copy" onclick="window.copyBibtex(this)">Copy</button></div>` : ''}
        </div>
    </article>`;
}

// Archive page: grouped by year, newest first, undated last
function renderAllPublications() {
    const container = document.getElementById('all-publications-grid');
    if (!allPublications.length) {
        container.innerHTML = stateMessage('No publications yet.');
        return;
    }
    const byYear = new Map();
    allPublications.forEach(p => {
        const year = p.year || 'Undated';
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(p);
    });
    container.innerHTML = [...byYear].map(([year, pubs]) => `
        <section class="pub-year-group">
            <h2 class="pub-year-heading">${esc(year)}</h2>
            <div class="pub-list">${pubs.map(p => renderPubItem(p)).join('')}</div>
        </section>`).join('');
}

window.toggleBibtex = function (btn) {
    const panel = btn.closest('.pub-item').querySelector('.pub-bibtex');
    const open = panel.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', String(open));
};

window.copyBibtex = async function (btn) {
    try {
        await navigator.clipboard.writeText(btn.closest('.pub-bibtex').querySelector('pre').textContent);
        showToast('BibTeX copied to clipboard');
    } catch {
        showToast('Could not copy. Select the text and copy it instead.');
    }
};

// ==========================================
// NEWS & BLOG LISTS
// ==========================================
// News items and blog posts are listed the same way: date, title, excerpt and a thumbnail
function renderEntry({ href, date, meta = '', title, excerpt, footer = '', image }) {
    return `
    <article class="entry${image ? ' has-thumb' : ''}">
        <p class="entry-date">${esc(date)}</p>
        <div class="entry-body">
            ${meta}
            <h3 class="entry-title"><a href="${esc(href)}" class="stretched-link">${esc(title)}</a></h3>
            ${excerpt ? `<p class="entry-excerpt">${esc(excerpt)}</p>` : ''}
            ${footer}
        </div>
        ${image ? `<div class="entry-thumb"><img src="${esc(image)}" alt="" loading="lazy"></div>` : ''}
    </article>`;
}

// ==========================================
// NEWS
// ==========================================
async function fetchNewsPublic() {
    const list = document.getElementById('public-news-grid');
    const archive = document.getElementById('all-news-grid');
    const viewAll = document.getElementById('news-view-all-wrapper');
    try {
        const { data, error } = await supabase.from('news').select('*').order('year', { ascending: false }).order('created_at', { ascending: false });
        if (error) throw error;
        // Featured items first, then newest
        allNewsItems = (data || []).sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
    } catch {
        allNewsItems = [];
        list.innerHTML = archive.innerHTML = stateMessage('News could not be loaded right now. Please try again later.');
        viewAll.classList.add('hidden');
        return;
    }

    if (!allNewsItems.length) {
        list.innerHTML = archive.innerHTML = stateMessage('No news yet.');
        viewAll.classList.add('hidden');
        return;
    }
    list.innerHTML = allNewsItems.slice(0, HOME_LIMITS.news).map(renderNewsItem).join('');
    archive.innerHTML = allNewsItems.map(renderNewsItem).join('');
    viewAll.classList.remove('hidden');
}

function renderNewsItem(n) {
    return renderEntry({
        href: `#/news/${n.id}`,
        date: [n.month, n.year].filter(Boolean).join(' '),
        meta: n.is_featured ? '<p class="entry-featured">Featured</p>' : '',
        title: n.title,
        excerpt: excerptOf(n.description, 180),
        footer: n.tags?.length ? `<div class="tag-list">${renderTags(n.tags)}</div>` : '',
        image: safeUrl(n.image_url),
    });
}

// News descriptions are rich text, except some older plain-text items
function newsHtml(description) {
    if (!description) return '';
    return description.trim().startsWith('<') ? safeHtml(description) : `<p>${esc(description)}</p>`;
}

// ==========================================
// BLOG
// ==========================================
async function fetchBlogsPublic() {
    const grid = document.getElementById('public-blog-grid');
    const archive = document.getElementById('all-blogs-grid');
    const viewAll = document.getElementById('blog-view-all-wrapper');
    try {
        const { data, error } = await supabase.from('blogs').select('*').eq('status', 'published').order('created_at', { ascending: false });
        if (error) throw error;
        loadedBlogs = data || [];
    } catch {
        loadedBlogs = [];
        grid.innerHTML = archive.innerHTML = stateMessage('Articles could not be loaded right now. Please try again later.');
        viewAll.classList.add('hidden');
        return;
    }

    if (!loadedBlogs.length) {
        grid.innerHTML = archive.innerHTML = stateMessage('No articles published yet.');
        viewAll.classList.add('hidden');
        return;
    }
    grid.innerHTML = loadedBlogs.slice(0, HOME_LIMITS.blogs).map(renderBlogItem).join('');
    archive.innerHTML = loadedBlogs.map(renderBlogItem).join('');
    viewAll.classList.remove('hidden');
}

function renderBlogItem(post) {
    return renderEntry({
        href: `#/blog/${post.id}`,
        date: formatDate(post.created_at),
        meta: `<p class="entry-meta">${esc(post.category || 'Research')} · ${readTimeOf(post.content)} min read</p>`,
        title: post.title,
        excerpt: excerptOf(post.content, 180),
        footer: `<p class="entry-byline"><img src="${esc(authorAvatar(post.author_name))}" alt="" width="26" height="26" loading="lazy">${esc(post.author_name || 'Lab member')}</p>`,
        image: safeUrl(post.image_url),
    });
}

// ==========================================
// OPEN POSITIONS
// ==========================================
const JOBS_EMPTY = `
    <div class="jobs-empty">
        <span class="jobs-empty-icon" aria-hidden="true"><i class="fa-regular fa-envelope"></i></span>
        <div>
            <p class="jobs-empty-title">No open positions right now</p>
            <p class="jobs-empty-text">We are always glad to hear from motivated students and researchers.
                Contact one of the lab's co-directors to ask about future opportunities.</p>
            <a href="#members" class="btn btn-light btn-sm">Meet the co-directors</a>
        </div>
    </div>`;

async function fetchJobsPublic() {
    const grid = document.getElementById('public-jobs-grid');
    try {
        const { data, error } = await supabase.from('job_openings').select('*').eq('is_active', true).order('created_at', { ascending: false });
        if (error) throw error;
        allJobs = data || [];
    } catch {
        allJobs = [];
        grid.innerHTML = stateMessage('Open positions could not be loaded right now. Please try again later.');
        return;
    }
    grid.innerHTML = allJobs.length ? allJobs.map(renderJobCard).join('') : JOBS_EMPTY;
}

function renderJobCard(job) {
    const advisor = loadedMembers.find(m => m.id === job.advisor_id);

    return `
    <article class="job-card">
        <p class="job-advisor"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> ${advisor ? `Advisor: ${esc(advisor.name)}` : 'SERA Lab'}</p>
        <h3 class="job-title"><button type="button" class="stretched-link" data-id="${esc(job.id)}" onclick="window.openJob(this.dataset.id)">${esc(job.title)}</button></h3>
        <p class="job-excerpt">${esc(excerptOf(job.description, 200))}</p>
        <span class="job-more" aria-hidden="true">View details <i class="fa-solid fa-arrow-right"></i></span>
    </article>`;
}

// ==========================================
// JOB DETAILS DIALOG
// ==========================================
let modalReturnFocus = null;

window.openJob = function (id) {
    const job = allJobs.find(x => x.id === id);
    if (!job) return;
    const advisor = loadedMembers.find(m => m.id === job.advisor_id);

    document.getElementById('modal-meta-text').textContent = `Posted ${formatDate(job.created_at)}`;
    document.getElementById('modal-title').textContent = job.title;
    document.getElementById('modal-tags').innerHTML = '<span class="tag">Open position</span>' +
        (advisor ? `<span class="tag"><i class="fa-solid fa-user-tie" aria-hidden="true"></i> Advisor: ${esc(advisor.name)}</span>` : '');
    document.getElementById('modal-description').innerHTML = job.description ? safeHtml(job.description) : '<p>No description provided.</p>';

    modalReturnFocus = document.activeElement;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.classList.add('overlay-open');
    document.getElementById('content-modal').scrollTop = 0;
    document.querySelector('#content-modal .modal-close').focus();
};

window.closeModal = function () {
    const overlay = document.getElementById('modal-overlay');
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    document.body.classList.remove('overlay-open');
    modalReturnFocus?.focus({ preventScroll: true });
    modalReturnFocus = null;
};

// Keeps Tab and Shift+Tab inside the open dialog
function trapFocus(e, container) {
    const focusable = [...container.querySelectorAll('a[href], button:not([disabled]), input, select, textarea')]
        .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!container.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

// ==========================================
// ADMIN DASHBOARD LOGIC
// ==========================================
window.openAdminLogin = function (e) {
    e?.preventDefault();
    window.toggleMobileMenu(false);
    document.getElementById('admin-dashboard').classList.remove('hidden');
    document.body.classList.add('overlay-open');
    if (window.currentUser) return showDashboard();

    document.getElementById('admin-login-screen').classList.remove('hidden');
    document.getElementById('admin-app-screen').classList.add('hidden');
    document.getElementById('admin-email').focus();
};

function showDashboard() {
    document.getElementById('admin-login-screen').classList.add('hidden');
    document.getElementById('admin-app-screen').classList.remove('hidden');
    document.getElementById('admin-user-email').textContent = window.currentUser?.email || '';
    document.getElementById('admin-dashboard').scrollTop = 0;
    fetchAdminBlogs();
}

window.closeAdmin = function () {
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.body.classList.remove('overlay-open');
};

window.handleLogin = async function () {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const msg = document.getElementById('admin-msg');
    const submit = document.getElementById('login-submit');

    if (!email || !password) {
        msg.className = 'form-message error';
        msg.textContent = 'Enter your email and password.';
        return;
    }

    msg.className = 'form-message';
    msg.textContent = '';
    submit.disabled = true;
    submit.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Signing in…';
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        document.getElementById('admin-password').value = '';
        window.currentUser = data.user;
        updateNavbarLoginState(true);
        showDashboard();
    } catch (e) {
        msg.className = 'form-message error';
        if (e.message === 'Invalid login credentials') msg.textContent = 'Incorrect email or password.';
        else if (e.message === 'Failed to fetch' || e.status === 0) msg.textContent = 'Could not reach the server. Check your connection and try again.';
        else msg.textContent = e.message;
    } finally {
        submit.disabled = false;
        submit.textContent = 'Sign in';
    }
};

window.togglePassword = function (btn) {
    const input = document.getElementById('admin-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.querySelector('i').className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
};

window.handleLogout = async function () {
    await supabase.auth.signOut();
    window.currentUser = null;
    updateNavbarLoginState(false);
    window.closeAdmin();
    showToast('Signed out');
};

// Signed-in members get a Workspace link in the main nav; the footer link is the way in otherwise
function updateNavbarLoginState(loggedIn) {
    document.getElementById('nav-workspace').classList.toggle('hidden', !loggedIn);
    document.querySelector('#footer-login-btn i').className = loggedIn ? 'fa-solid fa-circle-user' : 'fa-solid fa-lock';
    document.getElementById('footer-login-label').textContent = loggedIn ? 'Workspace' : 'Member login';
}

window.switchAdminTab = function (tab, el) {
    document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    ['blogs', 'pubs', 'members', 'jobs', 'news'].forEach(t => document.getElementById(`admin-tab-${t}`).classList.add('hidden'));
    document.getElementById(`admin-tab-${tab}`).classList.remove('hidden');
    if (tab === 'pubs') fetchAdminPubs();
    if (tab === 'members') fetchAdminMembers();
    if (tab === 'jobs') fetchAdminJobs();
    if (tab === 'news') fetchAdminNews();
};

/* --- Admin Blog Management --- */
async function fetchAdminBlogs() {
    try {
        const { data, error } = await supabase.from('blogs').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        const tbody = document.getElementById('admin-blog-tbody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="cell-empty">No posts yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(b => `
        <tr>
            <td class="cell-title">${esc(b.title)}</td>
            <td><span class="badge${b.status === 'published' ? ' badge-success' : ''}">${esc(b.status)}</span></td>
            <td class="cell-muted">${formatDate(b.created_at)}</td>
            <td class="cell-actions">
                <button class="btn btn-ghost btn-sm" onclick="window.editAdminBlog('${b.id}')">Edit</button>
                <button class="btn btn-ghost btn-sm btn-danger" onclick="window.deleteAdminBlog('${b.id}')">Delete</button>
            </td>
        </tr>
    `).join('');

        window.adminBlogs = data;
    } catch (e) {
        document.getElementById('admin-blog-tbody').innerHTML = '<tr><td colspan="4" class="cell-empty">Posts could not be loaded.</td></tr>';
    }
}

window.showBlogEditor = function () {
    document.getElementById('admin-blog-list').classList.add('hidden');
    document.getElementById('admin-blog-editor').classList.remove('hidden');

    document.getElementById('edit-post-id').value = '';
    document.getElementById('post-title').value = '';
    document.getElementById('post-category').value = '';
    document.getElementById('post-tags').value = '';
    document.getElementById('post-cover').value = '';
    quillEditor.root.innerHTML = '';
    populateBlogAuthors();
    document.getElementById('editor-title-heading').innerText = 'Create New Post';
    document.getElementById('post-msg').innerText = '';
};

// Author dropdown: lab members, defaulting to the member whose email matches the logged-in account
function populateBlogAuthors(selectedName) {
    const select = document.getElementById('post-author');
    const loginEmail = (window.currentUser?.email || '').toLowerCase();
    const me = loadedMembers.find(m => m.email && m.email.toLowerCase() === loginEmail);
    const names = loadedMembers.map(m => m.name);

    // No member profile for this login yet: offer the email username, as before
    if (!me && loginEmail) names.unshift(loginEmail.split('@')[0]);
    // Keep an existing author that is no longer (or never was) in the members list
    if (selectedName && !names.includes(selectedName)) names.unshift(selectedName);

    const selected = selectedName || me?.name || names[0];
    select.innerHTML = names
        .map(n => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${esc(n)}</option>`)
        .join('');
}

window.hideBlogEditor = function () {
    document.getElementById('admin-blog-list').classList.remove('hidden');
    document.getElementById('admin-blog-editor').classList.add('hidden');
};

window.editAdminBlog = function (id) {
    const post = window.adminBlogs.find(b => b.id === id);
    if (!post) return;

    window.showBlogEditor();
    document.getElementById('editor-title-heading').innerText = 'Edit Post';
    document.getElementById('edit-post-id').value = post.id;
    document.getElementById('post-title').value = post.title;
    document.getElementById('post-category').value = post.category || '';
    document.getElementById('post-tags').value = (post.tags || []).join(', ');
    populateBlogAuthors(post.author_name);
    quillEditor.root.innerHTML = safeHtml(post.content);
};

window.savePost = async function (status) {
    const id = document.getElementById('edit-post-id').value;
    const title = document.getElementById('post-title').value;
    const content = quillEditor.root.innerHTML;
    const category = document.getElementById('post-category').value;
    const tagsRaw = document.getElementById('post-tags').value;
    const authorName = document.getElementById('post-author').value;
    const fileInput = document.getElementById('post-cover');
    const msg = document.getElementById('post-msg');

    if (!title) return msg.innerText = "Title is required.", msg.className = "message error";
    if (!authorName) return msg.innerText = "Author is required.", msg.className = "message error";
    if (quillEditor.getText().trim().length === 0) return msg.innerText = "Content is required.", msg.className = "message error";

    msg.className = "message"; msg.innerText = "Saving post...";

    const payload = {
        title,
        content,
        category,
        status,
        tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [],
        author_name: authorName,
    };

    try {
        if (fileInput.files.length > 0) payload.image_url = await uploadImage('blog', fileInput.files[0]);

        if (id) {
            const { data, error } = await supabase.from('blogs').update(payload).eq('id', id).select('id');
            if (error) throw error;
            assertChanged(data);
        } else {
            // author_id records which account posted it, which may differ from the credited author
            payload.author_id = window.currentUser.id;
            const { error } = await supabase.from('blogs').insert([payload]);
            if (error) throw error;
        }

        msg.className = "message success"; msg.innerText = "Post saved.";
        fetchAdminBlogs();
        fetchBlogsPublic();
        setTimeout(() => window.hideBlogEditor(), 1500);
    } catch (e) {
        msg.className = "message error"; msg.innerText = e.message;
    }
};

window.deleteAdminBlog = async function (id) {
    if (!confirm('Delete this blog post? This cannot be undone.')) return;
    const { data, error } = await supabase.from('blogs').delete().eq('id', id).select('id');
    if (error) return alert('Delete failed: ' + error.message);
    if (!data?.length) return alert('Delete failed: your account may not have editor access.');
    fetchAdminBlogs();
    fetchBlogsPublic();
};

/* --- Admin Publications Management --- */
window.adminPubs = [];

async function fetchAdminPubs() {
    try {
        const { data, error } = await supabase.from('publications').select('*').order('year', { ascending: false });
        if (error) throw error;
        window.adminPubs = data || [];
        const tbody = document.getElementById('admin-pub-tbody');
        if (!window.adminPubs.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="cell-empty">No publications yet.</td></tr>';
            return;
        }
        tbody.innerHTML = window.adminPubs.map(p => `
            <tr>
                <td class="cell-title">${esc(p.title)}</td>
                <td class="cell-muted">${esc(p.authors || '—')}</td>
                <td>${esc(p.year || '—')}</td>
                <td class="cell-actions">
                    <button class="btn btn-ghost btn-sm" onclick="window.editAdminPub('${p.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm btn-danger" onclick="window.deleteAdminPub('${p.id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        document.getElementById('admin-pub-tbody').innerHTML = '<tr><td colspan="4" class="cell-empty">Publications could not be loaded.</td></tr>';
    }
}

window.showPubEditor = function () {
    document.getElementById('admin-pub-list').classList.add('hidden');
    document.getElementById('admin-pub-editor').classList.remove('hidden');
    document.getElementById('edit-pub-id').value = '';
    document.getElementById('pub-title').value = '';
    document.getElementById('pub-authors').value = '';
    document.getElementById('pub-venue').value = '';
    document.getElementById('pub-year').value = '';
    document.getElementById('pub-citations').value = '';
    document.getElementById('pub-doi').value = '';
    document.getElementById('pub-bibtex').value = '';
    document.getElementById('pub-editor-heading').innerText = 'Add Publication';
    document.getElementById('pub-msg').innerText = '';
};

window.hidePubEditor = function () {
    document.getElementById('admin-pub-list').classList.remove('hidden');
    document.getElementById('admin-pub-editor').classList.add('hidden');
};

window.editAdminPub = function (id) {
    const pub = window.adminPubs.find(p => p.id === id);
    if (!pub) return;
    window.showPubEditor();
    document.getElementById('pub-editor-heading').innerText = 'Edit Publication';
    document.getElementById('edit-pub-id').value = pub.id;
    document.getElementById('pub-title').value = pub.title || '';
    document.getElementById('pub-authors').value = pub.authors || '';
    document.getElementById('pub-venue').value = pub.venue || '';
    document.getElementById('pub-year').value = pub.year || '';
    document.getElementById('pub-citations').value = pub.citations ?? '';
    document.getElementById('pub-doi').value = pub.doi || '';
    document.getElementById('pub-bibtex').value = pub.bibtex || '';
};

window.savePub = async function () {
    const id = document.getElementById('edit-pub-id').value;
    const title = document.getElementById('pub-title').value.trim();
    const authors = document.getElementById('pub-authors').value.trim();
    const msg = document.getElementById('pub-msg');
    if (!title) { msg.className = 'message error'; msg.innerText = 'Title is required.'; return; }
    if (!authors) { msg.className = 'message error'; msg.innerText = 'Authors are required.'; return; }
    msg.className = 'message'; msg.innerText = 'Saving...';

    const payload = {
        title, authors,
        venue: document.getElementById('pub-venue').value.trim() || null,
        year: parseInt(document.getElementById('pub-year').value) || null,
        citations: parseInt(document.getElementById('pub-citations').value) || 0,
        doi: document.getElementById('pub-doi').value.trim() || null,
        bibtex: document.getElementById('pub-bibtex').value.trim() || null,
    };
    try {
        if (id) {
            const { data, error } = await supabase.from('publications').update(payload).eq('id', id).select('id');
            if (error) throw error;
            assertChanged(data);
        } else {
            const { error } = await supabase.from('publications').insert([payload]);
            if (error) throw error;
        }
        msg.className = 'message success'; msg.innerText = 'Publication saved.';
        fetchAdminPubs();
        fetchPublicationsPublic();
        setTimeout(() => window.hidePubEditor(), 1500);
    } catch (e) {
        msg.className = 'message error'; msg.innerText = e.message;
    }
};

window.deleteAdminPub = async function (id) {
    if (!confirm('Delete this publication? This cannot be undone.')) return;
    const { data, error } = await supabase.from('publications').delete().eq('id', id).select('id');
    if (error) return alert('Delete failed: ' + error.message);
    if (!data?.length) return alert('Delete failed: your account may not have editor access.');
    fetchAdminPubs();
    fetchPublicationsPublic();
};

/* --- Admin Members Management --- */
window.adminMembers = [];

async function fetchAdminMembers() {
    try {
        const [{ data, error }, { data: relations }] = await Promise.all([
            supabase.from('members').select('*').order('role_category').order('name'),
            supabase.from('member_directors').select('*')
        ]);
        if (error) throw error;
        window.adminMembers = data || [];
        window.adminRelations = relations || [];

        const dirMap = {};
        window.adminMembers.filter(m => m.role_category === 'director').forEach(d => { dirMap[d.id] = d.name; });
        const memberDirNames = {};
        (relations || []).forEach(r => {
            if (!memberDirNames[r.member_id]) memberDirNames[r.member_id] = [];
            if (dirMap[r.director_id]) memberDirNames[r.member_id].push(dirMap[r.director_id]);
        });

        const tbody = document.getElementById('admin-member-tbody');
        if (!window.adminMembers.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="cell-empty">No people yet.</td></tr>';
            return;
        }
        const roleLabel = { director: 'Co-Director', collaborator: 'External Collaborator', phd: 'PhD', ms: 'MS', alumni: 'Alumni' };
        tbody.innerHTML = window.adminMembers.map(m => {
            const supervisors = memberDirNames[m.id];
            const supCell = supervisors?.length
                ? supervisors.map(n => `<span class="tag">${esc(n)}</span>`).join(' ')
                : '<span class="cell-muted">—</span>';
            return `
            <tr>
                <td class="cell-title">
                    <div class="cell-person">
                        <img src="${esc(safeUrl(m.image_url) || avatarFallback(m.name, 80))}" alt="">
                        ${esc(m.name)}
                    </div>
                </td>
                <td><span class="badge">${esc(roleLabel[m.role_category] || m.role_category || '—')}</span></td>
                <td>${m.role_category === 'director' ? '<span class="cell-muted">—</span>' : supCell}</td>
                <td class="cell-actions">
                    <button class="btn btn-ghost btn-sm" onclick="window.editAdminMember('${m.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm btn-danger" onclick="window.deleteAdminMember('${m.id}')">Delete</button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        document.getElementById('admin-member-tbody').innerHTML = '<tr><td colspan="4" class="cell-empty">People could not be loaded.</td></tr>';
    }
}

function renderSupervisorCheckboxes(selectedIds = []) {
    const directors = (window.adminMembers || []).filter(m => m.role_category === 'director');
    const container = document.getElementById('supervisor-checkboxes');
    if (!container) return;
    if (!directors.length) {
        container.innerHTML = '<span class="form-hint">No co-directors added yet.</span>';
        return;
    }
    container.innerHTML = directors.map(d => {
        const checked = selectedIds.includes(d.id) ? 'checked' : '';
        const avatar = safeUrl(d.image_url) || avatarFallback(d.name, 80);
        return `
        <label class="choice-chip">
            <input type="checkbox" name="supervisor" value="${esc(d.id)}" ${checked}>
            <img src="${esc(avatar)}" alt="">
            <span>${esc(d.name)}</span>
        </label>`;
    }).join('');
}
// Show/hide supervisor field based on role
window.onRoleChange = function (role) {
    const group = document.getElementById('supervisor-group');
    if (!group) return;
    group.style.display = (role === 'director' || role === 'collaborator' || role === '') ? 'none' : 'block';
    if (role !== 'director' && role !== 'collaborator' && role !== '') renderSupervisorCheckboxes();
};

window.showMemberEditor = function () {
    document.getElementById('admin-member-list').classList.add('hidden');
    document.getElementById('admin-member-editor').classList.remove('hidden');
    document.getElementById('edit-member-id').value = '';
    document.getElementById('member-name').value = '';
    document.getElementById('member-title').value = '';
    document.getElementById('member-role').value = '';
    document.getElementById('member-affiliation').value = '';
    document.getElementById('member-email').value = '';
    document.getElementById('member-contact').value = '';
    document.getElementById('member-website').value = '';
    document.getElementById('member-linkedin').value = '';
    document.getElementById('member-google-scholar').value = '';
    document.getElementById('member-github').value = '';
    document.getElementById('member-image-file').value = '';
    document.getElementById('member-editor-heading').innerText = 'Add Person';
    document.getElementById('member-msg').innerText = '';
    document.getElementById('supervisor-group').style.display = 'none';
};

window.hideMemberEditor = function () {
    document.getElementById('admin-member-list').classList.remove('hidden');
    document.getElementById('admin-member-editor').classList.add('hidden');
};

window.editAdminMember = function (id) {
    const m = window.adminMembers.find(x => x.id === id);
    if (!m) return;
    window.showMemberEditor();
    document.getElementById('member-editor-heading').innerText = 'Edit Person';
    document.getElementById('edit-member-id').value = m.id;
    document.getElementById('member-name').value = m.name || '';
    document.getElementById('member-title').value = m.title || '';
    document.getElementById('member-role').value = m.role_category || '';
    document.getElementById('member-affiliation').value = m.affiliation || '';
    document.getElementById('member-email').value = m.email || '';
    document.getElementById('member-contact').value = m.contact_number || '';
    document.getElementById('member-website').value = m.website_url || '';
    document.getElementById('member-linkedin').value = m.linkedin_url || '';
    document.getElementById('member-google-scholar').value = m.google_scholar_url || '';
    document.getElementById('member-github').value = m.github_url || '';

    // Load supervisor checkboxes if not a director or collaborator
    if (m.role_category !== 'director' && m.role_category !== 'collaborator') {
        const currentDirectorIds = (window.adminRelations || [])
            .filter(r => r.member_id === id)
            .map(r => r.director_id);
        document.getElementById('supervisor-group').style.display = 'block';
        renderSupervisorCheckboxes(currentDirectorIds);
    }
};

window.saveMember = async function () {
    const id = document.getElementById('edit-member-id').value;
    const name = document.getElementById('member-name').value.trim();
    const role = document.getElementById('member-role').value;
    const msg = document.getElementById('member-msg');

    if (!name) { msg.className = 'message error'; msg.innerText = 'Name is required.'; return; }
    if (!role) { msg.className = 'message error'; msg.innerText = 'Role is required.'; return; }
    msg.className = 'message'; msg.innerText = 'Saving...';

    const fileInput = document.getElementById('member-image-file');
    const payload = {
        name,
        title: document.getElementById('member-title').value.trim() || null,
        role_category: role,
        affiliation: document.getElementById('member-affiliation').value.trim() || null,
        email: document.getElementById('member-email').value.trim() || null,
        contact_number: document.getElementById('member-contact').value.trim() || null,
        website_url: document.getElementById('member-website').value.trim() || null,
        linkedin_url: document.getElementById('member-linkedin').value.trim() || null,
        google_scholar_url: document.getElementById('member-google-scholar').value.trim() || null,
        github_url: document.getElementById('member-github').value.trim() || null,
    };

    try {
        if (fileInput.files.length > 0) payload.image_url = await uploadImage('member', fileInput.files[0]);

        let memberId = id;
        if (id) {
            const { data, error } = await supabase.from('members').update(payload).eq('id', id).select('id');
            if (error) throw error;
            assertChanged(data);
        } else {
            const { data: inserted, error } = await supabase.from('members').insert([payload]).select().single();
            if (error) throw error;
            memberId = inserted.id;
        }

        // Sync junction table (skip for directors and collaborators)
        if (role !== 'director' && role !== 'collaborator') {
            const checked = Array.from(
                document.querySelectorAll('#supervisor-checkboxes input[type=checkbox]:checked')
            ).map(cb => cb.value);

            // Delete existing then re-insert
            const { error: delErr } = await supabase.from('member_directors').delete().eq('member_id', memberId);
            if (delErr) throw delErr;
            if (checked.length) {
                const { error: insErr } = await supabase.from('member_directors').insert(
                    checked.map(dirId => ({ member_id: memberId, director_id: dirId }))
                );
                if (insErr) throw insErr;
            }
        } else {
            // Directors and collaborators have no supervisors — clean up any stale rows
            const { error: delErr } = await supabase.from('member_directors').delete().eq('member_id', memberId);
            if (delErr) throw delErr;
        }

        msg.className = 'message success'; msg.innerText = 'Saved.';
        fetchAdminMembers();
        fetchMembersPublic();
        setTimeout(() => window.hideMemberEditor(), 1500);
    } catch (e) {
        msg.className = 'message error'; msg.innerText = e.message;
    }
};

window.deleteAdminMember = async function (id) {
    if (!confirm('Delete this person? This cannot be undone.')) return;
    const { data, error } = await supabase.from('members').delete().eq('id', id).select('id');
    if (error) return alert('Delete failed: ' + error.message);
    if (!data?.length) return alert('Delete failed: your account may not have editor access.');
    fetchAdminMembers();
    fetchMembersPublic();
};


/* --- Admin Jobs Management --- */
window.adminJobs = [];

async function fetchAdminJobs() {
    try {
        const { data, error } = await supabase.from('job_openings').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        window.adminJobs = data || [];

        // Fix: Always ensure members are loaded BEFORE checking if adminJobs is empty, 
        // otherwise the dropdown won't populate if you add the very first job!
        // We also fetch '*' so that 'role_category' is included in the filtering logic.
        if (!window.adminMembers || window.adminMembers.length === 0) {
            const { data: memData } = await supabase.from('members').select('*');
            window.adminMembers = memData || [];
        }

        const tbody = document.getElementById('admin-job-tbody');
        if (!window.adminJobs.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="cell-empty">No positions yet.</td></tr>';
            return;
        }

        tbody.innerHTML = window.adminJobs.map(j => {
            const advisorName = window.adminMembers.find(m => m.id === j.advisor_id)?.name || 'General';
            return `
            <tr>
                <td class="cell-title">${esc(j.title)}</td>
                <td class="cell-muted">${esc(advisorName)}</td>
                <td>${j.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge">Hidden</span>'}</td>
                <td class="cell-actions">
                    <button class="btn btn-ghost btn-sm" onclick="window.editAdminJob('${j.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm btn-danger" onclick="window.deleteAdminJob('${j.id}')">Delete</button>
                </td>
            </tr>
        `}).join('');
    } catch (e) {
        document.getElementById('admin-job-tbody').innerHTML = '<tr><td colspan="4" class="cell-empty">Positions could not be loaded.</td></tr>';
    }
}

function populateJobAdvisors(selectedId = '') {
    const select = document.getElementById('job-advisor');
    const directors = window.adminMembers.filter(m => m.role_category === 'director');
    select.innerHTML = '<option value="">Select an advisor...</option>' +
        directors.map(d => `<option value="${esc(d.id)}" ${d.id === selectedId ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
}

window.showJobEditor = function () {
    document.getElementById('admin-job-list').classList.add('hidden');
    document.getElementById('admin-job-editor').classList.remove('hidden');
    document.getElementById('edit-job-id').value = '';
    document.getElementById('job-title').value = '';
    document.getElementById('job-active').checked = true;
    populateJobAdvisors();
    if (window.jobQuillEditor) window.jobQuillEditor.root.innerHTML = '';
    document.getElementById('job-editor-heading').innerText = 'Add Job Opening';
    document.getElementById('job-msg').innerText = '';
};

window.hideJobEditor = function () {
    document.getElementById('admin-job-list').classList.remove('hidden');
    document.getElementById('admin-job-editor').classList.add('hidden');
};

window.editAdminJob = function (id) {
    const job = window.adminJobs.find(x => x.id === id);
    if (!job) return;

    document.getElementById('admin-job-list').classList.add('hidden');
    document.getElementById('admin-job-editor').classList.remove('hidden');
    document.getElementById('job-editor-heading').innerText = 'Edit Job Opening';
    document.getElementById('edit-job-id').value = job.id;
    document.getElementById('job-title').value = job.title || '';
    document.getElementById('job-active').checked = !!job.is_active;
    populateJobAdvisors(job.advisor_id);

    if (window.jobQuillEditor) {
        window.jobQuillEditor.root.innerHTML = safeHtml(job.description);
    }
};

window.saveJob = async function () {
    const id = document.getElementById('edit-job-id').value;
    const title = document.getElementById('job-title').value.trim();
    const msg = document.getElementById('job-msg');

    if (!title) { msg.className = 'message error'; msg.innerText = 'Title is required.'; return; }

    const descriptionHtml = window.jobQuillEditor ? window.jobQuillEditor.root.innerHTML.trim() : '';
    if (!descriptionHtml || descriptionHtml === '<p><br></p>') {
        msg.className = 'message error'; msg.innerText = 'Description is required.'; return;
    }

    msg.className = 'message'; msg.innerText = 'Saving...';

    const payload = {
        title,
        description: descriptionHtml,
        advisor_id: document.getElementById('job-advisor').value || null,
        is_active: document.getElementById('job-active').checked
    };

    try {
        if (id) {
            const { data, error } = await supabase.from('job_openings').update(payload).eq('id', id).select('id');
            if (error) throw error;
            assertChanged(data);
        } else {
            const { error } = await supabase.from('job_openings').insert([payload]);
            if (error) throw error;
        }
        msg.className = 'message success'; msg.innerText = 'Position saved.';
        fetchAdminJobs();
        fetchJobsPublic();
        setTimeout(() => window.hideJobEditor(), 1500);
    } catch (e) {
        msg.className = 'message error'; msg.innerText = e.message;
    }
};

window.deleteAdminJob = async function (id) {
    if (!confirm('Delete this job opening? This cannot be undone.')) return;
    const { data, error } = await supabase.from('job_openings').delete().eq('id', id).select('id');
    if (error) return alert('Delete failed: ' + error.message);
    if (!data?.length) return alert('Delete failed: your account may not have editor access.');
    fetchAdminJobs();
    fetchJobsPublic();
};


/* --- Admin News Management --- */
window.adminNews = [];

async function fetchAdminNews() {
    try {
        const { data, error } = await supabase.from('news').select('*').order('year', { ascending: false }).order('created_at', { ascending: false });
        if (error) throw error;
        window.adminNews = data || [];
        const tbody = document.getElementById('admin-news-tbody');
        if (!window.adminNews.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="cell-empty">No news yet.</td></tr>';
            return;
        }
        tbody.innerHTML = window.adminNews.map(n => `
            <tr>
                <td class="cell-title">${esc(n.title)}</td>
                <td class="cell-muted">${esc((n.month ? n.month + ' ' : '') + (n.year || '—'))}</td>
                <td>${n.is_featured ? '<span class="badge badge-featured">Featured</span>' : '<span class="cell-muted">—</span>'}</td>
                <td class="cell-actions">
                    <button class="btn btn-ghost btn-sm" onclick="window.editAdminNews('${n.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm btn-danger" onclick="window.deleteAdminNews('${n.id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        document.getElementById('admin-news-tbody').innerHTML = '<tr><td colspan="4" class="cell-empty">News could not be loaded.</td></tr>';
    }
}

window.showNewsEditor = function () {
    document.getElementById('admin-news-list').classList.add('hidden');
    document.getElementById('admin-news-editor').classList.remove('hidden');
    document.getElementById('edit-news-id').value = '';
    document.getElementById('news-title').value = '';
    document.getElementById('news-description').value = '';
    document.getElementById('news-month').value = '';
    document.getElementById('news-year').value = '';
    document.getElementById('news-tags').value = '';
    document.getElementById('news-featured').checked = false;
    document.getElementById('news-editor-heading').innerText = 'Add News Item';
    document.getElementById('news-msg').innerText = '';
    document.getElementById('news-image-file').value = '';
    document.getElementById('news-image-preview').style.display = 'none';
    if (window.newsQuillEditor) window.newsQuillEditor.root.innerHTML = '';
};

window.hideNewsEditor = function () {
    document.getElementById('admin-news-list').classList.remove('hidden');
    document.getElementById('admin-news-editor').classList.add('hidden');
};

window.previewNewsImage = function (input) {
    const prev = document.getElementById('news-image-preview');
    const prevImg = document.getElementById('news-image-preview-img');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { prevImg.src = e.target.result; prev.style.display = 'block'; };
        reader.readAsDataURL(input.files[0]);
    } else {
        prev.style.display = 'none';
    }
};

window.editAdminNews = function (id) {
    const n = window.adminNews.find(x => x.id === id);
    if (!n) return;
    window.showNewsEditor();
    document.getElementById('news-editor-heading').innerText = 'Edit News Item';
    document.getElementById('edit-news-id').value = n.id;
    document.getElementById('news-title').value = n.title || '';
    document.getElementById('news-month').value = n.month || '';
    document.getElementById('news-year').value = n.year || '';
    document.getElementById('news-tags').value = (n.tags || []).join(', ');
    document.getElementById('news-featured').checked = !!n.is_featured;

    if (window.newsQuillEditor) {
        const desc = n.description || '';
        window.newsQuillEditor.root.innerHTML = desc.trim().startsWith('<') ? safeHtml(desc) : (desc ? `<p>${esc(desc)}</p>` : '');
    }

    if (safeUrl(n.image_url)) {
        const prev = document.getElementById('news-image-preview');
        const prevImg = document.getElementById('news-image-preview-img');
        prevImg.src = safeUrl(n.image_url);
        prev.style.display = 'block';
    }
};

window.saveNews = async function () {
    const id = document.getElementById('edit-news-id').value;
    const title = document.getElementById('news-title').value.trim();
    const msg = document.getElementById('news-msg');

    if (!title) { msg.className = 'message error'; msg.innerText = 'Title is required.'; return; }
    msg.className = 'message'; msg.innerText = 'Saving...';
    const tagsRaw = document.getElementById('news-tags').value.trim();

    const descriptionHtml = window.newsQuillEditor ? window.newsQuillEditor.root.innerHTML.trim() : '';
    const descriptionValue = descriptionHtml === '<p><br></p>' ? null : (descriptionHtml || null);

    const fileInput = document.getElementById('news-image-file');
    const payload = {
        title,
        description: descriptionValue,
        month: document.getElementById('news-month').value.trim() || null,
        year: parseInt(document.getElementById('news-year').value) || null,
        tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [],
        is_featured: document.getElementById('news-featured').checked,
    };

    try {
        if (fileInput && fileInput.files.length > 0) payload.image_url = await uploadImage('news', fileInput.files[0]);

        if (id) {
            const { data, error } = await supabase.from('news').update(payload).eq('id', id).select('id');
            if (error) throw error;
            assertChanged(data);
        } else {
            const { error } = await supabase.from('news').insert([payload]);
            if (error) throw error;
        }
        msg.className = 'message success'; msg.innerText = 'News item saved.';
        fetchAdminNews();
        fetchNewsPublic();
        setTimeout(() => window.hideNewsEditor(), 1500);
    } catch (e) {
        msg.className = 'message error'; msg.innerText = e.message;
    }
};

window.deleteAdminNews = async function (id) {
    if (!confirm('Delete this news item? This cannot be undone.')) return;
    const { data, error } = await supabase.from('news').delete().eq('id', id).select('id');
    if (error) return alert('Delete failed: ' + error.message);
    if (!data?.length) return alert('Delete failed: your account may not have editor access.');
    fetchAdminNews();
    fetchNewsPublic();
};
