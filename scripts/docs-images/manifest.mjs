/*
  Every docs image capture.mjs makes, written to images/<id>.webp. Each one is a part of the panel in demo mode, set
  on its own Heather background so the set reads as one family.

  route     the panel's hash route
  viewport  the browser window, CSS px (1180 × 840 unless given)
  prepare   what to do first: open a menu, type a search, scroll (helpers in capture.mjs)
  crop      "main" (the page beside the sidebar, the default), "window" (everything), { rect } in CSS px, or a box
            around things on the page: { selector }, { text, closest } or { union: [texts] }, with pad / padX / padY,
            and edges: ["left", "right"] to take those edges from the main column instead
  frame     "bleed" (centred, running off the foot of the board, the default), "center" (floating, all of it
            showing) or "corner" (running off the right and the foot, for a whole window)
  zoom      how much larger than on the page it is drawn; by default as large as fits, up to maxZoom (1.5)
  backdrop  Heather-<n>.png, or { n, band: "top" | "middle" | "bottom", flip } for a second look at one
  alt       what the image shows, for the alt text in the page
*/

/** The board, in CSS px; captured at 3× it is 3840 × 2520. */
export const BOARD = { width: 1280, height: 840 };

/** The demo's newest production deployment of storefront, and a live preview of it. */
const DEPLOYMENT = "#/projects/storefront/deployments/dep_hxkevy0rc4zd";
const PREVIEW = "#/projects/storefront/deployments/dep_ra9guad4r61u";

/** A dialog, cut at its edge; it keeps its own 12 px corners. */
const dialog = { crop: { selector: "[role=dialog]" }, cornerRadius: 12, frame: "center" };

export const shots = [
  // Get started
  {
    id: "getting-started/cli-sign-in",
    route: "#/device?code=WDJB-MJHT",
    crop: { union: ["Sign in the CLI", "Signed in as"], pad: 40 },
    frame: "center",
    backdrop: 7,
    alt: "The panel asking you to approve a CLI sign-in: the code to check against your terminal, Approve and Deny",
  },

  // Account
  {
    id: "account/panel",
    route: "#/overview",
    viewport: { width: 1440, height: 900 },
    crop: "window",
    frame: "corner",
    zoom: 1,
    backdrop: 10,
    alt: "The panel: the sidebar with the org menu, quick search, the main pages, the org's projects and its Organization pages, beside the org overview",
  },
  {
    id: "account/quick-search",
    route: "#/overview",
    prepare: async (page, { press }) => {
      await press(page, "/");
    },
    ...dialog,
    backdrop: 15,
    alt: "Quick search open over the panel: the org's pages, then its projects with their addresses",
  },
  {
    id: "account/organizations",
    route: "#/overview",
    prepare: async (page, { click }) => {
      await click(page, "Northwind Labs", { partial: true });
    },
    // The top of the sidebar with the menu open below it, and the start of the page beside it.
    crop: { rect: { x: 0, y: 0, width: 560, height: 330 } },
    frame: "center",
    backdrop: 5,
    alt: "The org menu open at the top of the sidebar: the orgs you belong to with your role in each, and New organization",
  },
  {
    id: "account/sign-in",
    // The screens gallery draws the sign-in page signed out, as the real #/login shows it.
    route: "#/_screens?screen=sign-in",
    // Narrow, so the page around the form is in proportion.
    viewport: { width: 1000, height: 760 },
    prepare: async (page, { click }) => {
      await click(page, "Light");
    },
    crop: { selector: 'section[aria-label="Sign in, light"]' },
    cornerRadius: 12,
    frame: "center",
    backdrop: 14,
    alt: "The panel's sign-in page: Continue with GitHub, Continue with Google, or an email and password",
  },
  {
    id: "account/access-tokens",
    route: "#/account/tokens",
    backdrop: 3,
    alt: "The Access tokens tab of the Account page: personal access tokens with when each was created, last used and expires",
  },

  // Deploy
  {
    id: "deploy/deployments",
    route: "#/projects/storefront/deployments",
    backdrop: 1,
    alt: "A project's Deployments tab: production and preview deployments with their status, branch and commit, apps, author and age",
  },
  {
    id: "deploy/deployment",
    route: DEPLOYMENT,
    backdrop: 18,
    alt: "One deployment in the panel: its status, environment, source and address, each app with its downloads, and the build logs",
  },
  {
    id: "deploy/share-link",
    route: DEPLOYMENT,
    prepare: async (page, { click, waitFor }) => {
      await click(page, "Share");
      await click(page, "Create link");
      await waitFor(page, /#\/d\//);
    },
    ...dialog,
    backdrop: 8,
    alt: "The Share dialog of a deployment: a download link with its QR code, and a form for a new link with a password and an expiry",
  },
  {
    id: "deploy/download-page",
    route: DEPLOYMENT,
    viewport: { width: 1180, height: 900 },
    prepare: async (page, { click, find, go, waitFor }) => {
      await click(page, "Share");
      await click(page, "Create link");
      await waitFor(page, /#\/d\//);
      await go(page, await find(page, /#\/d\/[A-Za-z0-9_-]+/));
    },
    crop: "window",
    backdrop: 16,
    alt: "A shared download page opened without an account: the release with a download button for each file",
  },
  {
    id: "deploy/promote",
    route: PREVIEW,
    prepare: async (page, { click }) => {
      await click(page, "More for this deployment");
      await click(page, "Promote to production");
    },
    ...dialog,
    backdrop: 2,
    alt: "Promoting a preview: the panel asks whether to put the preview live on the production hosts",
  },
  {
    id: "deploy/previews",
    route: "#/projects/storefront",
    prepare: async (page, { scrollTo }) => {
      await scrollTo(page, "Active branches", 32);
    },
    // From the section's heading down, across the whole column.
    crop: { union: ["Active branches"], padY: 28, edges: ["left", "right", "bottom"] },
    backdrop: 12,
    alt: "Active branches on a project's Overview tab: the newest preview of each branch with its deployment, pull request, author and age",
  },
  {
    id: "deploy/git",
    route: "#/orgs/northwind/git",
    backdrop: 20,
    alt: "The org's Git tab: install the GitHub App, and the GitHub accounts connected to the org with their status",
  },
  {
    id: "deploy/ci",
    route: "#/projects/storefront/ci",
    backdrop: 9,
    alt: "A project's CI tab: Gradle runs for pushes and pull requests with their status, branch, duration and author",
  },

  // Configure
  {
    id: "configure/environment-variables",
    route: "#/projects/storefront/env",
    backdrop: 13,
    alt: "A project's Environment tab: production and preview variables with their values, where they are used, and secrets masked",
  },
  {
    id: "configure/custom-domains",
    route: "#/projects/storefront/domains",
    backdrop: 17,
    alt: "A project's Domains tab: the project's own address and four custom domains with what each serves and its status, one still issuing its certificate",
  },
  {
    id: "configure/firewall",
    route: "#/projects/storefront/firewall",
    backdrop: 19,
    alt: "A project's Firewall tab: requests over the past hour by action, the rules and blocks in place, alerts and the rules that matched",
  },

  // Run
  {
    id: "run/scaling",
    route: "#/projects/storefront/scaling",
    backdrop: 6,
    alt: "A project's Scaling tab: what the plan allows, then the server module's size per replica, replicas and scale to zero",
  },
  {
    id: "run/regions",
    route: "#/projects/storefront/scaling",
    prepare: async (page, { scrollTo }) => {
      await scrollTo(page, "Region", 32);
    },
    // The end of the module's settings and the Region section under it. Every demo project with a Ktor server has
    // custom domains, so the section shows why it can't move yet, as the docs describe.
    crop: { union: [["Scale to zero", 1], "Remove the project's custom domains"], padY: 28, edges: ["left", "right"] },
    frame: "center",
    backdrop: { n: 16, band: "top", flip: true },
    alt: "The Region section of a project's Scaling tab: where its Ktor servers run, and moving the project to another region",
  },
  {
    id: "run/runners",
    route: "#/orgs/northwind/runners",
    backdrop: 11,
    alt: "The org's Runners tab: its own macOS and Windows runners with their status and job, and the platform's shared runners",
  },

  // Storage
  {
    id: "storage/overview",
    route: "#/orgs/northwind/storage",
    backdrop: { n: 19, band: "top", flip: true },
    alt: "The Storage page: the org's Postgres, Redis and Files stores with their status, region, connected projects and how full they are",
  },
  {
    id: "storage/postgres",
    route: "#/orgs/northwind/storage/shop-db/backups",
    backdrop: { n: 3, band: "bottom", flip: true },
    alt: "A Postgres store's Backups tab: the point-in-time recovery window and the base backups with their size",
  },
  {
    id: "storage/redis",
    route: "#/orgs/northwind/storage/sessions",
    backdrop: { n: 10, band: "bottom", flip: true },
    alt: "A Redis store's Overview tab: memory used, its details and the connection values",
  },
  {
    id: "storage/files",
    route: "#/orgs/northwind/storage/media/browser",
    backdrop: { n: 13, band: "top", flip: true },
    alt: "A Files store's Browser tab: the bucket's folders and files with their size, and Upload",
  },

  // Observe
  {
    id: "observe/overview",
    route: "#/overview",
    backdrop: { n: 7, band: "top", flip: true },
    alt: "The org overview: a note on what needs attention, deployments, traffic and errors over the last 7 days, and requests by project",
  },
  {
    id: "observe/project-overview",
    route: "#/projects/storefront",
    backdrop: { n: 1, band: "bottom", flip: true },
    alt: "A project's Overview tab: what is live in production, its domains and apps, the last 24 hours and its storage",
  },
  {
    id: "observe/logs",
    route: "#/projects/storefront/logs",
    backdrop: 4,
    alt: "A project's Logs tab: the environment and module pickers, and the server's output following live",
  },
  {
    id: "observe/metrics",
    route: "#/projects/storefront/metrics",
    backdrop: { n: 15, flip: true },
    alt: "A project's Metrics tab: requests, latency, error rate and replicas now, then charts of requests and latency over the last hour",
  },

  // Teams and billing
  {
    id: "teams/members",
    route: "#/orgs/northwind/members",
    backdrop: { n: 2, band: "top", flip: true },
    alt: "The org's Members tab: five members with their roles, Invite people, and the invites still pending",
  },
  {
    id: "teams/billing",
    route: "#/orgs/northwind/billing",
    backdrop: { n: 18, band: "top", flip: true },
    alt: "The org's Billing tab: the current plan, this month's spend against the spend limit, and the cost of each resource",
  },
  {
    id: "teams/notifications",
    route: "#/account/notifications",
    backdrop: { n: 11, band: "bottom", flip: true },
    alt: "The Notifications tab of the Account page: each email, from failed to live deploys, set to Off, Mine or All",
  },

  // Self-hosting
  {
    id: "self-hosting/admin",
    route: "#/admin/system",
    backdrop: { n: 6, band: "top", flip: true },
    alt: "The Admin page's System tab for platform admins: the build queue, replicas, runners and storage of the whole server",
  },
];
