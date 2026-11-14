(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Theme preference is stored locally; the page remains usable when storage is unavailable.
  const themeToggle = $('#themeToggle');
  const syncThemeControl = () => {
    const isLight = root.dataset.theme === 'light';
    themeToggle?.setAttribute('aria-pressed', String(isLight));
    themeToggle?.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  };

  syncThemeControl();
  themeToggle?.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = nextTheme;
    syncThemeControl();
    try {
      localStorage.setItem('fahim-theme', nextTheme);
    } catch {
      // Theme changes still work for the current page session.
    }
  });

  // Mobile navigation supports Escape, outside clicks, and focus return.
  const menuToggle = $('#menuToggle');
  const primaryNav = $('#primaryNav');
  const closeMenu = ({ returnFocus = false } = {}) => {
    primaryNav?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('aria-label', 'Open navigation');
    if (returnFocus) menuToggle?.focus();
  };

  menuToggle?.addEventListener('click', () => {
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      closeMenu();
      return;
    }
    primaryNav?.classList.add('is-open');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', 'Close navigation');
    primaryNav?.querySelector('a[href]')?.focus();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      closeMenu({ returnFocus: true });
    }
  });

  document.addEventListener('click', event => {
    if (menuToggle?.getAttribute('aria-expanded') !== 'true') return;
    const target = event.target;
    if (target instanceof Node && !primaryNav?.contains(target) && !menuToggle.contains(target)) closeMenu();
  });

  primaryNav?.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      closeMenu();
      const selector = link.getAttribute('href');
      if (!selector) return;
      const destination = $(selector);
      if (destination) {
        if (!destination.hasAttribute('tabindex')) destination.setAttribute('tabindex', '-1');
        window.requestAnimationFrame(() => destination.focus({ preventScroll: true }));
      }
    });
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 721px)').matches) closeMenu();
  }, { passive: true });

  // Reading progress and back-to-top control.
  const readingProgress = $('#readingProgress');
  const backToTop = $('#backToTop');
  let scrollTicking = false;
  const updateScrollUi = () => {
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollableHeight > 0 ? (window.scrollY / scrollableHeight) * 100 : 0;
    if (readingProgress) readingProgress.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    backToTop?.classList.toggle('is-visible', window.scrollY > 520);
    scrollTicking = false;
  };

  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    window.requestAnimationFrame(updateScrollUi);
  }, { passive: true });
  updateScrollUi();

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });

  // Reveal content as it enters view, with a no-observer fallback.
  const revealItems = $$('.reveal');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -28px 0px' });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('is-visible'));
  }

  // Project filters update both visible cards and accessible pressed states.
  const filterButtons = $$('.filter-button');
  const projectCards = $$('.project-card');
  const emptyState = $('#emptyState');

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      const selectedFilter = button.dataset.filter ?? 'all';
      let visibleCount = 0;

      filterButtons.forEach(candidate => {
        const selected = candidate === button;
        candidate.classList.toggle('is-active', selected);
        candidate.setAttribute('aria-pressed', String(selected));
      });

      projectCards.forEach(card => {
        const shouldShow = selectedFilter === 'all' || card.dataset.category === selectedFilter;
        card.hidden = !shouldShow;
        if (shouldShow) visibleCount += 1;
      });

      if (emptyState) emptyState.hidden = visibleCount > 0;
    });
  });

  // Copy-to-clipboard interaction with an accessible fallback.
  const copyEmailButton = $('#copyEmail');
  const copyStatus = $('#copyStatus');
  const emailAddress = 'fahim1252375@icloud.com';
  let copyStatusTimeout;

  copyEmailButton?.addEventListener('click', async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(emailAddress);
      } else {
        const field = document.createElement('textarea');
        field.value = emailAddress;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('Clipboard copy unavailable');
      }
      if (copyStatus) copyStatus.textContent = 'Copied';
    } catch {
      if (copyStatus) copyStatus.textContent = 'Use the email link';
    }

    window.clearTimeout(copyStatusTimeout);
    copyStatusTimeout = window.setTimeout(() => {
      if (copyStatus) copyStatus.textContent = '';
    }, 2200);
  });

  const currentYear = $('#currentYear');
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
})();
