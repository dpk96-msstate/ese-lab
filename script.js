// DOM Ready
document.addEventListener('DOMContentLoaded', function() {
    initializeWebsite();
});

function initializeWebsite() {
    // Initialize smooth scrolling
    initSmoothScroll();

    // Initialize header effects
    initHeaderEffects();

    // Initialize animations
    initScrollAnimations();

    // Initialize navigation highlighting
    initNavHighlighting();

    // Initialize expandable research cards
    initExpandableCards();

    // Load members from JS data first, then initialize filtering
    loadMembersData();

    // Load news from JSON
    loadNewsData();

    // Load publications from JS data
    loadPublicationsData();
}

// Email protection - open mail client without revealing email
function openEmail(event, element) {
    event.preventDefault();
    const user = element.getAttribute('data-user');
    const domain = element.getAttribute('data-domain');
    const email = user + '@' + domain;
    
    // Open the mail client directly without showing the email
    window.location.href = 'mailto:' + email;
}

// Smooth Scrolling
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerHeight = document.querySelector('.header').offsetHeight + 46; // Include Wix banner
                const targetPosition = targetElement.offsetTop - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Header Effects on Scroll
function initHeaderEffects() {
    let lastScroll = 0;

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;
        const header = document.querySelector('.header');

        // Add shadow on scroll
        if (currentScroll > 50) {
            header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.15)';
        } else {
            header.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
        }

        lastScroll = currentScroll;
    });
}

// Scroll Animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const animateOnScroll = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');

                // Add staggered animation for grid items
                if (entry.target.classList.contains('news-card')) {
                    const cards = document.querySelectorAll('.news-card');
                    cards.forEach((card, index) => {
                        setTimeout(() => {
                            card.style.opacity = '0';
                            card.style.transform = 'translateY(20px)';

                            setTimeout(() => {
                                card.style.transition = 'all 0.6s ease';
                                card.style.opacity = '1';
                                card.style.transform = 'translateY(0)';
                            }, 50);
                        }, index * 100);
                    });
                } else if (entry.target.classList.contains('theme-card')) {
                    // Special animation for research theme cards
                    entry.target.style.opacity = '0';
                    entry.target.style.transform = 'translateY(30px) scale(0.95)';
                    
                    setTimeout(() => {
                        entry.target.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0) scale(1)';
                    }, 100);
                } else {
                    // Default animation
                    entry.target.style.opacity = '0';
                    entry.target.style.transform = 'translateY(20px)';

                    setTimeout(() => {
                        entry.target.style.transition = 'all 0.6s ease';
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }, 50);
                }

                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe elements
    const animatedElements = document.querySelectorAll('.news-card, .partner-card, .intro-text, .section-heading, .theme-card, .research-intro');
    animatedElements.forEach(el => {
        animateOnScroll.observe(el);
    });
}

// Navigation Highlighting
function initNavHighlighting() {
    window.addEventListener('scroll', function() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-link');
        const scrollPosition = window.pageYOffset + 200;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + sectionId) {
                        link.classList.add('active');
                    }
                });
            }
        });
    });
}

// Read More Button
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('read-more-btn')) {
        // Scroll to About section or expand content
        const aboutSection = document.querySelector('#about');
        if (aboutSection) {
            aboutSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            // Alternatively, expand content in place
            alert('More content coming soon!');
        }
    }
});

// Contact Button Hover Effects
document.querySelectorAll('.contact-btn').forEach(button => {
    button.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-3px)';
    });

    button.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
    });
});

// Mobile Menu Toggle
function initMobileMenu() {
    const header = document.querySelector('.header-container');
    const navList = document.querySelector('.nav-list');

    // Create mobile menu button
    const menuToggle = document.createElement('button');
    menuToggle.className = 'mobile-menu-toggle';
    menuToggle.innerHTML = 'â˜°';
    menuToggle.style.cssText = `
        display: none;
        background: none;
        border: none;
        color: #fff;
        font-size: 24px;
        cursor: pointer;
        position: absolute;
        right: 20px;
        top: 35px;
    `;

    header.appendChild(menuToggle);

    // Toggle menu on mobile
    menuToggle.addEventListener('click', function() {
        navList.classList.toggle('mobile-active');
    });

    // Show/hide mobile menu button based on screen size
    function checkMobile() {
        if (window.innerWidth <= 768) {
            menuToggle.style.display = 'block';
        } else {
            menuToggle.style.display = 'none';
            navList.classList.remove('mobile-active');
        }
    }

    checkMobile();
    window.addEventListener('resize', checkMobile);
}

// Initialize mobile menu
initMobileMenu();

// Expandable Research Cards
function initExpandableCards() {
    const expandButtons = document.querySelectorAll('.expand-btn');
    
    expandButtons.forEach(button => {
        button.addEventListener('click', function() {
            const card = this.closest('.theme-card');
            const details = card.querySelector('.theme-details');
            const isExpanded = card.classList.contains('expanded');
            
            if (isExpanded) {
                // Collapse
                card.classList.remove('expanded');
                details.style.maxHeight = '0';
                details.style.opacity = '0';
                this.textContent = '+';
                this.setAttribute('aria-label', 'Expand research details');
            } else {
                // Expand
                card.classList.add('expanded');
                details.style.maxHeight = details.scrollHeight + 'px';
                details.style.opacity = '1';
                this.textContent = '-';
                this.setAttribute('aria-label', 'Collapse research details');
                
                // Add staggered animation for list items
                const listItems = details.querySelectorAll('li');
                listItems.forEach((item, index) => {
                    item.style.opacity = '0';
                    item.style.transform = 'translateX(-10px)';
                    setTimeout(() => {
                        item.style.transition = 'all 0.3s ease';
                        item.style.opacity = '1';
                        item.style.transform = 'translateX(0)';
                    }, index * 50);
                });
            }
        });
    });
}

// Enhanced Scroll Animations for Research Cards
function initResearchCardAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const researchObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const cards = document.querySelectorAll('.theme-card');
                cards.forEach((card, index) => {
                    setTimeout(() => {
                        card.style.opacity = '0';
                        card.style.transform = 'translateY(30px) scale(0.95)';
                        
                        setTimeout(() => {
                            card.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                            card.style.opacity = '1';
                            card.style.transform = 'translateY(0) scale(1)';
                        }, 100);
                    }, index * 150);
                });
                researchObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const researchSection = document.querySelector('.research-themes');
    if (researchSection) {
        researchObserver.observe(researchSection);
    }
}

// Member Filtering System
function initMemberFiltering() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const searchInput = document.getElementById('memberSearch');
    const memberSections = document.querySelectorAll('.member-section');

    // Filter by category
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');
            
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Filter sections and cards
            filterMembers(filter, searchInput.value.toLowerCase());
        });
    });

    // Search functionality
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const activeFilter = document.querySelector('.filter-btn.active').getAttribute('data-filter');
        
        filterMembers(activeFilter, searchTerm);
    });

    function filterMembers(categoryFilter, searchTerm) {
        let visibleCount = 0;
        // Query member cards fresh each time since they are dynamically loaded
        const memberCards = document.querySelectorAll('.member-card');

        memberSections.forEach(section => {
            const categoryType = section.getAttribute('data-category');
            const sectionCards = section.querySelectorAll('.member-card');
            let sectionVisible = false;

            // Check if section should be shown
            const showSection = categoryFilter === 'all' || categoryFilter === categoryType;

            if (showSection) {
                sectionCards.forEach(card => {
                    const name = card.getAttribute('data-name').toLowerCase();
                    const degree = card.getAttribute('data-degree').toLowerCase();
                    
                    const matchesSearch = searchTerm === '' || 
                                        name.includes(searchTerm) || 
                                        degree.includes(searchTerm);

                    if (matchesSearch) {
                        card.style.display = 'flex';
                        card.style.opacity = '0';
                        card.style.transform = 'translateY(20px) scale(0.95)';
                        
                        setTimeout(() => {
                            card.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                            card.style.opacity = '1';
                            card.style.transform = 'translateY(0) scale(1)';
                        }, visibleCount * 75);
                        
                        sectionVisible = true;
                        visibleCount++;
                    } else {
                        card.style.display = 'none';
                    }
                });

                section.style.display = sectionVisible ? 'block' : 'none';
            } else {
                section.style.display = 'none';
            }
        });

        // Show "no results" message if no members visible
        showNoResultsMessage(visibleCount === 0);
    }

    function showNoResultsMessage(show) {
        let noResultsMsg = document.querySelector('.no-results-message');
        
        if (show && !noResultsMsg) {
            noResultsMsg = document.createElement('div');
            noResultsMsg.className = 'no-results-message';
            noResultsMsg.innerHTML = '<p>No members found matching your criteria.</p>';
            noResultsMsg.style.cssText = `
                text-align: center;
                padding: 60px 20px;
                color: #666;
                font-style: italic;
                font-size: 18px;
                background: white;
                border-radius: 20px;
                margin: 40px auto;
                max-width: 400px;
                box-shadow: 0 8px 25px rgba(0, 74, 97, 0.1);
            `;
            
            const membersContainer = document.querySelector('#members .container');
            membersContainer.appendChild(noResultsMsg);
        } else if (!show && noResultsMsg) {
            noResultsMsg.remove();
        }
    }
}

// Add loading animation
window.addEventListener('load', function() {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s';
        document.body.style.opacity = '1';
    }, 100);
    
    // Initialize research card animations
    initResearchCardAnimations();
});

// Load News Data from JSON
// Load members data from members.js
function loadMembersData() {
    if (typeof members === 'undefined') {
        console.error('Members data not loaded');
        return;
    }

    // Load Director
    const directorGrid = document.querySelector('.director-grid');
    if (directorGrid && members.director) {
        directorGrid.innerHTML = renderMemberCard(members.director, 'director');
    }

    // Load Collaborators
    const collaboratorGrid = document.querySelector('.collaborator-grid');
    if (collaboratorGrid && members.collaborators) {
        collaboratorGrid.innerHTML = members.collaborators
            .map(member => renderMemberCard(member, 'collaborator'))
            .join('');
    }

    // Load Current Students
    const studentGrid = document.querySelector('.student-grid');
    if (studentGrid && members.currentStudents) {
        let studentsHTML = '';
        if (members.currentStudents.phd) {
            studentsHTML += members.currentStudents.phd
                .map(member => renderMemberCard(member, 'phd'))
                .join('');
        }
        if (members.currentStudents.ms) {
            studentsHTML += members.currentStudents.ms
                .map(member => renderMemberCard(member, 'msc'))
                .join('');
        }
        studentGrid.innerHTML = studentsHTML;
    }

    // Load Alumni
    const alumniGrid = document.querySelector('.alumni-grid');
    if (alumniGrid && members.alumni) {
        let alumniHTML = '';
        if (members.alumni.phd) {
            alumniHTML += members.alumni.phd
                .map(member => renderMemberCard(member, 'phd'))
                .join('');
        }
        if (members.alumni.postdoc) {
            alumniHTML += members.alumni.postdoc
                .map(member => renderMemberCard(member, 'postdoc'))
                .join('');
        }
        if (members.alumni.ms) {
            alumniHTML += members.alumni.ms
                .map(member => renderMemberCard(member, 'msc'))
                .join('');
        }
        if (members.alumni.bs) {
            alumniHTML += members.alumni.bs
                .map(member => renderMemberCard(member, 'bsc'))
                .join('');
        }
        alumniGrid.innerHTML = alumniHTML;
    }

    // Load SIG Coordinators
    const coordinatorsGrid = document.querySelector('.coordinators-grid');
    if (coordinatorsGrid && members.sigMembers && members.sigMembers.coordinators) {
        coordinatorsGrid.innerHTML = members.sigMembers.coordinators
            .map(member => renderCoordinatorCard(member))
            .join('');
    }

    // Load SIG Members
    const sigMembersGrid = document.querySelector('.members-grid');
    if (sigMembersGrid && members.sigMembers && members.sigMembers.members) {
        sigMembersGrid.innerHTML = members.sigMembers.members
            .map(member => renderSigMemberCard(member))
            .join('');
    }

    // Re-initialize member filtering after loading data with a delay to ensure DOM is updated
    setTimeout(() => {
        console.log('Initializing member filtering...');
        const memberCards = document.querySelectorAll('.member-card');
        console.log('Found', memberCards.length, 'member cards');
        
        initMemberFiltering();
        
        // Trigger initial filter to show all members
        const allButton = document.querySelector('.filter-btn[data-filter="all"]');
        if (allButton) {
            console.log('Triggering initial filter...');
            allButton.click();
        }
    }, 300);
}

// Helper function to render a coordinator card
function renderCoordinatorCard(member) {
    const avatarContent = member.image 
        ? `<img src="${member.image}" alt="${member.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
        : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${member.initials || getInitials(member.name)}</div>`;
    
    const linkedinContent = member.linkedin 
        ? `<a href="${member.linkedin}" target="_blank" class="coordinator-linkedin" style="display: inline-block; margin-top: 8px; color: #0077B5; text-decoration: none; font-size: 14px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
            LinkedIn
        </a>`
        : '';
    
    const badgeClass = member.role === 'Chair' ? 'chair' : 'coordinator';
    
    return `
        <div class="coordinator-card ${member.role === 'Chair' ? 'chair-card' : ''}">
            <div class="coordinator-avatar">${avatarContent}</div>
            <div class="coordinator-info">
                <h4 class="coordinator-name">${member.name}</h4>
                <p class="coordinator-affiliation">${member.affiliation}</p>
                <span class="coordinator-badge ${badgeClass}">${member.role}</span>
                ${linkedinContent}
            </div>
        </div>
    `;
}

// Helper function to render a SIG member card
function renderSigMemberCard(member) {
    const avatarContent = member.image 
        ? `<img src="${member.image}" alt="${member.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
        : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${member.initials || getInitials(member.name)}</div>`;
    
    const linkedinContent = member.linkedin 
        ? `<a href="${member.linkedin}" target="_blank" class="member-linkedin" style="display: inline-block; margin-top: 8px; color: #0077B5; text-decoration: none; font-size: 14px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
            LinkedIn
        </a>`
        : '';
    
    return `
        <div class="sig-member-card">
            <div class="member-avatar">${avatarContent}</div>
            <div class="member-info">
                <h4 class="member-name">${member.name}</h4>
                <p class="member-affiliation">${member.affiliation}</p>
                <span class="member-badge member">Member</span>
                ${linkedinContent}
            </div>
        </div>
    `;
}

// Helper function to render a member card
function renderMemberCard(member, category) {
    // Director gets square avatar, others get circular
    let avatarContent;
    if (category === 'director') {
        avatarContent = member.image
            ? `<div class="hexagon-avatar">
                    <div class="hexagon-inner">
                        <img src="${member.image}" alt="${member.name}">
                    </div>
               </div>`
            : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${member.initials || getInitials(member.name)}</div>`;
    } else {
        avatarContent = member.image
            ? `<img src="${member.image}" alt="${member.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
            : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${member.initials || getInitials(member.name)}</div>`;
    }

    const linkedinContent = member.linkedin
        ? `<a href="${member.linkedin}" target="_blank" class="member-linkedin" style="display: inline-block; margin-top: 8px; color: #0077B5; text-decoration: none; font-size: 14px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
            LinkedIn
        </a>`
        : '';

    const badgeText = member.badge || member.degree || (category === 'director' ? 'Director' : category);
    const badgeClass = member.degree ? member.degree.toLowerCase() : category;

    // For director, use title if available, otherwise show title field
    let displayText, cssClass;
    if (category === 'director') {
        displayText = member.title || member.affiliation;
        cssClass = 'member-title';
    } else {
        displayText = member.affiliation;
        cssClass = 'member-affiliation';
    }

    return `
        <div class="member-card ${category === 'director' ? 'director-card' : ''}" data-name="${member.name}" data-degree="${member.degree || ''}">
            <div class="member-avatar-wrapper">
                ${category === 'director' ? avatarContent : `<div class="member-avatar">${avatarContent}</div>`}
            </div>
            <div class="member-info">
                <h4 class="member-name">${member.name}</h4>
                <p class="${cssClass}">${displayText}</p>
                <span class="member-badge ${badgeClass}">${badgeText}</span>
                ${linkedinContent}
            </div>
        </div>
    `;
}

// Helper function to get initials from name
function getInitials(name) {
    return name.split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
}

async function loadNewsData() {
    try {
        const response = await fetch('data/news.json');
        const data = await response.json();
        
        // Display all news items in detailed news section
        displayDetailedNews(data.news);
        
    } catch (error) {
        console.error('Error loading news data:', error);
    }
}

// Display news in detailed news section
function displayDetailedNews(newsItems) {
    const detailedNewsGrid = document.getElementById('detailedNewsGrid');
    if (!detailedNewsGrid) return;
    
    detailedNewsGrid.innerHTML = newsItems.map((item, index) => {
        const isFeatured = item.featured;
        const tagClasses = {
            'AI Agents': 'ai',
            'Federated Learning': 'federated',
            'Publication': 'publication',
            'Blockchain': 'blockchain',
            'Security': 'security',
            'LLM': 'llm',
            'DeFi': 'defi',
            'AI Security': 'ai',
            'Web3': 'web3',
            'API': 'api',
            'IoT': 'iot',
            'Cloud': 'cloud',
            'Privacy': 'privacy',
            'IIoT': 'iiot',
            'Edge Computing': 'edge',
            'Trust': 'trust',
            'HDFS': 'hdfs',
            'Provenance': 'provenance',
            'Intrusion Detection': 'security',
            'Drones': 'drones',
            'Authentication': 'security',
            'Anomaly Detection': 'security',
            'Survey': 'survey',
            'Healthcare': 'healthcare',
            'SDN': 'sdn',
            'PoW': 'blockchain',
            'Sidechain': 'blockchain',
            'Review': 'review',
            'Smart Contracts': 'blockchain',
            'P4': 'networking',
            '5G': 'networking',
            'IoUT': 'iot',
            'RSA': 'security',
            'Agriculture': 'iot',
            'Award': 'award',
            'IPFS': 'blockchain',
            'Task Scheduling': 'cloud',
            'Energy Efficiency': 'green'
        };
        
        return `
            <div class="news-item ${isFeatured ? 'featured-news' : ''}">
                ${isFeatured ? '<div class="news-badge featured">Featured</div>' : ''}
                <div class="news-date-badge">
                    <span class="news-month">${item.month}</span>
                    <span class="news-year">${item.year}</span>
                </div>
                <div class="news-content">
                    <h3>${item.title.replace(/Paper accepted at |Paper published at /g, '')}</h3>
                    <p class="news-summary">${item.description}</p>
                    <div class="news-tags">
                        ${item.tags.map(tag => 
                            `<span class="news-tag ${tagClasses[tag] || 'default'}">${tag}</span>`
                        ).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Load Publications Data from JS
function loadPublicationsData() {
    try {
        if (typeof publicationsData === 'undefined') {
            console.error('Publications data not loaded');
            return;
        }
        
        // Update lab metrics
        updateLabMetrics(publicationsData.profile);
        
        // Display 2025 publications by default
        const publications2025 = publicationsData.publications.filter(pub => pub.year === 2025);
        displayPublications(publications2025);
        
        // Initialize publication filters
        initPublicationFilters(publicationsData.publications);
        
    } catch (error) {
        console.error('Error loading publications data:', error);
    }
}

// Update lab metrics
function updateLabMetrics(profile) {
    const labMetrics = document.getElementById('labMetrics');
    if (!labMetrics) return;

    // Format the last updated date
    const lastUpdated = profile.lastUpdated ? new Date(profile.lastUpdated).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : 'Unknown';

    labMetrics.innerHTML = `
        <div class="metric-item">
            <div class="metric-number">${profile.totalCitations.toLocaleString()}</div>
            <div class="metric-label">Total Citations</div>
        </div>
        <div class="metric-item">
            <div class="metric-number">${profile.hIndex}</div>
            <div class="metric-label">h-index</div>
        </div>
        <div class="metric-item">
            <div class="metric-number">${profile.i10Index}</div>
            <div class="metric-label">i10-index</div>
        </div>
        <div class="metric-item">
            <div class="metric-number">${profile.citationsSince2020.toLocaleString()}</div>
            <div class="metric-label">Citations Since 2020</div>
        </div>
    `;

    // Add last updated info below metrics
    const lastUpdateInfo = document.createElement('div');
    lastUpdateInfo.style.cssText = 'text-align: center; margin-top: 15px; font-size: 13px; color: #666; font-style: italic;';
    lastUpdateInfo.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
        </svg>
        Last updated: ${lastUpdated} (automatically synced from Google Scholar)
    `;
    labMetrics.parentElement.appendChild(lastUpdateInfo);
}

// Display publications
function displayPublications(publications) {
    const publicationsGrid = document.getElementById('publicationsGrid');
    if (!publicationsGrid) return;
    
    publicationsGrid.innerHTML = publications.map(pub => {
        const isJournal = pub.venue && !pub.venue.includes('Conference') && !pub.venue.includes('Workshop');
        const pubType = isJournal ? 'journal' : 'conference';
        const isHighImpact = pub.citations >= 200;
        
        return `
            <div class="publication-card ${pubType}-paper" data-year="${pub.year}" data-type="${pubType}" ${isHighImpact ? 'data-filter="high-impact"' : ''}>
                <div class="pub-type-badge ${pubType}">${isJournal ? 'Journal' : 'Conference'}</div>
                ${pub.citations ? `<div class="pub-citations">${pub.citations.toLocaleString()} citations</div>` : ''}
                <div class="pub-content">
                    <h3>${pub.title}</h3>
                    <div class="pub-authors">${pub.authors}</div>
                    <div class="pub-venue">${pub.venue}${pub.volume ? ` ${pub.volume}` : ''}${pub.pages ? `, ${pub.pages}` : ''}, ${pub.year}</div>
                    <div class="pub-tags">
                        ${getPublicationTags(pub).map(tag => `<span class="pub-tag ${getTagClass(tag)}">${tag}</span>`).join('')}
                    </div>
                    <div class="pub-actions">
                        ${pub.doi ? `<a href="https://doi.org/${pub.doi}" target="_blank" class="pub-link-btn">View Paper</a>` : ''}
                        <button class="pub-cite-btn" onclick="showBibtex('${pub.id}')">Cite</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Get publication tags based on title and venue
function getPublicationTags(pub) {
    const tags = [];
    const title = pub.title.toLowerCase();
    const venue = pub.venue.toLowerCase();
    
    if (title.includes('federated') || title.includes('federation')) tags.push('Federated Learning');
    if (title.includes('blockchain') || venue.includes('blockchain')) tags.push('Blockchain');
    if (title.includes('security') || title.includes('cyber')) tags.push('Security');
    if (title.includes('privacy')) tags.push('Privacy');
    if (title.includes('iot') || title.includes('internet of things')) tags.push('IoT');
    if (title.includes('machine learning') || title.includes('deep learning')) tags.push('Machine Learning');
    if (title.includes('survey') || title.includes('review')) tags.push('Survey');
    if (title.includes('smart contract')) tags.push('Smart Contracts');
    if (title.includes('malware') || title.includes('threat')) tags.push('Malware Detection');
    if (venue.includes('ieee')) tags.push('IEEE');
    if (venue.includes('journal')) tags.push('Journal');
    
    return tags.length > 0 ? tags.slice(0, 4) : ['Research'];
}

// Get CSS class for tag
function getTagClass(tag) {
    const tagClasses = {
        'Federated Learning': 'federated',
        'Blockchain': 'blockchain',
        'Security': 'security',
        'Privacy': 'privacy',
        'IoT': 'iot',
        'Machine Learning': 'ai',
        'Survey': 'survey',
        'Smart Contracts': 'blockchain',
        'Malware Detection': 'security',
        'IEEE': 'ieee',
        'Journal': 'journal',
        'Research': 'default'
    };
    return tagClasses[tag] || 'default';
}

// Initialize publication filters
function initPublicationFilters(allPublications) {
    const filterButtons = document.querySelectorAll('.pub-filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const filter = button.dataset.filter;
            let filteredPubs = [];
            
            switch(filter) {
                case 'all':
                    filteredPubs = allPublications.slice(0, 20);
                    break;
                case '2025':
                    filteredPubs = allPublications.filter(pub => pub.year === 2025);
                    break;
                case '2024':
                    filteredPubs = allPublications.filter(pub => pub.year === 2024);
                    break;
                case '2023':
                    filteredPubs = allPublications.filter(pub => pub.year === 2023);
                    break;
                case '2021-2022':
                    filteredPubs = allPublications.filter(pub => pub.year >= 2021 && pub.year <= 2022);
                    break;
                case '2019-2020':
                    filteredPubs = allPublications.filter(pub => pub.year >= 2019 && pub.year <= 2020);
                    break;
                case 'high-impact':
                    filteredPubs = allPublications.filter(pub => pub.citations >= 200).slice(0, 15);
                    break;
                default:
                    filteredPubs = allPublications.slice(0, 20);
            }
            
            displayPublications(filteredPubs);
        });
    });
}

// Show BibTeX citation
function showBibtex(publicationId) {
    const publication = publicationsData.publications.find(pub => pub.id == publicationId);
    if (publication && publication.bibtex) {
        const modal = document.createElement('div');
        modal.className = 'bibtex-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
            background: rgba(0,0,0,0.8); z-index: 10000; 
            display: flex; align-items: center; justify-content: center;
        `;
        
        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 15px; max-width: 700px; max-height: 80vh; overflow-y: auto; margin: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: #004A61;">Citation</h3>
                    <button onclick="copyBibtex('${publication.id}')" style="background: #7BC8A4; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 12px;" title="Copy to clipboard">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                        Copy
                    </button>
                </div>
                <pre id="bibtex-content-${publication.id}" style="background: #f5f5f5; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 12px; line-height: 1.4;">${publication.bibtex}</pre>
                <div style="text-align: right; margin-top: 20px;">
                    <button onclick="this.closest('.bibtex-modal').remove()" style="background: #004A61; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Close</button>
                </div>
            </div>
        `;
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        document.body.appendChild(modal);
    }
}

// Initialize Research Filtering
function initResearchFiltering() {
    const filterButtons = document.querySelectorAll('.research-filter-btn');
    const researchThemes = document.querySelectorAll('.theme-card');
    
    // Set current year (2025) as default
    const currentYear = new Date().getFullYear();
    const currentYearButton = document.querySelector(`.research-filter-btn[data-filter="${currentYear}"]`);
    
    if (currentYearButton) {
        // Remove active class from all buttons
        filterButtons.forEach(btn => btn.classList.remove('active'));
        // Add active class to current year
        currentYearButton.classList.add('active');
        // Filter themes by current year
        filterResearchThemes(currentYear.toString());
    }
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const filter = button.dataset.filter;
            filterResearchThemes(filter);
        });
    });
}

// Filter Research Themes
function filterResearchThemes(filter) {
    const researchThemes = document.querySelectorAll('.theme-card');
    
    researchThemes.forEach(theme => {
        if (filter === 'all') {
            theme.style.display = 'block';
            theme.style.opacity = '1';
        } else {
            const themeYear = theme.dataset.year;
            if (themeYear === filter) {
                theme.style.display = 'block';
                theme.style.opacity = '1';
            } else {
                theme.style.display = 'none';
                theme.style.opacity = '0';
            }
        }
    });
    
    // Add smooth transition
    researchThemes.forEach(theme => {
        theme.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    });
}

// Copy BibTeX to clipboard
function copyBibtex(publicationId) {
    const publication = publicationsData.publications.find(pub => pub.id == publicationId);
    if (publication && publication.bibtex) {
        // Use the modern clipboard API if available
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(publication.bibtex).then(() => {
                showCopyFeedback();
            }).catch(err => {
                console.error('Failed to copy: ', err);
                fallbackCopyTextToClipboard(publication.bibtex);
            });
        } else {
            // Fallback for older browsers
            fallbackCopyTextToClipboard(publication.bibtex);
        }
    }
}

// Fallback copy function for older browsers
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showCopyFeedback();
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }
    
    document.body.removeChild(textArea);
}

// Show copy feedback
function showCopyFeedback() {
    // Find the copy button and temporarily change its text
    const copyButton = document.querySelector('.bibtex-modal button[onclick*="copyBibtex"]');
    if (copyButton) {
        const originalHTML = copyButton.innerHTML;
        copyButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Copied!
        `;
        copyButton.style.background = '#22c55e';

        setTimeout(() => {
            copyButton.innerHTML = originalHTML;
            copyButton.style.background = '#7BC8A4';
        }, 2000);
    }
}

// Scroll to Top Button Functionality
const scrollToTopBtn = document.getElementById('scrollToTop');

// Show/hide button based on scroll position
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
});

// Scroll to top when button is clicked
scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});