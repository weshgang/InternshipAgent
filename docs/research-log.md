# Research log

## Étape 0 : socle (2026-11-14)
- Chrome 144+ : réglage `chrome://inspect/#remote-debugging` pour attacher un Chrome en cours ; Playwright le documente pour son CLI (`attach --cdp=chrome`, v0.1.8, avril 2026). Une issue Playwright indique que `connectOverCDP()` ne se connecte pas à ce mode (option `handleDevToolsAsPage` proposée, non confirmée livrée).
- Retenu : plan B du brief = profil dédié `--user-data-dir` + port de debug (`chrome-agent.sh`, port 9223), seul chemin que `connectOverCDP` supporte avec certitude. Le profil par défaut n'accepte plus le port depuis Chrome 136.
- Coûts : `usage.input_tokens` ne compte que les tokens non cachés ; le coût doit ajouter `cache_read_input_tokens` (0,1x) et `cache_creation_input_tokens` (1,25x). `src/llm/index.ts` le fait déjà.
- Versions installées = dernières sur npm : playwright-core 1.65.1, @anthropic-ai/sdk 1.8.0, tsx 4.23.15, dotenv 18.0.10.
- Sources : https://playwright.dev/agent-cli/commands/attach · https://newreleases.io/project/github/microsoft/playwright-cli/release/v0.1.8 · https://github.com/microsoft/playwright/issues/40027 · https://developer.chrome.com/blog/remote-debugging-port · https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

## WTTJ : observation et intégration (2026-11-14)
- Observation réelle : connexion Google puis redirection vers `/fr/jobs-matches`, avec filtre `published_since=last_7d` et un filtre de profil « Débutant/Diplômé (0-1 an) ».
- Les cartes observées utilisent `/fr/companies/{entreprise}/jobs/{offre}` ; le titre et les informations utiles sont dans la carte, et « Postuler » mène à SmartRecruiters.
- Retenu : lecture de la première page seulement, extraction des cartes WTTJ, classement avec les mêmes exclusions/dates, puis chaîne externe soumise à la whitelist existante.
- Correctif spécifique : WTTJ affiche parfois une date nue (« 13 novembre 2026 »), désormais reconnue par le filtre de fraîcheur.

## Workflow de dev et blocage du code email (2026-11-15)
- Grok Bot, Muse, dots et Poke existent (sources first-party). Aucun ne dit lire un code de vérification dans la boîte perso : SSO, passkey, CAPTCHA et 2FA reviennent à l'humain (formulaire sécurisé ou prise de contrôle) ; envoi, achat et changement de mot de passe passent par une confirmation.
- ATS : Greenhouse « Accounts are never created automatically » ; Workday : compte obligatoire = réglage de l'employeur, sinon email de vérification ; SmartRecruiters : non vérifié.
- Retenu : repli humain immédiat quand `readEmailCode` échoue (`ask` / `needs_human` dans `src/fill.ts`), lecteur Gmail web gelé ; mesurer la fréquence du code par ATS avant d'envisager plus-addressing + Gmail API (scope restricted, jetons de 7 jours en Testing) ; Mailosaur ou AgentMail pour l'étudiant de test. Boucle : 1 scénario → capture réelle → fixture → tests hors ligne → 1 run réel ; arrêt après 2 cycles ratés ou ½ journée.
- Détail : [research-workflow-dev.md](research-workflow-dev.md)
- Sources : https://docs.x.ai/grok-bot/faq · https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/ · https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs · https://poke.com/docs/release-notes · https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents · https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf · https://developers.google.com/workspace/gmail/api/guides/filtering · https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/career-sites/gtv1538650489786.html · https://support.greenhouse.io/hc/en-us/articles/43418495049499-MyGreenhouse-FAQ-for-Candidates
