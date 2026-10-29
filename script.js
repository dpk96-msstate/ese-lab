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
const TAG_COLORS = ['#eff6ff', '#f0fdf4', '#fef9c3', '#fdf2f8', '#fff7ed'];
const TAG_TEXT = ['#1d4ed8', '#15803d', '#854d0e', '#9d174d', '#c2410c'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
    return new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '';
}

function excerptOf(html, length) {
    const text = htmlToText(html).trim();
    return text.length > length ? text.substring(0, length) + '…' : text;
}

function readTimeOf(html) {
    const words = htmlToText(html).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200));
}

function avatarFallback(name, size = 200) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Lab')}&size=${size}&background=dbeafe&color=1d4ed8&bold=true`;
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
document.addEventListener('DOMContentLoaded', async () => {
    initSmoothScroll();
    initHeaderEffects();

    await fetchMembersPublic();
    fetchJobsPublic();
    fetchBlogsPublic();
    fetchNewsPublic();
    fetchPublicationsPublic();

    // People filter buttons — filter all .member-card-v elements
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const filter = this.dataset.filter;

            const dirWrapper = document.getElementById('directors-wrapper');
            const colWrapper = document.getElementById('collaborators-wrapper');
            const stuWrapper = document.getElementById('students-wrapper');

            // Show/hide wrappers based on broad category
            if (filter === 'all') {
                if (dirWrapper) dirWrapper.style.display = '';
                if (colWrapper) colWrapper.style.display = '';
                if (stuWrapper) stuWrapper.style.display = '';
            } else if (filter === 'director') {
                if (dirWrapper) dirWrapper.style.display = '';
                if (colWrapper) colWrapper.style.display = 'none';
                if (stuWrapper) stuWrapper.style.display = 'none';
            } else if (filter === 'collaborator') {
                if (dirWrapper) dirWrapper.style.display = 'none';
                if (colWrapper) colWrapper.style.display = '';
                if (stuWrapper) stuWrapper.style.display = 'none';
            } else {
                if (dirWrapper) dirWrapper.style.display = 'none';
                if (colWrapper) colWrapper.style.display = 'none';
                if (stuWrapper) stuWrapper.style.display = '';
            }

            // Show/hide individual student cards
            if (stuWrapper) {
                const cards = stuWrapper.querySelectorAll('.member-card-v');
                let anyVisible = false;
                cards.forEach(c => {
                    if (filter === 'all' || c.dataset.role === filter) {
                        c.style.display = '';
                        anyVisible = true;
                    } else {
                        c.style.display = 'none';
                    }
                });
                stuWrapper.style.display = anyVisible ? '' : 'none';
            }
        });
    });

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

    // Submit the login form with Enter
    ['admin-email', 'admin-password'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') window.handleLogin();
        });
    });

    // Init Admin Editors
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
});


// ==========================================
// PUBLIC UI: NAVIGATION & VIEWS
// ==========================================
window.toggleMobileMenu = function () {
    const navList = document.querySelector('.nav-list');
    if (navList) navList.classList.toggle('active');
};

window.showView = function (view) {
    const allViews = ['home-view', 'blog-reader-view', 'all-news-view', 'all-publications-view', 'all-blogs-view'];
    allViews.forEach(v => document.getElementById(v)?.classList.add('hidden'));

    if (view === 'home') {
        document.getElementById('home-view').classList.remove('hidden');
        window.scrollTo(0, 0);
    } else if (view === 'blog-reader') {
        document.getElementById('blog-reader-view').classList.remove('hidden');
        window.scrollTo(0, 0);
    } else if (view === 'all-news') {
        document.getElementById('all-news-view').classList.remove('hidden');
        renderAllNews();
        window.scrollTo(0, 0);
    } else if (view === 'all-publications') {
        document.getElementById('all-publications-view').classList.remove('hidden');
        renderAllPublications();
        window.scrollTo(0, 0);
    } else if (view === 'all-blogs') {
        document.getElementById('all-blogs-view').classList.remove('hidden');
        window.renderAllBlogs();
        window.scrollTo(0, 0);
    }
};

window.copyUrl = function () {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
};

// ==========================================
// RENDERERS & DATA FETCHING
// ==========================================
function renderBlogCard(post) {
    const readTime = readTimeOf(post.content);
    const dateStr = new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const excerpt = excerptOf(post.content, 150);
    const cover = safeUrl(post.image_url);

    return `
    <article class="blog-card" onclick="window.openBlogReader('${esc(post.id)}')">
        ${cover ? `<div class="blog-image"><img src="${esc(cover)}" alt="Cover" loading="lazy"></div>` : '<div class="blog-image"><div style="color:var(--accent);opacity:0.4;font-size:3rem;"><i class="fa-solid fa-pen-nib"></i></div></div>'}
        <div class="blog-content">
            <div class="blog-meta">
                <span>${esc(post.category || 'Research')}</span>
                <span>${readTime} min read</span>
            </div>
            <h3 class="blog-title">${esc(post.title)}</h3>
            <p class="blog-excerpt">${esc(excerpt)}</p>
            <div class="blog-footer">
                <div class="blog-author-avatar">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name || 'Lab')}&background=f8fafc&color=0f172a" alt="">
                </div>
                <div class="blog-author-info">
                    <div class="blog-author-name">${esc(post.author_name || 'Lab Member')}</div>
                    <div style="color: var(--text-muted); font-size: 0.75rem;">${dateStr}</div>
                </div>
            </div>
        </div>
    </article>
    `;
}

async function fetchBlogsPublic() {
    try {
        const { data, error } = await supabase.from('blogs').select('*').eq('status', 'published').order('created_at', { ascending: false });
        if (error) throw error;
        loadedBlogs = data || [];

        const grid = document.getElementById('public-blog-grid');
        if (loadedBlogs.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No articles published yet.</div>';
            document.getElementById('blog-view-all-wrapper').style.display = 'none';
            return;
        }

        const LIMIT = 3;
        grid.innerHTML = loadedBlogs.slice(0, LIMIT).map(renderBlogCard).join('');
        const wrapper = document.getElementById('blog-view-all-wrapper');
        if (wrapper) wrapper.style.display = loadedBlogs.length <= LIMIT ? 'none' : '';
    } catch (e) {
        document.getElementById('public-blog-grid').innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Blog system initializing...</div>';
    }
}

window.renderAllBlogs = function () {
    const grid = document.getElementById('all-blogs-grid');
    if (!grid) return;
    grid.innerHTML = loadedBlogs.map(renderBlogCard).join('');
};

window.openBlogReader = function (id) {
    const post = loadedBlogs.find(b => b.id === id);
    if (!post) return;

    document.getElementById('reader-title').innerText = post.title;
    document.getElementById('reader-category').innerText = post.category || 'Article';
    document.getElementById('reader-content').innerHTML = safeHtml(post.content);
    const d = new Date(post.created_at);
    document.getElementById('reader-date').innerText = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    document.getElementById('reader-read-time').innerHTML = `<i class="fa-regular fa-clock"></i> ${readTimeOf(post.content)} min read`;

    const coverEl = document.getElementById('reader-cover');
    const cover = safeUrl(post.image_url);
    if (cover) { coverEl.src = cover; coverEl.classList.remove('hidden'); }
    else { coverEl.classList.add('hidden'); }

    document.getElementById('reader-author-name').innerText = post.author_name || 'Lab Member';
    document.getElementById('reader-author-img').src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(post.author_name || 'Lab') + '&background=f8fafc&color=0f172a';
    window.showView('blog-reader');
};

function renderTagsHtml(tags) {
    return (tags || []).map((t, i) => `<span class="news-tag" style="background:${TAG_COLORS[i % TAG_COLORS.length]};color:${TAG_TEXT[i % TAG_TEXT.length]};">${esc(t)}</span>`).join('');
}

function renderNewsCard(n) {
    const dateStr = [n.month, n.year].filter(Boolean).join(' ') || '';
    const excerpt = excerptOf(n.description, 120);
    const featuredBadge = n.is_featured ? '<div style="position:absolute;top:0;right:1rem;background:var(--accent);color:white;font-size:0.7rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:0 0 6px 6px;letter-spacing:0.05em;z-index:2;">FEATURED</div>' : '';
    const image = safeUrl(n.image_url);
    const imagePart = image ? `<div class="news-card-image"><img src="${esc(image)}" alt="" loading="lazy"></div>` : `<div class="news-card-image"><div class="news-card-image-placeholder"><i class="fa-regular fa-newspaper"></i></div></div>`;

    return `
    <div class="news-card${n.is_featured ? ' featured-card' : ''}" onclick="window.openModal('news', '${esc(n.id)}')">
        ${featuredBadge}
        ${imagePart}
        <div class="news-card-body">
            ${dateStr ? `<div class="news-card-date"><i class="fa-regular fa-calendar"></i>${esc(dateStr)}</div>` : ''}
            <div class="news-card-title">${esc(n.title)}</div>
            ${excerpt ? `<div class="news-card-excerpt">${esc(excerpt)}</div>` : ''}
            <div class="news-card-footer">
                <div style="display:flex;flex-wrap:wrap;gap:0.35rem;">${renderTagsHtml(n.tags)}</div>
                <button class="news-read-btn" onclick="event.stopPropagation();window.openModal('news', '${esc(n.id)}')">
                    Read Story <i class="fa-solid fa-arrow-right" style="font-size:0.75rem;"></i>
                </button>
            </div>
        </div>
    </div>`;
}

async function fetchNewsPublic() {
    try {
        const { data, error } = await supabase.from('news').select('*').order('year', { ascending: false }).order('created_at', { ascending: false });
        if (error) throw error;

        const grid = document.getElementById('public-news-grid');
        if (!data || data.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No news items yet.</div>';
            document.getElementById('news-view-all-wrapper').style.display = 'none';
            return;
        }

        allNewsItems = [...data].sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0));
        const LIMIT = 3;
        grid.innerHTML = allNewsItems.slice(0, LIMIT).map(renderNewsCard).join('');

        const wrapper = document.getElementById('news-view-all-wrapper');
        if (wrapper) wrapper.style.display = allNewsItems.length <= LIMIT ? 'none' : '';
    } catch (e) {
        document.getElementById('public-news-grid').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);">News section initializing...</div>';
    }
}

function renderAllNews() {
    const grid = document.getElementById('all-news-grid');
    if (grid) grid.innerHTML = allNewsItems.map(renderNewsCard).join('');
}

// Universal modal for News and Jobs
window.openModal = function (type, id) {
    const metaIcon = document.querySelector('#modal-meta i');
    const metaText = document.getElementById('modal-meta-text');
    const titleEl = document.getElementById('modal-title');
    const tagsEl = document.getElementById('modal-tags');
    const descEl = document.getElementById('modal-description');
    const imgEl = document.getElementById('modal-img');

    if (type === 'news') {
        const n = allNewsItems.find(x => x.id === id);
        if (!n) return;
        metaIcon.className = 'fa-regular fa-calendar';
        metaText.innerText = [n.month, n.year].filter(Boolean).join(' ') || '';
        titleEl.innerText = n.title;
        tagsEl.innerHTML = renderTagsHtml(n.tags);

        if (n.description) descEl.innerHTML = n.description.trim().startsWith('<') ? safeHtml(n.description) : `<p>${esc(n.description)}</p>`;
        else descEl.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">No further details available.</p>';

        const image = safeUrl(n.image_url);
        if (image) { imgEl.src = image; imgEl.classList.remove('hidden'); }
        else imgEl.classList.add('hidden');
    } else if (type === 'job') {
        const job = allJobs.find(x => x.id === id);
        if (!job) return;
        const advisor = loadedMembers.find(m => m.id === job.advisor_id);

        metaIcon.className = 'fa-regular fa-clock';
        metaText.innerText = `Posted ${new Date(job.created_at).toLocaleDateString()}`;
        titleEl.innerText = job.title;

        tagsEl.innerHTML = `<span class="news-tag" style="background:#eff6ff;color:#1d4ed8;">Open Position</span>`;
        if (advisor) {
            tagsEl.innerHTML += `<span class="news-tag" style="background:#f3e8ff;color:#7e22ce;"><i class="fa-solid fa-user-tie" style="margin-right:4px;"></i>${esc(advisor.name)}</span>`;
        }

        descEl.innerHTML = job.description ? safeHtml(job.description) : '<p>No description provided.</p>';
        imgEl.classList.add('hidden'); // Jobs generally don't have images in this schema
    }

    document.getElementById('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeModal = function () {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
};


async function fetchJobsPublic() {
    try {
        const { data, error } = await supabase.from('job_openings').select('*').eq('is_active', true).order('created_at', { ascending: false });
        if (error) throw error;
        allJobs = data || [];

        const grid = document.getElementById('public-jobs-grid');
        if (allJobs.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem; border: 1px dashed var(--border); border-radius: var(--radius-md);">No open positions currently available. Please check back later.</div>';
            return;
        }

        grid.innerHTML = allJobs.map(job => {
            const excerpt = excerptOf(job.description, 160);
            const advisor = loadedMembers.find(m => m.id === job.advisor_id);
            const advisorName = advisor ? advisor.name : 'SERA Lab';

            return `
            <div class="job-card" onclick="window.openModal('job', '${esc(job.id)}')">
                <div class="job-card-header">
                    <div class="job-card-meta">
                        <i class="fa-solid fa-user-tie"></i> Hiring Advisor: ${esc(advisorName)}
                    </div>
                    <h3 class="job-card-title">${esc(job.title)}</h3>
                </div>
                <div class="job-card-body">
                    <div class="job-card-excerpt">${esc(excerpt)}</div>
                    <button class="job-read-btn" onclick="event.stopPropagation(); window.openModal('job', '${esc(job.id)}')">
                        View Details & Apply <i class="fa-solid fa-arrow-right" style="font-size:0.75rem;"></i>
                    </button>
                </div>
            </div>`;
        }).join('');

    } catch (e) {
        document.getElementById('public-jobs-grid').innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Error loading jobs.</div>';
    }
}


async function fetchMembersPublic() {
    const [{ data: members, error: mErr }, { data: relations }] = await Promise.all([
        supabase.from('members').select('*').order('name'),
        supabase.from('member_directors').select('*')
    ]);
    if (mErr || !members) {
        const dirGrid = document.getElementById('co-directors-grid');
        if (dirGrid) dirGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);">Could not load lab members. Please try again later.</div>';
        return;
    }

    loadedMembers = members; // Store for jobs to access

    const roleLabel = { director: 'Co-Director', collaborator: 'External Collaborator', phd: 'PhD Student', ms: 'MS Student', alumni: 'Alumni' };
    const roleCss = { director: 'role-director', collaborator: 'role-collaborator', phd: 'role-phd', ms: 'role-ms', alumni: 'role-alumni' };

    const avatarSrc = (m) => safeUrl(m.image_url) || avatarFallback(m.name);

    const socialLinks = (m) => {
        const link = (url, title, color, icon) => {
            const href = safeUrl(url);
            return href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${title}" class="member-social-link" style="--icon-color:${color};"><i class="${icon}"></i></a>` : '';
        };
        const links = [
            link(m.website_url, 'Personal Website', '#0ea5e9', 'fa-solid fa-globe'),
            link(m.linkedin_url, 'LinkedIn', '#0077b5', 'fa-brands fa-linkedin-in'),
            link(m.google_scholar_url, 'Google Scholar', '#4285f4', 'fa-brands fa-google'),
            link(m.github_url, 'GitHub', '#24292f', 'fa-brands fa-github'),
        ].filter(Boolean);
        if (!links.length) return '';
        return `<div class="member-social-links-v">${links.join('')}</div>`;
    };

    // Precompute a map of member_id to their advisor names
    const dirMap = {};
    const directors = members.filter(m => m.role_category === 'director');
    directors.forEach(d => { dirMap[d.id] = d.name; });

    const memberDirNames = {};
    (relations || []).forEach(r => {
        if (!memberDirNames[r.member_id]) memberDirNames[r.member_id] = [];
        if (dirMap[r.director_id]) memberDirNames[r.member_id].push(dirMap[r.director_id]);
    });

    // Universal vertical card renderer
    const renderCard = (m) => {
        const label = roleLabel[m.role_category] || m.role_category;
        const css = roleCss[m.role_category] || 'role-default';
        const displayTitle = m.title || label;

        let advisorHtml = '';
        if (m.role_category !== 'director' && m.role_category !== 'collaborator') {
            const supervisors = memberDirNames[m.id];
            if (supervisors && supervisors.length) {
                advisorHtml = `<div class="member-affiliation-v"><i class="fa-solid fa-user-tie" style="font-size:0.7rem;margin-right:4px;opacity:0.6;"></i>Advised by ${esc(supervisors.join(', '))}</div>`;
            }
        }

        let contactHtml = '';
        if (m.email || m.contact_number) {
            contactHtml += `<div class="member-contact-info">`;
            if (m.email) contactHtml += `<a href="mailto:${esc(encodeURI(m.email))}" class="member-contact-link"><i class="fa-solid fa-envelope" style="margin-right:4px;opacity:0.7;"></i>${esc(m.email)}</a>`;
            if (m.contact_number) contactHtml += `<a href="tel:${esc(m.contact_number.replace(/[^\d+]/g, ''))}" class="member-contact-link"><i class="fa-solid fa-phone" style="margin-right:4px;opacity:0.7;"></i>${esc(m.contact_number)}</a>`;
            contactHtml += `</div>`;
        }

        let borderClass = '';
        if (m.role_category === 'director') borderClass = 'border-director';
        if (m.role_category === 'collaborator') borderClass = 'border-collaborator';

        return `
        <div class="member-card-v ${borderClass}" data-role="${esc(m.role_category)}">
            <div class="member-avatar-v">
                <img src="${esc(avatarSrc(m))}" alt="${esc(m.name)}" loading="lazy"
                     data-fallback="${esc(avatarFallback(m.name))}" onerror="this.onerror=null;this.src=this.dataset.fallback">
            </div>
            <div class="member-info-v">
                <span class="member-role-badge ${css}">${esc(label)}</span>
                <div class="member-name-v">${esc(m.name)}</div>
                <div class="member-title-v">${esc(displayTitle)}</div>
                ${m.affiliation ? `<div class="member-affiliation-v"><i class="fa-solid fa-building-columns" style="font-size:0.7rem;margin-right:4px;opacity:0.6;"></i>${esc(m.affiliation)}</div>` : ''}
                ${advisorHtml}
                ${contactHtml}
                ${socialLinks(m)}
            </div>
        </div>`;
    };

    const collaborators = members.filter(m => m.role_category === 'collaborator');
    const students = members.filter(m => m.role_category !== 'director' && m.role_category !== 'collaborator');

    // Render directors row
    const dirGrid = document.getElementById('co-directors-grid');
    if (dirGrid) {
        if (directors.length) {
            dirGrid.innerHTML = directors.map(d => renderCard(d)).join('');
            document.getElementById('directors-wrapper').style.display = '';
        } else {
            document.getElementById('directors-wrapper').style.display = 'none';
        }
    }

    const colGrid = document.getElementById('collaborators-grid');
    if (colGrid) {
        if (collaborators.length) {
            colGrid.innerHTML = collaborators.map(c => renderCard(c)).join('');
            document.getElementById('collaborators-wrapper').style.display = '';
        } else {
            document.getElementById('collaborators-wrapper').style.display = 'none';
        }
    }

    // Render all students and alumni together
    const studentsGrid = document.getElementById('students-grid');
    if (studentsGrid) {
        if (students.length) {
            studentsGrid.innerHTML = students.map(s => renderCard(s)).join('');
            document.getElementById('students-wrapper').style.display = '';
        } else {
            document.getElementById('students-wrapper').style.display = 'none';
        }
    }
}

function renderPubItem(p) {
    const doiHref = p.doi ? safeUrl(p.doi.startsWith('http') ? p.doi : 'https://doi.org/' + p.doi) : '';
    return `
        <div class="pub-item">
            <div class="pub-year-badge">${esc(p.year || '—')}</div>
            <div class="pub-content">
                <h4>${esc(p.title)}</h4>
                <div style="color: var(--text-primary); font-weight: 500;">${esc(p.authors)}</div>
                <div class="pub-meta">
                    ${p.venue ? `<span><i class="fa-solid fa-book-open"></i> ${esc(p.venue)}</span>` : ''}
                    ${doiHref ? `<span><a href="${esc(doiHref)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-link"></i> DOI</a></span>` : ''}
                </div>
            </div>
        </div>`;
}

function renderAllPublications() {
    const grid = document.getElementById('all-publications-grid');
    if (!grid) return;
    grid.innerHTML = allPublications.length
        ? allPublications.map(renderPubItem).join('')
        : '<div style="text-align:center;color:var(--text-muted);">No publications yet.</div>';
}

async function fetchPublicationsPublic() {
    const pubGrid = document.getElementById('publicationsGrid');
    const viewAllWrapper = document.getElementById('pubs-view-all-wrapper');

    const { data, error } = await supabase.from('publications').select('*').order('year', { ascending: false });
    if (error || !data) {
        if (pubGrid) pubGrid.innerHTML = '<div style="text-align: center; color: var(--text-muted);">Could not load publications.</div>';
        return;
    }
    allPublications = data;

    if (data.length === 0) {
        if (pubGrid) pubGrid.innerHTML = '<div style="text-align: center; color: var(--text-muted);">No publications yet.</div>';
        if (viewAllWrapper) viewAllWrapper.style.display = 'none';
        return;
    }

    if (pubGrid) pubGrid.innerHTML = data.slice(0, 4).map(renderPubItem).join('');

    if (viewAllWrapper) {
        viewAllWrapper.style.display = data.length <= 4 ? 'none' : '';
    }
}

// ==========================================
// ADMIN DASHBOARD LOGIC
// ==========================================
window.openAdminLogin = function (e) {
    e.preventDefault();
    document.getElementById('admin-dashboard').classList.remove('hidden');
    if (window.currentUser) {
        document.getElementById('admin-login-screen').classList.add('hidden');
        document.getElementById('admin-app-screen').classList.remove('hidden');
        fetchAdminBlogs();
    } else {
        document.getElementById('admin-login-screen').classList.remove('hidden');
        document.getElementById('admin-app-screen').classList.add('hidden');
    }
};

window.closeAdmin = function () {
    document.getElementById('admin-dashboard').classList.add('hidden');
};

window.handleLogin = async function () {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const msg = document.getElementById('admin-msg');
    msg.innerText = "Authenticating...";

    if (!email || !password) { msg.innerText = 'Enter your email and password.'; return; }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        msg.innerText = error.message;
    } else {
        msg.innerText = '';
        document.getElementById('admin-password').value = '';
        window.currentUser = data.user;
        updateNavbarLoginState(true);
        document.getElementById('admin-login-screen').classList.add('hidden');
        document.getElementById('admin-app-screen').classList.remove('hidden');
        fetchAdminBlogs();
    }
};

window.handleLogout = async function () {
    await supabase.auth.signOut();
    window.currentUser = null;
    updateNavbarLoginState(false);
    window.closeAdmin();
};

function updateNavbarLoginState(loggedIn) {
    const btn = document.getElementById('navbar-login-btn');
    if (!btn) return;
    if (loggedIn) {
        btn.classList.add('logged-in');
        btn.title = 'Dashboard';
    } else {
        btn.classList.remove('logged-in');
        btn.title = 'Member Login';
    }
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
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 1rem;">No posts found.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(b => `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 1rem; font-weight: 500;">${esc(b.title)}</td>
            <td style="padding: 1rem;"><span class="badge" style="background: ${b.status === 'published' ? '#dcfce7' : '#f1f5f9'}; color: ${b.status === 'published' ? '#166534' : '#475569'};">${esc(b.status)}</span></td>
            <td style="padding: 1rem; color: var(--text-muted);">${new Date(b.created_at).toLocaleDateString()}</td>
            <td style="padding: 1rem; display: flex; gap: 0.5rem;">
                <button class="btn btn-ghost btn-sm" onclick="window.editAdminBlog('${b.id}')">Edit</button>
                <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="window.deleteAdminBlog('${b.id}')">Delete</button>
            </td>
        </tr>
    `).join('');

        window.adminBlogs = data;
    } catch (e) {
        document.getElementById('admin-blog-tbody').innerHTML = '<tr><td colspan="4" style="padding: 1rem;">Error or table missing.</td></tr>';
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
    document.getElementById('editor-title-heading').innerText = 'Create New Post';
    document.getElementById('post-msg').innerText = '';
};

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
    quillEditor.root.innerHTML = safeHtml(post.content);
};

window.savePost = async function (status) {
    const id = document.getElementById('edit-post-id').value;
    const title = document.getElementById('post-title').value;
    const content = quillEditor.root.innerHTML;
    const category = document.getElementById('post-category').value;
    const tagsRaw = document.getElementById('post-tags').value;
    const fileInput = document.getElementById('post-cover');
    const msg = document.getElementById('post-msg');

    if (!title) return msg.innerText = "Title is required.", msg.className = "message error";
    if (quillEditor.getText().trim().length === 0) return msg.innerText = "Content is required.", msg.className = "message error";

    msg.className = "message"; msg.innerText = "Saving post...";

    const payload = {
        title,
        content,
        category,
        status,
        tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [],
    };

    try {
        if (fileInput.files.length > 0) payload.image_url = await uploadImage('blog', fileInput.files[0]);

        if (id) {
            // Editing keeps the original author
            const { data, error } = await supabase.from('blogs').update(payload).eq('id', id).select('id');
            if (error) throw error;
            assertChanged(data);
        } else {
            payload.author_id = window.currentUser.id;
            payload.author_name = window.currentUser.email.split('@')[0];
            const { error } = await supabase.from('blogs').insert([payload]);
            if (error) throw error;
        }

        msg.className = "message success"; msg.innerText = "✅ Post saved successfully!";
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
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 1rem;">No publications found.</td></tr>';
            return;
        }
        tbody.innerHTML = window.adminPubs.map(p => `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 1rem; font-weight: 500; max-width: 300px;">${esc(p.title)}</td>
                <td style="padding: 1rem; color: var(--text-secondary); font-size: 0.9rem;">${esc(p.authors || '—')}</td>
                <td style="padding: 1rem;"><span class="badge">${esc(p.year || '—')}</span></td>
                <td style="padding: 1rem; display: flex; gap: 0.5rem;">
                    <button class="btn btn-ghost btn-sm" onclick="window.editAdminPub('${p.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="window.deleteAdminPub('${p.id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        document.getElementById('admin-pub-tbody').innerHTML = '<tr><td colspan="4" style="padding: 1rem;">Error loading publications.</td></tr>';
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
        msg.className = 'message success'; msg.innerText = '✅ Publication saved!';
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
            tbody.innerHTML = '<tr><td colspan="4" style="padding:1rem;">No people found.</td></tr>';
            return;
        }
        const roleLabel = { director: 'Co-Director', collaborator: 'External Collaborator', phd: 'PhD', ms: 'MS', alumni: 'Alumni' };
        tbody.innerHTML = window.adminMembers.map(m => {
            const supervisors = memberDirNames[m.id];
            const supCell = supervisors?.length
                ? supervisors.map(n => `<span style="background:#eff6ff;color:#1d4ed8;padding:0.15rem 0.5rem;border-radius:99px;font-size:0.75rem;font-weight:600;">${esc(n)}</span>`).join(' ')
                : '<span style="color:var(--text-muted);font-size:0.85rem;">—</span>';
            return `
            <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:1rem;font-weight:500;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <img src="${esc(safeUrl(m.image_url) || avatarFallback(m.name, 80))}" alt=""
                             style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
                        ${esc(m.name)}
                    </div>
                </td>
                <td style="padding:1rem;"><span class="badge">${esc(roleLabel[m.role_category] || m.role_category || '—')}</span></td>
                <td style="padding:1rem;">${m.role_category === 'director' ? '<span style="color:var(--text-muted);font-size:0.85rem;">—</span>' : supCell}</td>
                <td style="padding:1rem;display:flex;gap:0.5rem;">
                    <button class="btn btn-ghost btn-sm" onclick="window.editAdminMember('${m.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="window.deleteAdminMember('${m.id}')">Delete</button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        document.getElementById('admin-member-tbody').innerHTML = '<tr><td colspan="4" style="padding:1rem;">Error loading people.</td></tr>';
    }
}

function renderSupervisorCheckboxes(selectedIds = []) {
    const directors = (window.adminMembers || []).filter(m => m.role_category === 'director');
    const container = document.getElementById('supervisor-checkboxes');
    if (!container) return;
    if (!directors.length) {
        container.innerHTML = '<span style="color:var(--text-muted);font-size:0.875rem;">No directors available yet.</span>';
        return;
    }
    container.innerHTML = directors.map(d => {
        const checked = selectedIds.includes(d.id) ? 'checked' : '';
        const avatar = safeUrl(d.image_url) || avatarFallback(d.name, 80);
        return `
        <label style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 0.75rem;border-radius:99px;border:1px solid var(--border);cursor:pointer;background:white;transition:all 0.15s;"
               onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
            <input type="checkbox" name="supervisor" value="${esc(d.id)}" ${checked} style="accent-color:var(--accent);width:15px;height:15px;">
            <img src="${esc(avatar)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">
            <span style="font-size:0.875rem;font-weight:500;">${esc(d.name)}</span>
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

        msg.className = 'message success'; msg.innerText = '✅ Saved!';
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
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 1rem;">No jobs found.</td></tr>';
            return;
        }

        tbody.innerHTML = window.adminJobs.map(j => {
            const advisorName = window.adminMembers.find(m => m.id === j.advisor_id)?.name || 'General';
            return `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 1rem; font-weight: 500; max-width: 320px;">${esc(j.title)}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${esc(advisorName)}</td>
                <td style="padding: 1rem;">${j.is_active ? '<span class="badge" style="background:#dcfce7;color:#166534;">Active</span>' : '<span class="badge" style="background:#f1f5f9;color:#475569;">Hidden</span>'}</td>
                <td style="padding: 1rem; display: flex; gap: 0.5rem;">
                    <button class="btn btn-ghost btn-sm" onclick="window.editAdminJob('${j.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="window.deleteAdminJob('${j.id}')">Delete</button>
                </td>
            </tr>
        `}).join('');
    } catch (e) {
        document.getElementById('admin-job-tbody').innerHTML = '<tr><td colspan="4" style="padding: 1rem;">Error loading jobs.</td></tr>';
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
        msg.className = 'message success'; msg.innerText = '✅ Job saved!';
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
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 1rem;">No news items found.</td></tr>';
            return;
        }
        tbody.innerHTML = window.adminNews.map(n => `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 1rem; font-weight: 500; max-width: 320px;">${esc(n.title)}</td>
                <td style="padding: 1rem; color: var(--text-secondary);">${esc((n.month ? n.month + ' ' : '') + (n.year || '—'))}</td>
                <td style="padding: 1rem;">${n.is_featured ? '<span class="badge" style="background:#fef9c3;color:#854d0e;">⭐ Featured</span>' : '<span style="color:var(--text-muted);font-size:0.85rem;">—</span>'}</td>
                <td style="padding: 1rem; display: flex; gap: 0.5rem;">
                    <button class="btn btn-ghost btn-sm" onclick="window.editAdminNews('${n.id}')">Edit</button>
                    <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="window.deleteAdminNews('${n.id}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        document.getElementById('admin-news-tbody').innerHTML = '<tr><td colspan="4" style="padding: 1rem;">Error loading news.</td></tr>';
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
        msg.className = 'message success'; msg.innerText = '✅ News item saved!';
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

// ==========================================
// UTILS
// ==========================================
function initHeaderEffects() {
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.header');
        if (window.pageYOffset > 20) header.style.boxShadow = 'var(--shadow-sm)';
        else header.style.boxShadow = 'none';
    });
}

function initSmoothScroll() {
    document.querySelectorAll('.nav-link').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const navList = document.querySelector('.nav-list');
            if (navList) navList.classList.remove('active');

            const href = this.getAttribute('href');
            if (href.startsWith('#')) {
                e.preventDefault();
                window.showView('home');
                setTimeout(() => {
                    const target = document.querySelector(href);
                    if (target) window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
                }, 50);
            }
        });
    });
}