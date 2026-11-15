# Prompt Claude Code : MVP démo ce soir

Tu construis ce soir un MVP de démonstration à montrer à des étudiants. Lis d'abord MVP_BRIEF.md et PROMPT_AUTH.md : ils contiennent toutes les décisions techniques déjà prises (Chrome local via CDP / Playwright, Haiku 5.5 pour naviguer, Sonnet 5.5 pour rédiger, remplissage par lot, coffre et valeurs masquées, quotas, DRY_RUN). Ne les remets pas en cause sauf si la recherche ci-dessous montre qu'un élément est cassé ou obsolète ; dans ce cas, signale-le avant de changer.

## Objectif de la démo (ce soir)
Montrer en direct, sur le Chrome de l'étudiant (le fondateur pour la démo) :
1. Candidature JobTeaser vers site externe : l'agent trouve une offre sur le JobTeaser de l'école, suit le lien vers le site du recruteur (Workday, Greenhouse, SmartRecruiters, Lever, Teamtailor ou formulaire maison), crée le compte si besoin, remplit tout le formulaire, uploade le CV, et s'arrête avant "Envoyer" (DRY_RUN). Une candidature réelle envoyée de bout en bout si le temps le permet.
2. Networking LinkedIn vers email : à partir d'une cible donnée par l'étudiant, l'agent identifie des contacts sur LinkedIn, trouve leur email pro, rédige un email personnalisé, le soumet à validation, puis l'envoie depuis Gmail web.
3. Une interface simple où l'étudiant voit ce que fait l'agent et valide.

Tout le reste (WhatsApp, cloud, paiement, multi-utilisateurs) est hors périmètre ce soir.

## Protocole à suivre à CHAQUE étape (obligatoire)
Pour chaque étape du plan, applique ce cycle et affiche un court compte rendu avant de coder :

1. Recherche (timebox 10 minutes max)
   - Lis la documentation à jour des outils que tu vas utiliser (WebFetch sur la doc officielle : Playwright, @anthropic-ai/sdk, Chrome DevTools Protocol, doc de l'ATS visé si publique). Vérifie la version actuelle des paquets sur npm avant de les installer.
   - Cherche les bonnes pratiques récentes (moins de 6 mois de préférence) : blogs et docs de Browser Use, Skyvern, Stagehand, Steel, Browserbase ; issues GitHub ; Reddit ; Hacker News ; posts X (via WebSearch, ex. "site:x.com workday autofill agent", "site:x.com browser agent job application"). 
   - Regarde comment font les concurrents sur ce point précis (outils d'auto-apply type Simplify, LazyApply, JobWizard, AIApply ; Kombo AI Apply ; outils de prospection type lemlist, La Growth Machine pour LinkedIn vers email).
   - Résume en 5 lignes max : ce que tu as trouvé, ce que tu retiens, les liens. Écris ce résumé dans `docs/research-log.md` (une section par étape, avec date et sources).
2. Plan : 3 à 8 lignes, fichiers touchés, critère de réussite testable.
3. Implémentation minimale qui atteint le critère. Pas d'abstraction inutile ce soir.
4. Test réel sur le Chrome local (pas seulement des tests unitaires) + capture des métriques (appels LLM, tokens, coût, durée).
5. Compte rendu : ce qui marche, ce qui casse, prochaine étape. Si une étape bloque plus de 30 minutes, applique le plan B indiqué et passe à la suite.

## Plan révisé (14 nov., 20h30) : se concentrer sur la valeur ajoutée

Ce que l'étudiant achète : la pertinence (les bonnes offres, pour les bonnes raisons), la confiance (rien ne part sans sa validation, rien d'inventé) et zéro effort (il dit ce qu'il veut, l'agent fait le reste et rend compte). Le remplissage de formulaires est un moyen, pas la valeur : Simplify le fait déjà.

Règles de travail à partir de maintenant :
- Plus de nouveaux tests locaux ni d'essais en direct avec l'identité fictive sur des offres choisies à la main.
- La qualité se mesure hors ligne, sur des données réelles déjà collectées, avec un juge d'un autre modèle (Sonnet) quand il n'y a pas d'étiquettes.
- Un essai réel = une offre retenue par la sélection, avec le vrai profil du fondateur, en dry-run, avec son accord à chaque fois.

Ordre :
1. **Sélection des offres (fait)** : objectif → recherches JobTeaser → tri oui / peut-être / non avec raison. Sur 38 offres étiquetées : 0 hors sujet retenue, 94 % des bonnes trouvées, < 0,01 € par recherche.
2. **Évaluation du remplissage rejouée** : les pages de formulaire déjà enregistrées dans `runs/` sont rejouées sans navigateur dans le moteur ; Sonnet note chaque plan (bons champs, rien d'inventé, bonne action suivante). Sert à améliorer le prompt pour tous les sites à la fois.
3. **Expérience conversation + validation** (la démo) : l'étudiant écrit son objectif → shortlist avec raisons → « prépare les 3 premières » → l'agent travaille en fond et annonce « 3 prêtes, je valide ? » avec les captures avant envoi → networking : contacts, emails rédigés, validation, envoi vers l'adresse de test.
4. **Un essai réel** : vrai profil, dry-run, 1 offre choisie par le fondateur parmi les « oui », Chrome visible placé hors de l'écran.
5. **Script de démo + métriques** (`docs/demo-script.md`, `docs/demo-metrics.md`).

Les étapes ci-dessous restent comme référence technique.

## Plan de la soirée (dans cet ordre)

### Étape 0 : socle (30 min)
- Repo TS, Playwright, `@anthropic-ai/sdk`, `.env` (ANTHROPIC_API_KEY, LLM_FAST_MODEL=claude-haiku-5-5, LLM_WRITER_MODEL=claude-sonnet-5-5, LLM_BUDGET_EUR, DRY_RUN=true).
- Connexion au Chrome local : d'abord le réglage `chrome://inspect/#remote-debugging` + connexion au Chrome en cours ; sinon Playwriter ; sinon profil dédié `--user-data-dir` + `--remote-debugging-port=9222` (plan B).
- Compteur de dépense + coupure au budget.
- Critère : un script liste les onglets ouverts et lit le titre de la page JobTeaser connectée.

### Étape 1 : moteur de remplissage par lot (60 min)
- `snapshot()` élagué (éléments interactifs + libellés, < 90k tokens, champs password masqués) → 1 appel Haiku qui renvoie `{ fields: [{ref, value | "{{vault.x}}" | "ASK_HUMAN"}], next: ref }` → remplissage Playwright déterministe → page suivante.
- Upload CV via `setInputFiles`.
- Cache de mapping libellé → clé de profil.
- Critère : une offre Welcome to the Jungle ou un site carrières de banque sous Workday rempli jusqu'au bouton final en DRY_RUN (profil et CV de test), moins de 6 appels LLM.
- Plan B : si un ATS résiste, démontrer sur un autre ATS.

### Étape 2 : connexion et comptes (45 min, version allégée de PROMPT_AUTH.md)
- Ce soir uniquement : détection login, session existante, bouton SSO Google, coffre chiffré minimal + valeurs masquées, création de compte Workday + code email lu dans l'onglet Gmail, `askHuman` en dernier recours. Le reset de mot de passe est reporté.
- Critère : création de compte sur 1 tenant Workday + validation email, sans qu'aucun mot de passe n'apparaisse dans `runs/`.

### Étape 3 : JobTeaser vers externe (45 min)
- Demander à l'utilisateur l'URL exacte du JobTeaser de son école s'il ne l'a pas fournie.
- Lister les offres issues de la recherche de l'étape 3 bis (ou de la page de résultats visible), en extraire titre, entreprise, lien, type de candidature ("Candidature simplifiée" ou lien externe).
- Pour une offre à lien externe : suivre le lien, détecter l'ATS, enchaîner étapes 2 et 1.
- Pour une offre "Candidature simplifiée" : remplir dans JobTeaser.
- Rythme humain (pauses 2 à 6 s aléatoires), à la chaîne, max 5 candidatures pour la démo.
- Les offres testées sont UNIQUEMENT celles retenues par l'étape 3 bis (`npm run select`), jamais une liste choisie à la main.
- Critère : 2 offres JobTeaser menées jusqu'au bouton final (profil de test, DRY_RUN), dont au moins une vers un site carrières de banque ou un Workday atteint depuis l'offre. Une offre Welcome to the Jungle peut remplacer l'une des deux.

### Étape 3 bis : choisir les offres selon l'objectif de l'étudiant (nouveau)
Principe : l'agent ne candidate qu'aux offres qui correspondent à ce que l'étudiant cherche. Un étudiant qui veut faire du M&A ne postule pas à la finance durable, au marketing ou à la comptabilité.
- Objectif de l'étudiant : `cibles.objectif` (une phrase libre), `cibles.postes` / `cibles.secteurs` (ce qu'il veut) et `cibles.exclusions` (ce qu'il refuse), saisis dans le profil ou l'interface.
- Recherche : à partir de l'objectif, le modèle génère 3 à 5 requêtes de recherche (français et anglais, synonymes, termes exclus) ; l'agent les saisit dans la recherche JobTeaser (ou Welcome to the Jungle) et lit la première page de résultats de chaque requête. Pas de scraping massif.
- Tri en deux passes : (1) sur le titre et l'extrait, Haiku note chaque offre `oui` / `peut-être` / `non` avec un score et une raison d'une phrase, en appliquant les exclusions de l'étudiant ; (2) pour les `peut-être`, lecture de la page complète de l'offre, puis nouveau jugement.
- Décision : candidature automatique seulement pour les `oui` ; les `peut-être` restent sur la liste avec la raison pour que l'étudiant tranche ; les `non` sont écartés et visibles avec leur raison.
- Critère : sur le jeu de 36 offres étiquetées (`test/fixtures/offers-labeled.json`), aucune offre `non` classée `oui` (aucun faux positif) et au moins 80 % des `oui` retrouvés ; le coût du tri d'une offre reste sous 0,002 $.
- Plan B : si la recherche du site est inutilisable, tri de la liste par défaut.

### Étape 4 : lettre de motivation (20 min)
- Sonnet 5.5 génère une lettre courte adaptée à l'offre (texte de l'offre extrait de la page + profil), en parallèle de la navigation. Champ texte ou PDF généré selon ce que demande le formulaire.
- Critère : lettre présente dans le formulaire, sans information inventée (tout fait non présent dans le profil = `ASK_HUMAN`).

### Étape 5 : networking LinkedIn vers email (60 min)
Workflow v0 (à valider avec l'utilisateur en début d'étape, il est encore à préciser) :
1. L'étudiant donne une cible en langage naturel : entreprise(s), équipe ou métier, séniorité, éventuellement "alumni de mon école".
2. L'agent ouvre LinkedIn dans le Chrome local (session de l'étudiant), fait UNE recherche de personnes avec les filtres correspondants et lit uniquement la première page de résultats visible (10 profils max). Pas de scraping massif, pas de visite automatique de dizaines de profils, pas d'invitation ni de message LinkedIn envoyé automatiquement.
3. Il extrait nom, prénom, poste, entreprise, URL du profil ; déduit la séniorité (analyste, associate, VP, director, MD...).
4. Email : déduire le domaine de l'entreprise, tester les formats courants (prenom.nom@, p.nom@, prenomnom@), et utiliser l'API Hunter (offre gratuite, 50 crédits) seulement si nécessaire. Marquer chaque email `verified` / `guessed`.
5. Rédaction Sonnet 5.5 avec les règles par défaut suivantes (modifiables dans le profil) :
   - objectif du premier contact : obtenir un court appel pour échanger sur le quotidien du contact et d'éventuelles opportunités, pas demander un stage directement ;
   - ton : jusqu'à associate, tutoiement et "Bonjour Prénom" ; à partir de VP, vouvoiement et "Bonjour Madame/Monsieur Nom" ;
   - 5 à 8 lignes, personnalisé avec un élément réel du profil du contact, pas de pièce jointe ;
   - présentation de l'étudiant selon son profil (programme, année, recherche de césure).
6. File de validation : l'étudiant voit chaque email (destinataire, statut email, texte) et clique Valider / Modifier / Rejeter.
7. Envoi depuis Gmail web dans le Chrome local, avec programmation sur un créneau entre 9h10 et 18h30 (fonction "Programmer l'envoi" de Gmail). Max 10 emails pour la démo.
- Critère : 5 emails rédigés et validés, 1 envoyé réellement (à une adresse de test ou à un vrai contact si l'utilisateur le confirme).
- Plan B : si la recherche LinkedIn échoue, l'étudiant colle 5 URLs de profils et l'agent part de là.

### Étape 6 : interface de démo (45 min)
- Page locale simple
- Écrans : profil (upload CV + champs clés), "Candidatures" (offres trouvées, statut par offre, bouton Préparer, bouton Envoyer désactivé en DRY_RUN), "Networking" (cible, contacts trouvés, file de validation des emails), journal en direct de l'agent (Server-Sent Events), compteur de coût.
- Critère : le parcours complet de la démo se fait depuis la page, sans terminal.

### Étape 7 : répétition de la démo (20 min)
- Écrire `docs/demo-script.md` : scénario de 5 minutes, données de test, quoi faire si une étape casse (montrer un run enregistré dans `runs/`).
- Faire un run complet, noter les métriques (durée et coût par candidature, par email) dans `docs/demo-metrics.md`.

## Règles de sécurité pour la démo
- DRY_RUN=true par défaut ; un interrupteur explicite dans l'interface pour un envoi réel, avec confirmation.
- Ne jamais lire les mots de passe de Chrome ; le LLM ne voit que des valeurs masquées ; pas de capture d'écran pendant les connexions.
- LinkedIn : lecture d'une page de résultats à la fois, rythme humain, aucune action d'envoi sur LinkedIn.
- Quotas démo : 5 candidatures, 10 emails, budget LLM plafonné.

## Format de tes réponses
- Avant chaque étape : le résumé de recherche (5 lignes) + le plan.
- Après chaque étape : critère atteint ou non, métriques, ce qui reste.
- Si tu dois choisir entre aller vite et faire propre ce soir : aller vite, mais jamais au détriment des règles de sécurité ci-dessus.

Commence par l'étape 0.
