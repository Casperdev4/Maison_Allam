/* ===================================
   AWPF DYNASTY — JAVASCRIPT
   =================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ---- Navigation scroll effect ----
    const nav = document.getElementById('nav');
    if (nav && !nav.classList.contains('scrolled')) {
        window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    // ---- Mobile menu toggle ----
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => navLinks.classList.remove('open'));
        });
    }

    // ---- Smooth scroll for anchor links (accueil only) ----
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target && nav) {
                const offset = nav.offsetHeight + 20;
                const top = target.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    // ---- Scroll reveal animation ----
    const revealElements = document.querySelectorAll(
        '.charte-article, .timeline-item, .pillar, .stat-card, .histoire-text, .charte-preamble, .charte-signature, .apercu-card, .histoire-chapitre'
    );

    revealElements.forEach(el => el.classList.add('reveal'));

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => revealObserver.observe(el));

    // ---- Member modal (page arbre) ----
    const modal = document.getElementById('memberModal');
    const modalClose = document.getElementById('modalClose');
    const modalInitials = document.getElementById('modalInitials');
    const modalName = document.getElementById('modalName');
    const modalRole = document.getElementById('modalRole');

    if (modal) {
        document.querySelectorAll('.tree-member:not(.add-member)').forEach(member => {
            member.addEventListener('click', () => {
                const name = member.querySelector('.member-name').textContent;
                const role = member.querySelector('.member-role').textContent;
                const initials = member.querySelector('.avatar-initials').textContent;

                modalInitials.textContent = initials;
                modalName.textContent = name;
                modalRole.textContent = role;
                modal.classList.add('active');
            });
        });

        modalClose.addEventListener('click', () => modal.classList.remove('active'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    }

    // ---- Tree view toggle (page arbre) ----
    const treeBtns = document.querySelectorAll('.tree-btn');
    const treeContainer = document.getElementById('treeContainer');

    if (treeBtns.length > 0 && treeContainer) {
        treeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                treeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const view = btn.dataset.view;
                if (view === 'list') {
                    treeContainer.style.textAlign = 'left';
                    document.querySelectorAll('.tree-row').forEach(row => {
                        row.style.flexDirection = 'column';
                        row.style.alignItems = 'stretch';
                    });
                } else {
                    treeContainer.style.textAlign = '';
                    document.querySelectorAll('.tree-row').forEach(row => {
                        row.style.flexDirection = '';
                        row.style.alignItems = '';
                    });
                }
            });
        });
    }

    // ---- Add member placeholder ----
    document.querySelector('.add-member')?.addEventListener('click', () => {
        alert('Fonctionnalité à venir : ajoutez les membres de votre famille ici.');
    });
});
