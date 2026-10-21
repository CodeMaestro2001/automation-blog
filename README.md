# Signal — Central Publisher

A self-hosted dashboard that publishes one piece of content and its cover image to both:

- a JSON-based portfolio blog stored in GitHub
- the connected user's personal LinkedIn profile

Website publishing creates one atomic Git commit containing `content/blog/<slug>.json` and, when provided, `public/blog/<slug>.<ext>`. A deployment platform such as Vercel can rebuild the portfolio from that commit. LinkedIn publishing uses the official OAuth authorization-code flow and Share on LinkedIn API.

## Requirements

- Node.js 20.9 or newer
- a GitHub repository whose blog reader supports the generated JSON format
- a fine-grained GitHub personal access token
- a LinkedIn Developer app with the required products enabled

## Local setup

1. Clone this repository.
2. Copy `.env.example` to `.env.local`.
3. Fill the required values described below.
4. Run `npm install` and `npm run dev`.
5. Open `http://localhost:3000` and sign in with `PUBLISHER_PASSWORD`.

Generate strong values instead of reusing a personal password:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Use separate generated values for `PUBLISHER_PASSWORD` and `SESSION_SECRET`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PUBLISHER_PASSWORD` | Password used to access the private dashboard |
| `SESSION_SECRET` | Secret used to encrypt authentication and LinkedIn cookies |
| `GITHUB_TOKEN` | Fine-grained token with Contents read/write access to the portfolio repository |
| `GITHUB_REPOSITORY` | Target repository in `owner/repository` format |
| `GITHUB_BRANCH` | Target branch, usually `main` |
| `PORTFOLIO_URL` | Public portfolio origin used to build article links |
| `LINKEDIN_CLIENT_ID` | LinkedIn Developer app client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn Developer app client secret |
| `LINKEDIN_REDIRECT_URI` | Exact OAuth callback URL configured in LinkedIn |

Never commit `.env` or `.env.local`. Both are ignored by Git; only the empty `.env.example` template belongs in the repository.

## GitHub configuration

Create a fine-grained personal access token restricted to the target portfolio repository with **Contents: Read and write**, then configure:

```env
GITHUB_TOKEN=github_pat_...
GITHUB_REPOSITORY=your-user/your-portfolio-repository
GITHUB_BRANCH=main
PORTFOLIO_URL=https://your-domain.com
```

The target repository must support these generated files:

```text
content/blog/<slug>.json
public/blog/<slug>.<ext>
```

The JSON contains the post title, slug, excerpt, Markdown body, cover-image metadata, publication date, and reading time. If another portfolio uses a different content structure, adapt `src/lib/github.ts` and `src/app/api/publish/route.ts`.

## LinkedIn configuration

1. Create an app in the LinkedIn Developer Portal.
2. Add the **Share on LinkedIn** product (`w_member_social`).
3. Add **Sign In with LinkedIn using OpenID Connect** (`openid`, `profile`).
4. Add this exact authorized redirect URL in the app's **Auth** settings:

```text
https://YOUR-PUBLISHER-DOMAIN/api/linkedin/callback
```

5. Configure:

```env
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=https://YOUR-PUBLISHER-DOMAIN/api/linkedin/callback
```

Deploy the dashboard first so the HTTPS callback exists, then choose **Connect LinkedIn**. The access token is encrypted into a secure, HTTP-only cookie in that browser. Reconnect when the token expires.

The LinkedIn Page associated with the Developer app owns the app only. Published posts are sent to the personal profile that completes OAuth.

## Deploying to Vercel

1. Import this repository as a new Vercel project.
2. Add every variable from `.env.example` to the Production environment.
3. Set `LINKEDIN_REDIRECT_URI` to the deployed HTTPS callback URL.
4. Add the same callback URL to the LinkedIn app's authorized redirect URLs.
5. Deploy and connect LinkedIn from the dashboard.

Keep the dashboard URL private. Its pages and publishing APIs are password protected, and search-engine indexing is disabled.

Images are limited to JPG or PNG under 4 MB so the multipart request remains within common serverless request limits. A 1200 × 627 landscape image is recommended for LinkedIn.

## Publishing behavior

- The first non-empty line becomes the blog title and generates the URL slug automatically.
- The complete editor text becomes the LinkedIn post and article content.
- Draft text autosaves in the current browser's local storage; images are not persisted locally.
- Each selected destination reports its own success or failure.
- When both destinations are selected, the portfolio commit is staged without updating the deployment branch. It is promoted only after LinkedIn succeeds.
- If LinkedIn fails, the staged website commit is never promoted. If the final GitHub promotion fails, the LinkedIn post is deleted as a compensating rollback.
- Secrets, OAuth tokens, and the publisher password are never sent to client-side JavaScript.

## Checks

```powershell
npm run lint
npm run build
```

## License

Released under the [MIT License](LICENSE).
