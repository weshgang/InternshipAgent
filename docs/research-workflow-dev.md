# Workflow de développement : prendre de la hauteur sur le blocage « code de vérification » (2026-11-15)

Sources primaires uniquement, sauf mention « source secondaire ». **Fait** = ce que dit une source citée. **Reco** = ma recommandation.

## TL;DR

- **Fait** : les quatre produits de référence existent bien : Grok Bot (xAI), Muse (Meta), dots (OpenAI) et Poke (The Interaction Company). Aucun n'affirme aller lire tout seul un code de vérification dans la boîte mail personnelle de l'utilisateur. Les étapes réservées à un humain (SSO, passkey, CAPTCHA, code 2FA) sont rendues à l'utilisateur, par un formulaire sécurisé ou une prise de contrôle. Les actions sensibles (envoi, achat, changement de mot de passe) passent par une confirmation.
- **Fait** : une candidature ne crée pas toujours un compte. Chez Greenhouse, « Accounts are never created automatically ». Chez SmartRecruiters, l'accès au portail se ferait par code à usage unique, après la candidature (point non vérifié). Chez Workday, le compte obligatoire est un réglage propre à chaque employeur.
- **Reco** : arrêter d'investir dans la lecture de Gmail par l'interface web. Quand le lecteur échoue, demander tout de suite le code à l'étudiant, avec l'`ask()` qui existe déjà dans `src/fill.ts`. Le lecteur automatique devient un bonus. Grâce au coffre et au profil Chrome persistant, l'étudiant ne colle un code qu'une fois par site.
- **Reco** : appliquer une boucle courte et toujours la même : 1 scénario → capture réelle une seule fois → fixture → test ou eval hors ligne → 1 seul run réel. L'eval set se construit à partir des échecs réels (20 à 50 tâches).
- **Reco** : règle d'arrêt. Après 2 cycles de correction ratés sur un même blocage (ou une demi-journée), on contourne le blocage (humain dans la boucle ou sortie du périmètre) et on note la décision dans `docs/ledger.md`. Métrique n°1 : le nombre d'interventions humaines par candidature, réparties par type.

---

## 1. Les produits de référence

Tous ont été vérifiés le 2026-11-15. Les quatre noms correspondent à des produits réels, sans ambiguïté.

| | Grok Bot (xAI) | Muse (Meta) | dots (OpenAI) | Poke (Interaction Co.) |
|---|---|---|---|---|
| Lancement | Bêta le 11/08/2026 ([x.ai](https://x.ai/news/introducing-grok-bot)) | 08/09/2026 ([about.fb.com](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)) | 29/09/2026 ([openai.com](https://openai.com/index/introducing-dots/)\*) | Notes de version depuis 2025 ([poke.com](https://poke.com/docs/release-notes)) |
| Où il tourne | Un ordinateur cloud partagé par tous les Bots du compte, avec navigateur, terminal et fichiers persistants ([docs.x.ai](https://docs.x.ai/grok-bot/how-grok-bot-works)) | Une VM isolée par utilisateur, « Muse Secure VM » ([about.fb.com](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)) | Un ordinateur cloud par dot, actif 24 h/24 ([openai.com](https://openai.com/index/introducing-dots/)\*) | Service cloud joint par messagerie ([poke.com/docs](https://poke.com/docs)) |
| Canal | Apps desktop et mobile, X Chat, mention sur X, Slack ([FAQ](https://docs.x.ai/grok-bot/faq)) | App Muse ou **WhatsApp** (« works just like messaging another person ») | ChatGPT, Slack, Teams\* | Apple Messages, Telegram, WhatsApp, RCS ([poke.com/docs](https://poke.com/docs)) |
| Proactivité | Routines « on a schedule or when something happens » ; le Bot principal « checks in with you on its own » ([docs](https://docs.x.ai/grok-bot/how-grok-bot-works)) | « keeps working after people close the app, and comes back when something changes or when it needs approval » | Recherche de fond proactive, limitée à des outils en lecture seule ([help.openai.com](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs)\*) | Automatisations récurrentes ; Poke relance l'utilisateur sur celles qu'il ignore ([release notes](https://poke.com/docs/release-notes), 01/12/2025) |
| Identifiants | Ordre de recherche : Vault, puis 1Password, puis Secure Form. « your Bot never sees it » | Stockage sécurisé : Muse « has no visibility into people's passwords » | Formulaire de connexion sécurisé, sans exposer les identifiants au modèle\* | Les recettes guident l'authentification (« OAuth, API key, etc. ») ([docs](https://poke.com/docs/managing-integrations)) |
| Étapes humaines | SSO, passkey et CAPTCHA passent par une prise de contrôle : le Bot « should hand those steps to you rather than bypassing them » ([FAQ](https://docs.x.ai/grok-bot/faq)) | « checks with the person before sensitive actions like sending an email or making a purchase » ; un agent Sentinel filtre toute sortie vers Internet | L'utilisateur saisit lui-même le code 2FA dans le formulaire sécurisé et ne doit jamais le coller dans le chat. Changer un mot de passe ou transférer de l'argent demande une prise de contrôle\* ([help](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot)\*) | Une étape d'approbation existe pour les brouillons d'email (correctif « approval loops when drafting emails », 03/11/2025) |
| Email | Non documenté | Deux droits séparés : lire le courrier, ou aussi envoyer en son nom. La Muse dispose de sa propre adresse @muse.ai, distincte de la boîte perso ([meta.com help](https://www.meta.com/help/superintelligence/1149305437517250/)\*\*) | Via les apps connectées (plugins)\* | « Read, search, and draft emails » ([docs](https://poke.com/docs)) |

\* Pages openai.com et help.openai.com : la lecture directe a renvoyé une erreur 403. Le contenu cité vient des extraits de ces pages officielles affichés par le moteur de recherche. À relire dans un navigateur.
\*\* Page d'aide Meta illisible (bandeau cookies). L'info vient des extraits du moteur de recherche.

Autres faits utiles :
- Grok Bot propose des compétences enregistrées une fois (« watch you complete a task once ») ([x.ai](https://x.ai/news/introducing-grok-bot)). Les approbations demandées pendant un travail sans surveillance « expire after about 30 minutes » ([FAQ](https://docs.x.ai/grok-bot/faq)).
- Muse fournit « a complete audit trail of everything it has done and plans to do » ([about.fb.com](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/)).
- Poke a dû passer de WhatsApp à Telegram quand WhatsApp est devenu « temporarily unavailable » (02/02/2026), puis a ajouté Apple Messages le 04/06/2026 ([release notes](https://poke.com/docs/release-notes)). Leçon : il faut garder le canal derrière une interface, ce que prévoit déjà la décision `Channel` du brief (§3.10).
- *Source secondaire* : Amazon a bloqué Muse sur son site le 21/09/2026, au motif que l'agent ne s'identifiait pas en naviguant ([Wikipedia](https://en.wikipedia.org/wiki/Muse_(AI_agent))).

**Ce qu'un agent pour étudiants en finance peut en reprendre (Reco)** :
1. **La forme du produit.** Un fil de messagerie, du travail en arrière-plan, et un retour vers l'étudiant seulement pour une approbation ou une étape qui exige un humain. Les lots d'approbation (« 10 candidatures prêtes, je valide ? ») du brief, phase 1, collent exactement à ce modèle.
2. **Ce que ces produits n'automatisent pas exprès.** SSO, passkey, CAPTCHA, codes 2FA, changement de mot de passe, paiement : l'étape revient à l'humain. Le dépôt va déjà plus loin qu'eux sur un point : `src/auth/passwordReset.ts` réinitialise des mots de passe, même si c'est derrière un consentement.
3. **Les identifiants hors de portée du modèle.** C'est déjà fait (`src/auth/vault.ts`, `substitution.ts`).
4. **Une session persistante par agent.** Le profil Chrome dédié (`chrome-agent.sh`) joue le rôle de l'ordinateur cloud de dots et de Grok Bot. Une connexion par site, une seule fois.
5. **Un journal d'audit et des approbations qui expirent.** C'est le même rôle que `runs/<date>/...` aujourd'hui.

---

## 2. Workflow de dev d'agents : bonnes pratiques (faits)

**Simplicité et workflows avant agents**
- « finding the simplest solution possible, and only increasing complexity when needed ». Distinction : les *workflows* suivent des « predefined code paths », les *agents* décident eux-mêmes de leurs étapes ([Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)). Le « moteur rapide » du dépôt est un workflow, l'« agent complet » un agent : c'est le bon ordre.
- Les agents ont besoin d'une « ground truth » de l'environnement à chaque étape. Ils peuvent s'arrêter pour demander l'avis d'un humain à des points de contrôle ou face à un blocage. Il faut des « extensive testing in sandboxed environments » (même source).
- « maximize a single agent's capabilities first ». Les deux déclencheurs d'intervention humaine : **dépasser un seuil d'échecs** (« Set limits on agent retries or actions ») et les **actions à haut risque**. Conclusion du guide : « Start small, validate with real users, and grow capabilities over time » ([OpenAI, A practical guide to building agents, p. 31-32](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)).

**Evals à partir de traces réelles**
- « 20-50 simple tasks drawn from real failures is a great start ». Il faut convertir les échecs signalés en cas de test, isoler chaque essai (« starting from a clean environment »), noter le résultat plutôt que le chemin, et lire les transcriptions. Deux mesures : *pass@k*, la probabilité d'au moins un succès sur k essais, et *pass^k*, la probabilité que les k essais réussissent tous ([Anthropic, Demystifying evals for AI agents, 09/01/2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)). Pour un agent grand public, c'est pass^k qui compte : l'étudiant attend un succès à chaque fois.
- Commencer par un prototype, puis évaluer sur des tâches « grounded in real world uses ». Éviter les bacs à sable trop simplistes. Faire analyser les transcriptions par un agent. Rédiger des messages d'erreur exploitables par l'agent ([Anthropic, Writing effective tools for agents, 11/09/2025](https://www.anthropic.com/engineering/writing-tools-for-agents)).
- Trouver d'abord la référence avec le meilleur modèle, puis descendre en gamme : « Set up evals to establish a performance baseline » ([guide OpenAI, p. 8](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)).

**Fixtures et rejeu hors ligne (Playwright)**
- Chaque test doit être « completely isolated ». Pour les dépendances tierces : « use the Playwright Network API and guarantee the response needed » ([Best practices](https://playwright.dev/docs/best-practices)).
- HAR : `routeFromHAR(..., { update: true })` enregistre le trafic réel. Sans `update`, le test se rejoue sur le fichier HAR au lieu d'appeler le réseau ([Mock APIs](https://playwright.dev/docs/mock)).
- Trace : `context.tracing.start({ screenshots: true, snapshots: true })` puis `tracing.stop({ path: 'trace.zip' })`. La trace contient les actions, les instantanés DOM avant et après chaque action, le réseau et la console. On l'ouvre avec `npx playwright show-trace` ([Trace viewer](https://playwright.dev/docs/trace-viewer)).
- Authentification : « Authenticate once », puis réutiliser le `storageState` (cookies, localStorage, IndexedDB en option). Ne jamais committer ce fichier (« could be used to impersonate you »). sessionStorage n'est pas couvert. Prévoir un compte par worker si les tests modifient l'état côté serveur ([Authentication](https://playwright.dev/docs/auth)).

**Approbation humaine (gates)**
- Agents SDK : un outil avec `needsApproval` met le run en pause et renvoie des `interruptions` ; on les résout avec `state.approve()` ou `state.reject()`. L'état se sérialise (`result.state.toString()`) pour reprendre plus tard, ce qui convient aux longues attentes, par exemple une réponse sur WhatsApp ([OpenAI Agents SDK, Human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)).

**Le développeur avec un agent de code**
- « Give Claude something it can run that comes back pass or fail ». Par exemple : « A script that diffs output against a fixture ». Et : « after two failed corrections run `/clear` and write a better prompt instead of a third » ([Claude Code best practices](https://code.claude.com/docs/en/best-practices)).

---

## 3. Le blocage « code de vérification » : options

**Constat dans le dépôt.** `src/gmail.ts` pilote l'interface web de Gmail, utilise des classes DOM non documentées (`.adn`, `.a3s`, signalées par un commentaire `shortcut:`) et fait 1 à 2 appels LLM par tentative. Le test de non-régression `npm run check:email` exige le vrai Chrome et la vraie boîte de test : impossible de le lancer hors ligne. Dans `src/fill.ts`, une erreur du lecteur se termine en `status = 'failed'`, sans repli vers l'humain, alors que `ask()` (readline) existe déjà dans le même fichier. Le ledger et `runs/` montrent les échecs réels : expéditeur inattendu (« BPCE Recruiting Team »), ancien code relu dans le même fil, compte verrouillé.

**Les ATS demandent-ils vraiment une vérification email ? (faits)**
- **Workday** : Workday recommande de cocher « Require Candidate Home Account ». Si la case n'est pas cochée, « Workday selects the Enable Candidate Verification Email check box ». Le réglage appartient à chaque employeur. La page ne dit pas si la vérification passe par un code ou par un lien ([doc.workday.com, Set Up Candidate Home Accounts](https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/career-sites/gtv1538650489786.html)).
- **Greenhouse** : « Accounts are never created automatically ». Le compte MyGreenhouse se crée pour une alerte, l'autoremplissage ou le suivi. La connexion se fait sans mot de passe, par « single-use security code » envoyé par email ([MyGreenhouse FAQ](https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates)).
- **SmartRecruiters** : l'Application Tracking Portal serait accessible après la candidature, par un mot de passe à usage unique. Cette info vient d'extraits du moteur de recherche ; la page [customers.smartrecruiters.com](https://customers.smartrecruiters.com/kb/articles/5362-smartr-transition-announcement) est vide en lecture directe. Je n'ai pas trouvé de doc candidat officielle et lisible qui dise qu'on peut postuler sans compte : *non vérifié*. Le run WTTJ → SmartRecruiters du 14/11 (ledger) dira ce qu'il en est en pratique.
- **Oracle** (chaîne Natixis, d'après le ledger) : pas cherché.

**Options et compromis**

| Option | Ce que dit la source | Pour | Contre |
|---|---|---|---|
| A. **L'étudiant colle le code** (CLI aujourd'hui, Telegram ou WhatsApp demain) | C'est le modèle de dots : saisir soi-même le code 2FA, ne jamais le coller dans le chat (help.openai.com\*). Grok Bot rend lui aussi les étapes humaines | Zéro intégration, 100 % fiable, une seule fois par site grâce au coffre et au profil persistant, conforme à la règle `ask_human` du brief | Friction et délai ; l'étudiant doit être joignable (sans réponse, l'approbation expire, comme les 30 min de Grok) |
| B. Lecture de **Gmail web** (actuel) | Aucune API ; DOM non documenté | Déjà codé, sans OAuth | Fragile, non testable hors ligne, coûte des appels LLM ; c'est la boucle actuelle |
| C. **Gmail API** `users.messages.list` + `q` | `q` accepte `after:` en secondes epoch, mais pas les recherches sur tout le fil ni l'expansion d'alias ([Filtering](https://developers.google.com/workspace/gmail/api/guides/filtering)). `gmail.readonly` est un scope *restricted* : évaluation de sécurité obligatoire si l'on stocke ou transmet ces données sur des serveurs ([Scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)). En mode Testing : jetons valables 7 jours ([OAuth2](https://developers.google.com/identity/protocols/oauth2)), 100 testeurs maximum ([Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en)) | Déterministe, JSON facile à enregistrer en fixture, extraction par regex sans LLM | Écran « app non vérifiée », reconnexion chaque semaine, mise en place OAuth ; passer au-delà de 100 utilisateurs suppose vérification et audit |
| D. **Push** `users.watch` + Pub/Sub | Renouveler « at least once every 7 days ». La notification ne donne qu'un `historyId` : il faut ensuite appeler `history.list`. Les notifications peuvent être retardées ou perdues ([Push](https://developers.google.com/workspace/gmail/api/guides/push)) | Temps réel | Infrastructure GCP et endpoint public ; excessif pour un code attendu dans la minute |
| E. **IMAP** XOAUTH2 | Gmail accepte OAuth 2.0 via SASL XOAUTH2 ([IMAP](https://developers.google.com/workspace/gmail/imap/imap-smtp)) | Protocole standard | Même contrainte OAuth que C, sans avantage pour ce cas |
| F. **Plus-addressing** `prenom+cesure@gmail.com` | Les alias `+` arrivent dans la même boîte ([Gmail help](https://support.google.com/mail/answer/12096?hl=en)) | Recherche `to:...+cesure@ after:<epoch>` au lieu de deviner l'expéditeur, ce qui règle la cause n°1 du dernier commit ; les réponses des recruteurs restent dans la boîte de l'étudiant | Avec Workday, l'adresse devient l'identifiant Candidate Home (doc Workday ci-dessus), à garder constante par site. *Non vérifié* : certains formulaires refusent peut-être le `+` |
| G. **Boîte de test** Mailosaur ou AgentMail | Mailosaur : toute adresse `@SERVER_ID.mailosaur.net` fonctionne, `messages.get` attend le message, les codes arrivent extraits dans `text.codes` / `html.codes` ([Mailosaur + Playwright](https://mailosaur.com/docs/email-testing/playwright)). AgentMail : webhooks ou WebSockets sur `message.received` ([AgentMail](https://docs.agentmail.to/overview)) | Parfait pour l'**étudiant de test** (Clara Gold) : codes déterministes, plus de Gmail en dev | En production, contredit la décision du brief §3.5 (compte à l'adresse de l'étudiant, pour recevoir les réponses des recruteurs) |
| H. Mailpit | Outil qui « acts as an SMTP server » pour les emails interceptés en dev ([Mailpit](https://mailpit.axllent.org/docs/)) | — | Ne capte que le courrier de *ta* propre app, pas celui d'un ATS réel (mon inférence) : hors sujet |
| I. **Session persistante** | `storageState` / profil réutilisé ([Playwright auth](https://playwright.dev/docs/auth)) | Le code n'est demandé qu'à la création du compte, une fois par tenant | Ne supprime pas la première fois |
| J. **Sortir la création de compte du MVP** | Greenhouse ne crée pas de compte automatiquement ; Workday dépend de l'employeur ; SmartRecruiters non vérifié | Le critère « 7/10 sans intervention » devient atteignable sur les offres sans compte | Une partie des offres Workday et Oracle passe en « l'étudiant finit lui-même » |

**Recommandation**
1. **Maintenant** : A + I. Dans `src/fill.ts`, quand `readEmailCode` échoue, ne plus finir en `failed` : appeler `ask("Colle le code reçu par email de <site>")`, ou passer en `needs_human` si `NO_ASK` est actif (même schéma que pour `plan.missing`). Le lecteur Gmail web reste un essai automatique d'environ 50 s, gelé tel quel. C'est exactement le comportement de dots.
2. **Mesurer** pendant 1 à 2 semaines la fréquence réelle du code, par ATS et par tenant. Si plus d'environ 20 % des candidatures en ont besoin, passer à **F + C** : plus-addressing et Gmail API en lecture seule, avec extraction par regex testée sur des fixtures JSON. Sinon, ne rien construire de plus.
3. **En dev** : G pour l'étudiant de test, pour ne plus jamais dépendre de la vraie boîte Gmail pendant l'itération.
4. **Pas** de D, E ni H.

---

## 4. Workflow recommandé pour ce dépôt (Reco)

**La boucle (une itération = un scénario)**
1. **Choisir 1 scénario** et écrire en une ligne dans `docs/ledger.md` son critère de fin vérifiable. Exemple : « offre Workday X → `ready_to_submit`, 0 intervention sauf code ».
2. **Capturer en réel une seule fois.** Les snapshots par page sont déjà dans `runs/<date>/...`. Ajouter `context.tracing.start/stop` autour d'un run de `src/fill.ts` pour avoir une trace complète (à vérifier : la trace sur un contexte attaché par `connectOverCDP`, non testé). Pour un email, enregistrer le texte du message ou le JSON de l'API dans `test/fixtures/emails/`.
3. **En faire une fixture** dans `test/fixtures/` (il y a déjà `signup.html`, `login-*.html`) ou une entrée de l'eval de rejeu (`src/evalFill.ts`, `docs/eval-fill.md`). Chaque échec réel devient un cas : c'est ce que fait le ledger, mais sous forme de test.
4. **Itérer hors ligne** avec `npm run check` (typecheck et tests) et `npm run eval:fill` / `eval:drafts`. C'est la vérification pass/fail donnée à Claude Code. Viser pass^3 : 3 rejeux verts de suite.
5. **Un seul run réel** pour valider. S'il échoue, retour à l'étape 2 avec la nouvelle trace, pas de correctif à chaud.
6. **Noter** le résultat dans `docs/ledger.md` et les mesures dans `docs/demo-metrics.md`.

Pour le lecteur de code en particulier : transformer `scripts/check-email-reader.ts`, qui dépend du réseau, en test hors ligne. Enregistrer une seule fois l'arbre Gmail de la liste et le texte du message le plus récent, puis tester la sélection sur ces fichiers. On garde ainsi le cas de régression BPCE sans Chrome.

**Règle d'arrêt pour un blocage**
- Budget : **2 cycles de correction ratés** ou **½ journée** sur le même blocage. Cela reprend les « failure thresholds » du guide OpenAI et la règle « two failed corrections » de Claude Code.
- Au-delà, **contourner** dans cet ordre : (a) l'humain fait l'étape (`ask` / `needs_human`) ; (b) on sort le cas du périmètre (filtrer ces offres dans `src/select.ts`) ; (c) on met le sujet au backlog avec les traces capturées. On note une ligne « Ruling: … — cost if wrong: … » dans `docs/ledger.md`, au format déjà utilisé.
- Signal d'alerte : un commit « fix » de plus sur le même module (`src/gmail.ts` en a déjà) sans qu'aucun test hors ligne ne soit ajouté.

**Ce qu'il faut mesurer (par candidature, dans `runs/` et `docs/demo-metrics.md`)**
- Le statut final et l'étape d'échec : déjà fait.
- **Le nombre d'interventions humaines, par type** (code email, CAPTCHA, champ manquant, connexion), et le temps humain. C'est la métrique produit de dots, Grok et Muse : combien de fois on dérange l'utilisateur.
- La part de candidatures qui atteignent `ready_to_submit` sans autre intervention que le code (critère du brief : 7/10).
- Le besoin de code ou de compte par ATS et par tenant : c'est cette mesure qui décide de l'étape 2 de la recommandation §3.
- Le coût et le nombre d'appels LLM par candidature (déjà fait), plus le pass^3 de l'eval hors ligne à chaque changement de prompt.

Pour 10 à 30 étudiants : pas de file de tâches ni de cloud avant que ces chiffres soient stables sur l'étudiant de test, puis sur le profil du fondateur.

---

## Sources

Produits
- https://x.ai/news/introducing-grok-bot · https://docs.x.ai/grok-bot/how-grok-bot-works · https://docs.x.ai/grok-bot/faq
- https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/ · https://www.meta.com/help/superintelligence/1149305437517250/ (extrait du moteur de recherche)
- https://openai.com/index/introducing-dots/ · https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs · https://help.openai.com/en/articles/20001530-getting-started-with-your-dot (403 en lecture directe ; extraits du moteur de recherche)
- https://poke.com/docs · https://poke.com/docs/managing-integrations · https://poke.com/docs/release-notes
- Source secondaire : https://en.wikipedia.org/wiki/Muse_(AI_agent)

Développement d'agents
- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://code.claude.com/docs/en/best-practices
- https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- https://playwright.dev/docs/best-practices · https://playwright.dev/docs/mock · https://playwright.dev/docs/trace-viewer · https://playwright.dev/docs/auth

Email et ATS
- https://developers.google.com/workspace/gmail/api/guides/filtering · https://developers.google.com/workspace/gmail/api/guides/push · https://developers.google.com/workspace/gmail/api/auth/scopes · https://developers.google.com/workspace/gmail/imap/imap-smtp
- https://developers.google.com/identity/protocols/oauth2 · https://support.google.com/cloud/answer/15549945?hl=en · https://support.google.com/mail/answer/12096?hl=en
- https://mailosaur.com/docs/email-testing/playwright · https://mailpit.axllent.org/docs/ · https://docs.agentmail.to/overview
- https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/career-sites/gtv1538650489786.html
- https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates
- https://customers.smartrecruiters.com/kb/articles/5362-smartr-transition-announcement (vide en lecture directe ; extraits du moteur de recherche)
