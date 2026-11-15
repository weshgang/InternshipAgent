import { createServer, type Server } from 'node:http';

// Fake career site: classic login, SSO popup chooser, forgot-password link sent to a fake inbox, captcha page.
export type Fake = { base: string; users: Record<string, string>; inbox: { to: string; link: string }[]; ssoPicked: string[]; sessions: Set<string>; close: () => Promise<void> };
export async function startFake(users: Record<string, string>): Promise<Fake> {
  const f: Fake = { base: '', users, inbox: [], ssoPicked: [], sessions: new Set(), close: async () => {} };
  const page = (body: string) => `<html><body>${body}</body></html>`;
  const sid = (c = '') => /sid=(\w+)/.exec(c)?.[1];
  const login = (err = '') => page(`<h1>Connexion</h1>${err}<form method="post" action="/login"><input type="email" name="email"><input type="password" name="password"><button type="submit">Se connecter</button></form><a href="/forgot">Mot de passe oublié ?</a> <a href="/signup">Créer un compte</a>`);
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url!, f.base); const ok = f.sessions.has(sid(req.headers.cookie) ?? '');
    let body = ''; for await (const c of req) body += c; const form = new URLSearchParams(body);
    const send = (html: string, code = 200, h: Record<string, string> = {}) => { res.writeHead(code, { 'content-type': 'text/html', ...h }); res.end(html); };
    const session = () => { const id = Math.random().toString(36).slice(2); f.sessions.add(id); return { 'set-cookie': `sid=${id}; Path=/` }; };
    if (url.pathname === '/login' && req.method === 'POST') {
      return f.users[form.get('email') ?? ''] === form.get('password') ? send('', 302, { location: '/account', ...session() }) : send(login('<p>Identifiants incorrects</p>'));
    }
    if (url.pathname === '/login') return ok ? send('', 302, { location: '/account' }) : send(login());
    if (url.pathname === '/account') return ok ? send(page('<a href="/logout">Déconnexion</a><h1>Mon compte</h1>')) : send('', 302, { location: '/login' });
    if (url.pathname === '/captcha') return send(page('<h1>Connexion</h1><div class="g-recaptcha"></div><input type="email" name="email"><input type="password"><button>Se connecter</button>'));
    if (url.pathname === '/sso') return send(page(`<h1>Se connecter</h1><button onclick="window.open('/chooser','c','width=400,height=400')">Continuer avec Google</button><input type="email" name="email"><input type="password"><button>Se connecter</button>
      <script>setInterval(()=>fetch('/whoami').then(r=>r.json()).then(j=>{if(j.ok)location='/account'}),300)</script>`));
    if (url.pathname === '/chooser') return send(page(`<button onclick="pick('other@x.fr')">other@x.fr</button><button onclick="pick('a@b.fr')">a@b.fr</button>
      <script>function pick(e){fetch('/sso-done?email='+e).then(()=>window.close())}</script>`));
    if (url.pathname === '/sso-done') { f.ssoPicked.push(url.searchParams.get('email')!); res.writeHead(200, session()); return res.end('ok'); }
    if (url.pathname === '/whoami') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok })); }
    if (url.pathname === '/forgot' && req.method === 'POST') { f.inbox.push({ to: form.get('email')!, link: `${f.base}/reset?t=${Math.random().toString(36).slice(2)}` }); return send(page('<p>Email envoyé</p>')); }
    if (url.pathname === '/forgot') return send(page('<h1>Mot de passe oublié</h1><form method="post"><input type="email" name="email"><button>Envoyer</button></form>'));
    if (url.pathname === '/reset' && req.method === 'POST') { f.users['a@b.fr'] = form.get('p1')!; return send('', 302, { location: '/login' }); }
    if (url.pathname === '/reset') return send(page('<h1>Nouveau mot de passe</h1><form method="post"><input type="password" name="p1"><input type="password" name="p2"><button>Valider</button></form>'));
    send(page('404'), 404);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  f.base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  f.close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); });
  return f;
}
