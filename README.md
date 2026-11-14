# Fahim — Full-Stack Developer Portfolio

A fast, responsive developer portfolio for **MD. Minhazur Rahman Fahim**, built with semantic HTML, modern CSS, and dependency-free JavaScript.

**Live portfolio:** [grand-starlight-0c4115.netlify.app](https://grand-starlight-0c4115.netlify.app/)

**Source:** [fahim1252375-maker/progree-task-2-portfolio](https://github.com/fahim1252375-maker/progree-task-2-portfolio)

## What the site presents

- Selected full-stack, applied-AI, civic-tech, and frontend projects
- Engineering details from BlogSpace, including authentication, ownership checks, rate limiting, and automated regression tests
- Merged Neo.mjs contributions and an open Microsoft ML-For-Beginners contribution
- Core technologies, current learning areas, development internships, education, and community involvement
- Direct contact, GitHub, and LinkedIn links

## Interface features

- Responsive editorial layout with CSS-built browser-frame project previews
- Dark and light themes with a locally stored preference
- Accessible mobile navigation with Escape-to-close and focus management
- Project category filters with `aria-pressed` state
- Reading progress indicator and back-to-top control
- Scroll reveals that respect `prefers-reduced-motion`
- Keyboard-visible focus styles and a skip-to-content link
- SEO metadata, Open Graph/Twitter metadata, Person structured data, favicon, sitemap, and crawler instructions

## Technology

- HTML5
- CSS3 (custom properties, Grid, Flexbox, responsive breakpoints, reduced-motion support)
- Vanilla JavaScript (ES6+)
- Git and GitHub
- Netlify static hosting

No framework, package installation, or build step is required.

## Run locally

```bash
git clone https://github.com/fahim1252375-maker/progree-task-2-portfolio.git
cd progree-task-2-portfolio
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000).

## Project structure

```text
.
├── index.html      # Page structure, SEO metadata, structured data, and content
├── styles.css      # Design tokens, components, visual previews, and responsive layouts
├── script.js       # Theme, navigation, filters, progress, and contact interactions
├── favicon.svg     # Site icon
├── _headers        # Netlify response security headers
├── robots.txt      # Search crawler instructions
├── sitemap.xml     # Canonical portfolio URL
└── README.md       # Project documentation
```

## Deployment

The site is a static HTML/CSS/JavaScript project. Netlify settings for a Git-connected deployment are:

| Setting | Value |
| --- | --- |
| Repository | `fahim1252375-maker/progree-task-2-portfolio` |
| Production branch | `main` |
| Build command | Leave blank |
| Publish directory | `.` |

The current Netlify production site was published through a manual Drop deployment. Connect the repository under **Netlify → Project configuration → Build & deploy → Continuous deployment** to publish future changes from GitHub. Keep the production branch as `main`, with no build command and `.` as the publish directory.

## Engineering takeaways

- A portfolio should make the strongest work easy to understand before asking visitors to inspect a repository.
- Project status and scope should be clear at a glance: full-stack MVP, applied-AI prototype, civic-tech prototype, or frontend application.
- Security and maintainability belong in project stories alongside interface design.
- Accessibility, reduced motion, responsive behavior, and real interactions are part of the implementation rather than decoration.

## License

MIT. See [LICENSE](LICENSE).
