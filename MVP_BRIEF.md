# Brief MVP : agent de candidature pour étudiants en recherche de césure

Ce document donne tout le contexte nécessaire pour construire un MVP rapide. Objectif unique de cette phase : prouver que c'est techniquement faisable et mesurer le taux de réussite et le coût par candidature. Pas de design, pas de scale, pas de RGPD à ce stade.

---

## 1. Le produit

Un agent IA "always-on", dans l'esprit de Grok Bot (xAI), Muse (Meta), Dots (OpenAI) et Poke, mais spécialisé recherche de stage pour étudiants qui cherchent leur première partie de césure.

L'étudiant discute avec l'agent (WhatsApp à terme) pour définir :
- les cibles (secteurs, entreprises, types de postes, villes, dates)
- les personnes à contacter (ou le type de profils : analystes, associates, RH, alumni)

L'agent ensuite :
1. Candidate automatiquement aux offres (JobTeaser de l'école, sites carrières Workday / Greenhouse / SmartRecruiters / etc.), à la chaîne ou en parallèle sur des sites différents, avec plafonds.
2. Envoie des emails de networking personnalisés et relance.
3. Prépare (et à terme envoie) des messages LinkedIn.

Taille visée : 10 à 30 étudiants. Les étudiants ont leur Mac/PC allumé pendant leurs sessions de recherche.

Ce projet pivote un site existant (React + Vite sur Vercel) qui a déjà un dashboard et un écran de génération/programmation d'emails adaptés au parcours de chaque utilisateur.

---

## 2. Périmètre du MVP (phase 0 : spike de faisabilité)

Construire en local, en CLI, sans interface ni WhatsApp au début. 4 scénarios à faire passer de bout en bout :

| # | Scénario | Résultat attendu |
|---|---|---|
| S1 | JobTeaser, offre "Candidature simplifiée" | Formulaire rempli, CV uploadé, arrêt sur le bouton final (dry-run) puis envoi réel sur 1 offre test |
| S2 | Workday (et 1 autre ATS : Greenhouse ou SmartRecruiters) | Création de compte candidat, récupération du code de vérification email, formulaire multi-pages rempli, arrêt avant envoi |
| S3 | Email de networking | Rédaction personnalisée à partir du profil + du contact, envoi depuis l'adresse de l'étudiant |
| S4 | LinkedIn | Ouvrir le profil cible, rédiger l'invitation ou le message, s'arrêter avant "Envoyer" |

Phase 1 (seulement si la phase 0 passe) : boucle WhatsApp Cloud API, validation par lot ("10 candidatures prêtes, je valide ?"), file de tâches, plafonds.

### Métriques à logger pour chaque run
- succès / échec / étape d'échec
- nombre d'actions navigateur
- tokens et coût LLM
- durée
- captures d'écran de chaque étape (dossier `runs/<date>/<scenario>/`)

---

## 3. Décisions techniques déjà prises (et pourquoi)

### 3.1 Où tourne le navigateur
Hybride :
- Local, dans le vrai Chrome de l'étudiant pour LinkedIn et JobTeaser. Raisons : IP résidentielle, sessions déjà connectées (SSO école, 2FA), pas de mot de passe à stocker, beaucoup moins de captchas et de détection.
- Cloud pour les ATS d'entreprises (Workday etc.), où la parallélisation est utile et où l'étudiant n'a pas de session existante. Phase 0 : on peut tout faire en local d'abord, le cloud est un test secondaire.

### 3.2 Piloter le Chrome local (attention Chrome 136+)
Depuis Chrome 136, `--remote-debugging-port` est ignoré sur le profil par défaut (il faut un `--user-data-dir` non standard). Options qui contournent :
1. Réglage natif : `chrome://inspect/#remote-debugging` → activer "Allow remote debugging for this browser instance", puis Playwright se connecte au Chrome en cours (`--cdp-endpoint=chrome` pour Playwright MCP, ou équivalent `connectOverCDP`). À vérifier en premier.
2. Extension : Playwriter (extension + CLI, API Playwright complète sur les onglets existants) ou Playwright MCP Bridge (`@playwright/mcp --extension`).
3. Fallback : profil Chrome dédié à l'agent (`--user-data-dir=~/.agent-profile --remote-debugging-port=9222`), l'étudiant s'y connecte une fois à JobTeaser, LinkedIn, Gmail.
4. Alternative Python : browser-use open source, `Browser.from_system_chrome()`.

### 3.3 Cloud (test secondaire)
- Browser Use Cloud : Profile Sync copie les cookies du Chrome local vers un profil cloud (un profil par étudiant), proxies par pays (prendre FR), CAPTCHA gérés.
- Steel (open source Apache 2.0, plan Hobby gratuit 100 h/mois, Profiles, Credentials API, TOTP).
- Browserbase (Contexts + Session Live View pour login manuel une fois, CAPTCHA solving par défaut).
- Orgo (VM desktop complète, 0,055 $/h allumée, 0,0027 $/h arrêtée, disque persistant, live view VNC intégrable) : utile si besoin d'un vrai desktop, sinon un navigateur cloud suffit.

### 3.4 Lecture des pages
DOM / arbre d'accessibilité en priorité (moins cher, plus fiable sur les formulaires), captures d'écran uniquement en secours. Upload de CV : jamais la fenêtre système, utiliser `setInputFiles` (Playwright).

### 3.5 Codes de vérification email (Workday etc.)
Les comptes ATS sont créés avec l'email de l'étudiant (les recruteurs répondent à cette adresse). Options :
- Phase 0 : l'agent ouvre un onglet Gmail dans le même navigateur et lit le code.
- Ensuite : règle de transfert Gmail (expéditeurs myworkday, greenhouse, smartrecruiters...) vers une boîte AgentMail que l'agent interroge par API.

Un compte Workday = une entreprise (chaque entreprise a son tenant). Générer et stocker localement un mot de passe par tenant.

### 3.6 Emails
- Phase 0 : envoi via l'interface web Gmail dans le navigateur de l'étudiant (zéro OAuth), ou Gmail API en mode "Testing" Google Cloud.
- Gmail API mode Testing : max 100 utilisateurs, écran "app non vérifiée", tokens qui expirent tous les 7 jours (reconnexion hebdo). Acceptable pour 30 étudiants. Au-delà : vérification Google + audit CASA (scopes restricted pour lire les réponses).
- Adresses école en Microsoft 365 : la DSI peut bloquer les apps tierces → l'envoi via l'interface web contourne.

### 3.7 LinkedIn
- Pas d'API officielle pour envoyer messages/invitations.
- Compte gratuit : invitations avec note limitées (environ 5 par mois). Invitations environ 100 par semaine. Messages aux connexions de 1er niveau : OK à volume modéré.
- MVP : l'agent prépare, l'étudiant clique "Envoyer". Envoi automatique seulement en option, local uniquement, rythme humain, faible volume.

### 3.8 JobTeaser
- Deux types d'offres : "Candidature simplifiée" (postuler dans JobTeaser, données transmises à l'ATS de l'entreprise) et redirection vers le site du recruteur (on bascule alors sur le flux ATS).
- Accès via le career center de l'école (SSO), donc navigateur local avec session existante.
- Rythme humain, à la chaîne, pauses irrégulières, plafond quotidien. Pas de parallèle sur le même compte.

### 3.9 Captchas
En local : rares. Si captcha : pause + notification à l'étudiant pour qu'il le résolve (live view ou fenêtre locale). Les navigateurs cloud (Browser Use, Browserbase) les résolvent automatiquement, à tester en phase cloud.

### 3.10 Canal (phase 1)
WhatsApp Cloud API officielle. En UE, la Commission européenne a ordonné à Meta (juin 2026) de rétablir l'accès gratuit aux assistants IA tiers pendant l'enquête antitrust. Ne pas utiliser Baileys (session WhatsApp Web non officielle) pour un service multi-utilisateurs : risque de ban. Alternative iMessage : relais type Sendblue. Fallback simple : Telegram.

Coût WhatsApp (mis à jour) : depuis le 1er octobre 2026, les messages de service sont payants au-delà de 1 000 messages gratuits par mois et par numéro (environ 0,02 à 0,03 € par message en France). À 30 étudiants x 130 messages, cela fait environ 2 € par étudiant et par mois, soit le 2e poste de coût après le LLM.
Décision phase 1 : coder le canal derrière une interface `Channel` (send, receive, sendApprovalBatch). Implémenter d'abord Telegram (gratuit) ou une web app PWA avec notifications push (gratuit), WhatsApp ensuite si le prix de vente le permet. Grouper les notifications et les réponses pour limiter le nombre de messages.

### 3.10b MODÈLE RETENU POUR LE MVP (prioritaire sur la section 3.11)
Le fondateur dispose maintenant de 20 € de crédits API Anthropic (Claude Console). Décision :

| Rôle | Modèle | ID | Prix (par million de tokens, entrée / sortie) | Pourquoi |
|---|---|---|---|---|
| Navigation, mapping des champs, tri des offres, conversation | Claude Haiku 5.5 | `claude-haiku-5-5` | 0,10 $ / 0,50 $ (prompts jusqu'à 100k tokens) ; au-delà de 100k : 0,50 $ / 2,50 $ | Le moins cher du marché pour cet usage, 72,4 % sur OSWorld 2.1, rapide |
| Rédaction lettres de motivation et emails de networking | Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2 $ / 10 $ | Qualité du français ; utilisé uniquement pour le texte final |
| Interdit dans la boucle de navigation | Opus 5.5 / Sonnet 5.5 | | | Une boucle de navigation sur Sonnet coûte environ 20x plus cher |

`.env` :
```
LLM_BACKEND=api
ANTHROPIC_API_KEY=...
LLM_FAST_MODEL=claude-haiku-5-5
LLM_WRITER_MODEL=claude-sonnet-5-5
LLM_BUDGET_EUR=20
```

Règles de consommation (obligatoires) :
1. Snapshot de page toujours sous 100 000 tokens (sinon Haiku coûte 5x plus). Élaguer l'arbre d'accessibilité : garder uniquement les éléments interactifs, leurs libellés et le texte proche ; tronquer le reste. Logger la taille de chaque prompt et refuser l'appel si > 90k tokens.
2. Prompt caching Anthropic activé sur la partie fixe (instructions système + profil candidat + schéma des outils). Lecture en cache : 0,01 $ / million sur Haiku.
3. Compteur de dépense : après chaque appel, calculer le coût à partir du champ `usage` de la réponse, cumuler dans `runs/spend.json`, afficher le total en fin de run, et stopper tout si `LLM_BUDGET_EUR` est atteint.
4. Pendant les tests de développement, `LLM_WRITER_MODEL` peut être mis à `claude-haiku-5-5` pour économiser ; repasser à Sonnet pour comparer la qualité.
5. Mettre aussi une limite de dépense dans la Claude Console (garde-fou côté Anthropic).

Attention Claude Code : si Claude Code tourne avec la même `ANTHROPIC_API_KEY` dans le terminal, le développement lui-même consomme les 20 €. Utiliser Claude Code avec un abonnement (ou une autre clé) et réserver cette clé à l'agent, chargée uniquement depuis le `.env` du projet.

Budget estimé avec l'architecture de la section 3.12 :
- Candidature (environ 6 appels Haiku de 15k tokens + 1 lettre Sonnet) : environ 0,03 $.
- Email de networking (Sonnet) : environ 0,01 $.
- 20 € couvrent donc plusieurs centaines de candidatures de test. Avec l'ancienne boucle "1 appel par clic", une candidature coûte environ 0,13 $ sur Haiku et plus de 2 $ sur Sonnet : à proscrire.

Les adaptateurs de la section 3.11 restent utiles plus tard (comparaison avec DeepSeek V4 Pro pour la rédaction, voir 3.15), mais le backend par défaut est `api` avec les modèles ci-dessus.

### 3.11 Choix du modèle et facturation (contexte historique : quota Google gratuit malgré Google AI Pro)
Constat : l'abonnement Google AI Pro ne couvre PAS l'API Gemini (clé API = niveau gratuit ou paiement au token). Il couvre seulement l'interface AI Studio, Gemini CLI et Gemini Code Assist.

Pour le MVP (usage personnel, sur le Chrome du fondateur), utiliser un abonnement via un CLI en mode headless, avec Playwright MCP branché dessus :

| Abonnement | Outil | Commande non interactive | Limite |
|---|---|---|---|
| Google AI Pro | Gemini CLI connecté avec le compte Google (pas de clé API) | `gemini -p "..."` + serveur MCP Playwright | 1 500 requêtes/jour (1 prompt agent = plusieurs requêtes). Si bloqué à 250 : relancer la session pour que l'abonnement soit reconnu |
| ChatGPT Plus/Pro | Codex CLI "Sign in with ChatGPT" | `codex exec "..."` + MCP | Fenêtres 5 h + hebdo |
| Claude Pro/Max | Claude Code / Agent SDK avec `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`), sans `ANTHROPIC_API_KEY` dans l'env | `claude -p` / Agent SDK | Crédit mensuel séparé pour l'usage programmatique (règle mouvante, vérifier la page d'aide Anthropic) |

Piste à vérifier : Google AI Pro donne des crédits API gratuits à réclamer dans le dashboard Google Developer Program. Si oui, utiliser une vraie clé API (plus rapide qu'un CLI).

Implémentation : une couche `llm/` avec des adaptateurs interchangeables (`gemini-cli`, `codex-cli`, `claude-sdk`, `api`) derrière une même interface `complete(prompt, schema)` / `agentStep(...)`. Choix via `LLM_BACKEND` dans `.env`.

Règle : les abonnements sont pour usage personnel. Dès qu'on sert d'autres étudiants : clés API (Anthropic interdit explicitement de router les requêtes d'utilisateurs tiers via un abonnement Pro/Max).

Note : un CLI ajoute de la latence à chaque appel (démarrage du process, boucle agent). Il règle le coût, pas la vitesse. La vitesse se règle avec la section 3.12.

### 3.12 Vitesse (problème rencontré : l'agent est trop lent sur Chrome)
Cause : une boucle "1 appel LLM = 1 action" (capture, raisonnement, clic, on recommence). Un formulaire Workday = 40 à 80 allers-retours.

Architecture imposée, par ordre d'impact :
1. Remplissage par lot. Pour chaque page : `snapshot()` de l'arbre d'accessibilité → UN appel LLM qui renvoie un JSON `{ref_champ: valeur}` pour tous les champs + l'action suivante (bouton "Suivant") → Playwright remplit tout de façon déterministe, sans LLM. Objectif : 1 appel LLM par page, 3 à 6 par candidature.
2. Pas de captures d'écran sauf en secours (page illisible via l'arbre d'accessibilité).
3. Deux modèles : Claude Haiku 5.5 pour le mapping des champs et la navigation, Claude Sonnet 5.5 uniquement pour rédiger lettres et emails (voir 3.10b). La lettre est générée en parallèle pendant la navigation.
4. Parcours enregistrés ("show once, run forever"). Après une candidature réussie sur un site (JobTeaser, un tenant Workday donné), sauvegarder la séquence d'étapes et les sélecteurs dans `recipes/<domaine>.json`. Les fois suivantes, rejouer la recette sans LLM ; n'appeler le LLM que si un sélecteur échoue ou si un champ inconnu apparaît.
5. Mapping profil → champs mis en cache : un dictionnaire `libellé de champ normalisé → clé du profil` qui grossit à chaque run (ex. "Date de disponibilité", "Available start date" → `cesure.debut`). Les champs connus sont remplis sans LLM.
6. Parallélisme : un onglet par entreprise ; pendant qu'une candidature attend un code email, une autre avance.

Métrique à ajouter dans les logs : nombre d'appels LLM par candidature et durée par page. Cible : moins d'1 minute par candidature Workday une fois la recette enregistrée.

### 3.13 Licences / code tiers
- OrgoAI/bops : licence FSL-1.1-ALv2, interdit de l'utiliser comme produit concurrent ou hébergé. S'en servir comme référence d'architecture uniquement, ne pas copier le code.
- Libres d'usage : Hermes Agent (MIT), Playwright (Apache 2.0), Stagehand (MIT), Steel browser (Apache 2.0), browser-use (open source), Skyvern (auto-hébergeable).

### 3.14 Coûts, quotas et prix (à implémenter dès le MVP)
Coût estimé par étudiant et par mois à 30 étudiants (micro-entreprise en franchise de TVA, donc pas de TVA facturée) :

| Poste | Avec WhatsApp | Avec Telegram / web app |
|---|---|---|
| LLM (Haiku 5.5 navigation + Sonnet 5.5 ou DeepSeek V4 Pro rédaction) | 1,7 à 2,5 € | 1,7 à 2,5 € |
| Messagerie | environ 2 € | 0 € |
| Navigateur cloud (environ 3 h, Steel / Kernel) | 0,25 € | 0,25 € |
| Stripe (1,5 % + 0,25 €) | 0,36 € | 0,36 € |
| URSSAF micro-entreprise (environ 21 à 26 %) | environ 1,50 € | environ 1,50 € |
| Hunter Starter (49 $/mois, 2 000 crédits, réparti sur 30) | 1,60 € | 1,60 € |
| Hébergement, base, domaine (environ 15 €/mois) | 0,50 € | 0,50 € |
| Total | 7,9 à 8,7 € | 5,9 à 6,7 € |

À 10 étudiants, ajouter environ 2 € par étudiant (coûts fixes moins répartis).

Prix de vente envisagés : 7 €/mois seulement avec Telegram ou web app, à 30 étudiants ou plus, avec quotas stricts. Sinon 9,99 €/mois ou 29 € la campagne de 3 mois.

Quotas par étudiant et par mois, à implémenter comme compteurs en base avec blocage et message clair à l'étudiant :

| Ressource | Quota | Compteur |
|---|---|---|
| Candidatures envoyées | 60 | `applications_sent` |
| Emails trouvés + envoyés | 70 | `emails_found`, `emails_sent` |
| Messages échangés avec l'agent | 150 | `messages` |
| Heures de navigateur cloud | 5 | `cloud_browser_minutes` |
| Coût LLM | 2,50 € (coupe-circuit) | `llm_cost_eur`, calculé depuis `usage` |

Au-delà : attente du mois suivant ou recharge (ex. 3 € pour 30 candidatures).

Réductions de coût à coder :
- Emails : deviner d'abord l'adresse depuis le format de l'entreprise (prenom.nom@domaine) + vérification ; appeler Hunter seulement en cas d'échec.
- Navigateur : privilégier le Chrome local de l'étudiant ; le cloud seulement pour les ATS en parallèle.
- LLM : prompt caching, recettes enregistrées, cache de mapping des champs (3.12).

### 3.15 Test qualité rédaction : Sonnet 5.5 vs DeepSeek V4 Pro
DeepSeek V4 Pro (environ 1,32 $ / 3,96 $ par million de tokens) peut remplacer Sonnet 5.5 pour la rédaction et économiser environ 0,85 € par étudiant et par mois. À valider avant tout changement : générer 10 lettres et 10 emails avec chaque modèle à partir du même profil, comparer à l'aveugle sur la qualité du français. Haiku 5.5 reste le modèle de navigation (moins cher que tous les modèles chinois testés : DeepSeek Flash, MiniMax M2.7, Qwen 3.6 Plus, GLM-5.2, Kimi K2.6). Point à régler avant la vente : l'API DeepSeek est servie depuis la Chine ; préférer les mêmes poids via un hébergeur occidental pour des CV d'étudiants.

---

## 4. Patterns à reprendre des produits existants

- Bops : approbations (lecture immédiate ; envoi / création / paiement en attente de validation ; mode "Just do it" optionnel), "watches" qui surveillent une boîte ou une page, coffre à identifiants que le modèle ne voit jamais, mémoire par utilisateur.
- Poke : un agent d'interaction léger côté messagerie qui délègue à des agents d'exécution (ici : l'agent de candidature sur navigateur).
- OpenClaw / Hermes : isolation des sessions par expéditeur, appairage et allowlist.
- Muse : sous-agent navigateur qui travaille sur l'arbre d'accessibilité.
- Skyvern : blocs Login + gestion 2FA/TOTP, `totp_url` appelé quand un code est nécessaire. Option : utiliser Skyvern comme moteur de formulaires au lieu de coder la boucle.

---

## 5. Architecture cible du MVP

```
[Étudiant] --(CLI en phase 0, Telegram / web app puis WhatsApp en phase 1)--> [Orchestrateur Node/TS]
                                                         |
         +-----------------------+-----------------------+---------------------+
         |                       |                       |                     |
  [Profil candidat JSON]  [Agent navigateur]      [Agent email]          [Logs + métriques]
                          (Playwright + LLM)
                                 |
              +------------------+------------------+
              |                                     |
   [Chrome local de l'étudiant]          [Navigateur cloud, optionnel]
   JobTeaser, LinkedIn, Gmail web        ATS (Workday, Greenhouse...)
```

### Stack proposée
- TypeScript / Node (cohérent avec le site React + Vite existant).
- Playwright (`connectOverCDP` ou Playwriter) pour le navigateur local.
- Option à évaluer : Stagehand (MIT, au-dessus de Playwright : act / extract / observe) pour accélérer.
- LLM : API Anthropic via le SDK officiel (`@anthropic-ai/sdk`), `claude-haiku-5-5` pour naviguer, `claude-sonnet-5-5` pour rédiger, compteur de dépense et budget de 20 € (section 3.10b). Couche d'adaptateurs conservée pour pouvoir tester d'autres modèles (3.11, 3.15).
- Playwright (`connectOverCDP` sur le Chrome local, ou Playwriter) piloté directement par le code de l'orchestrateur, pas via un CLI.
- Stockage : fichiers JSON / SQLite en phase 0.

### Outils exposés à l'agent navigateur
`navigate(url)`, `snapshot()` (arbre d'accessibilité), `click(ref)`, `fill(ref, value)`, `select(ref, value)`, `upload(ref, path)`, `wait(ms)`, `screenshot()`, `read_email_code(sender_filter)`, `ask_human(question)`, `finish(status, summary)`.

Règle : `ask_human` dès qu'une info manque dans le profil ou qu'un captcha apparaît. Ne jamais inventer.

### Profil candidat (onboarding)
```json
{
  "identite": { "prenom": "", "nom": "", "email": "", "telephone": "", "ville": "" },
  "ecole": { "nom": "", "programme": "", "annee": "", "diplome_prevu": "" },
  "cesure": { "type": "premiere partie", "debut": "", "duree_mois": 6, "lieux": [] },
  "cibles": { "secteurs": [], "postes": [], "entreprises_prioritaires": [], "exclusions": [] },
  "experiences": [ { "entreprise": "", "poste": "", "dates": "", "missions": [] } ],
  "competences": [],
  "langues": [],
  "documents": { "cv_fr": "./cv_fr.pdf", "cv_en": "./cv_en.pdf" },
  "reponses_types": {
    "pourquoi_nous": "",
    "disponibilite": "",
    "pretentions": "",
    "droit_au_travail": "",
    "permis": ""
  },
  "linkedin_url": ""
}
```

### Garde-fous
- `DRY_RUN=true` par défaut : l'agent s'arrête avant tout bouton d'envoi final et fait une capture.
- Plafonds configurables : candidatures par jour, par site, emails par jour, actions LinkedIn par jour.
- Délais aléatoires entre actions (rythme humain).
- Une candidature = un dossier de run avec captures + JSON de résultat.

---

## 6. Plan de travail proposé

1. Setup repo TS, Playwright, connexion au Chrome local (tester d'abord le toggle `chrome://inspect/#remote-debugging`, sinon Playwriter, sinon profil dédié). Livrable : script qui liste les onglets ouverts et lit le titre de JobTeaser connecté.
2. Couche LLM sur l'API Anthropic (3.10b) : Haiku 5.5 + Sonnet 5.5, prompt caching, compteur de dépense, coupure à `LLM_BUDGET_EUR`, refus des prompts > 90k tokens. Puis moteur de remplissage par lot (3.12) : snapshot élagué → 1 appel Haiku → remplissage déterministe → page suivante. Logs + métriques (appels LLM, tokens, coût, durée par page).
2c. Compteurs et quotas par étudiant (3.14), même avec un seul utilisateur, pour mesurer le coût réel par candidature et par email.
2b. Recettes enregistrées et cache de mapping des champs (3.12, points 4 et 5) dès que S1 passe une première fois.
3. S1 JobTeaser Candidature simplifiée en dry-run, puis 1 envoi réel.
4. S2 Workday : création de compte + code email via onglet Gmail + formulaire multi-pages, dry-run.
5. S3 email networking (Gmail web).
6. S4 LinkedIn : préparation du message, arrêt avant envoi.
7. Rapport : tableau des runs (succès, étapes, coût, durée), principaux points de casse.
8. Optionnel : rejouer S2 sur Browser Use Cloud ou Steel avec profil synchronisé, comparer.

Critère de succès phase 0 : au moins 7 candidatures sur 10 qui vont jusqu'au bouton final sans intervention (hors captcha / question manquante), et un coût par candidature mesuré.

---

## 7. Docs de référence

- Playwright, connexion à un navigateur existant : https://playwright.dev/mcp/configuration/browser-extension
- Chrome 136, changement remote debugging : https://developer.chrome.com/blog/remote-debugging-port
- Playwriter : https://claudemarketplaces.com/mcp/remorses/playwriter
- Browser Use, auth agents (profils, TOTP, AgentMail) : https://browser-use.com/posts/web-agent-authentication
- Browser Use Profile Sync : https://docs.browser-use.com/cloud/guides/profile-sync
- Browserbase authentification : https://docs.browserbase.com/best-practices/authentication
- Skyvern 2FA / credentials : https://docs-new.skyvern.com/credentials/totp
- Orgo (VM pour agents) : https://docs.orgo.ai/llms-full.txt
- Bops (référence d'architecture uniquement, licence FSL) : https://github.com/OrgoAI/bops
- Hermes Agent messaging : https://hermes-agent.nousresearch.com/docs/user-guide/messaging/
- JobTeaser Candidature simplifiée : https://help-companies.jobteaser.com/hc/fr/articles/19602175613212
- Workday, un compte par entreprise : https://jobwizard.ai/blog/why-workday-creates-a-new-account-for-every-company
- Google OAuth mode Testing (100 users, 7 jours) : https://nango.dev/docs/api-integrations/google-shared/google-security-review.md
- WhatsApp, décision UE accès gratuit : https://aiweekly.co/node/2837
- Gemini CLI quotas (Google AI Pro 1 500 req/jour) : https://geminicli.com/docs/resources/quota-and-pricing
- Google AI plans (abonnement limité à l'UI AI Studio, pas l'API) : https://ai.google.dev/gemini-api/docs/google-ai-plans
- Codex CLI avec un plan ChatGPT : https://inventivehq.com/blog/codex-cli-pricing-explained
- Claude Agent SDK et abonnements : https://inventivehq.com/blog/claude-agent-sdk-guide
- Skyvern ("show once, run forever") : https://www.skyvern.com/md/index.md
- Prix Claude Haiku 5.5 (seuil 100k tokens) : https://www.implicator.ai/claude-haiku-5-5-matches-gpt-6-luna-pricing/
- Haiku 5.5 sur OSWorld / meilleurs modèles navigateur : https://apidog.com/blog/best-llm-for-browser-agents/
- Prix DeepSeek (nov. 2026) : https://www.benchlm.ai/deepseek/api-pricing
- WhatsApp, messages de service payants depuis oct. 2026 : https://help.sleekflow.io/en_US/daftar-harga
- Stripe France : https://sellfy.com/fr/outils/calculateur-de-frais-stripe/
- URSSAF micro-entreprise 2026 : https://lamicrobyflo.fr/cotisations-sociales-micro-entreprise
- Hunter.io prix : https://www.noon.ai/blog/articles/451-hunter-io-pricing-2026
- Steel prix : https://docs.steel.dev/overview/pricinglimits