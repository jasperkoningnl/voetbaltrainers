import { createOAuthHandlers } from '../oauth.mjs';
export default function handler(_req, res) { res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ service: 'managerhistory-github-auth', ready: createOAuthHandlers().ready() }); }
