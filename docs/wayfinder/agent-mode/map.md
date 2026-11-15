# Carte : mode agent complet (option 2) pour PROMPT_MVP_CE_SOIR  [wayfinder:map]

## Destination
Un **document de conception verrouillé** du mode agent : quand il prend la main sur une page, avec quels outils, quelles limites de coût et d'autonomie, quels garde-fous imposés par le code, et comment on mesure qu'il marche. À l'issue de la carte, une session de construction peut l'implémenter sans autre décision à prendre.

## Notes
- Contexte : `MVP_BRIEF.md`, `PROMPT_MVP_CE_SOIR.md`. Aujourd'hui : un moteur rapide (1 appel Haiku par page, `src/fill.ts`) qui bute sur les composants propres à chaque site ; l'ancien `src/agent.ts` utilise Gemini et ne respecte pas le brief (Haiku pour naviguer).
- Suivi : fichiers Markdown locaux (aucun tracker configuré ; lancer `/setup-matt-pocock-skills` pour en brancher un).
- Planifier, ne pas construire. Skills de chaque session : grilling + domain-modeling.
- Réponses « recommandées » du premier tour de questions : **proposées, pas encore confirmées par l'utilisateur**.

## Decisions so far
- [Quand l'agent complet prend-il la main ?](tickets/01-declenchement.md): sur échec du moteur rapide (erreur persistante, page inchangée 2 fois, blocage hors règles) ; option « agent partout » pour les tests.
- [Quels garde-fous le code impose-t-il à l'agent ?](tickets/02-garde-fous.md): cinq refus imposés par l'exécuteur (envoi final en dry-run, cases marketing, secrets et captures en connexion, liste blanche, aucune valeur inventée).
- [Critère de réussite et panel de test](tickets/05-critere-reussite.md): 3 offres sur 5 (dont 2 externes) au bouton final, moins de 0,30 $ chacune, comparées au moteur rapide seul.
- [Fiche API : outils, vision et effort avec Haiku 5.5](tickets/03-fiche-api.md): tool use multi-actions, images acceptées, effort `high` compatible, ~0,03 $ pour 30 étapes.
- [Plafonds de dépense et choix du modèle](tickets/04-plafonds-modele.md): 12 actions / 0,06 $ par prise de relais, 0,30 $ par candidature, Haiku 5.5 effort `high`, tours sans mémoire.

## Not yet specified
- Comment l'agent sait qu'il a progressé (page changée ? erreur disparue ?) et quand il rend la main au moteur rapide.
- Reprise par l'étudiant depuis l'interface (« l'agent est bloqué, voici la fenêtre ») : forme exacte.
- Comparaison moteur rapide seul / moteur + agent : protocole de mesure, une fois le critère de réussite fixé.
- Captchas et blocages anti-robot pendant une prise de relais.

## Out of scope
- Parcours mémorisés par site (« recettes ») : autre effort, une fois le mode agent stable.
- WhatsApp, cloud, paiement, multi-utilisateurs (déjà hors périmètre du soir).
- Plusieurs agents en parallèle sur plusieurs onglets.
