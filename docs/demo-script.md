# Script de démo (5 minutes) : agent stage pour étudiants

Interface : `npm run ui`, puis http://127.0.0.1:4173 (une seule page : conversation, journal de l'agent replié en bas, pastilles de mode et de coût en haut).
Message clé à répéter : « Tu dis ce que tu veux, l'agent fait le travail, et rien ne part sans ton accord. »

## Prérequis avant la démo (à faire 15 min avant, hors public)
- Chrome de l'agent lancé avec `./chrome-agent.sh` (profil dédié `~/.agent-profile`, port de débogage 9223), connecté à JobTeaser (session école) et à la boîte Gmail de test. Vérifier que JobTeaser n'est pas déconnecté (l'agent l'a déjà déconnecté une fois, voir `docs/ledger.md`).
- `DRY_RUN=true` (valeur par défaut) et TEST_MODE actif (il l'est sauf si `TEST_MODE=false`). La pastille en haut doit afficher « dry-run · identité de test ».
- Profil de test : `profiles/test-candidate.json` (variable `PROFILE`).
- Lancer `npm run ui` dans un terminal, ouvrir la page, vérifier la pastille de coût (dépense / budget `LLM_BUDGET_EUR`).
- Vider la conversation si besoin (`data/chat.json`) pour partir d'un écran vide. Ne rien effacer d'autre.
- Ouvrir à l'avance, dans un autre onglet masqué, un run enregistré de `runs/2026-11-14/` et `data/offers-ranked.json` (plan B).
- Placer la fenêtre Chrome de l'agent hors de l'écran projeté.
- Prévoir : la préparation de 3 candidatures prend plusieurs minutes en réel (de 50 s à plus de 5 min par candidature dans nos runs, voir `docs/demo-metrics.md`). Lancer l'étape 1 et 2 en direct, puis montrer l'étape 3 sur un résultat déjà prêt si le temps manque.

## Étape 1 : l'étudiant écrit son objectif (0:00 à 0:45)
- On dit : « Je suis étudiante, je ne veux pas remplir 50 formulaires. Je dis simplement ce que je cherche. »
- On montre : cliquer la première suggestion sous le champ (« Je veux un stage M&A en césure dès mars 2027 à Paris, pas de finance durable ») ou la taper, puis Envoyer. L'agent répond par une phrase et annonce la recherche JobTeaser (offres de moins de 7 jours par défaut). Le journal se remplit.
- Si ça casse : l'appel LLM qui lit le message échoue (message « Erreur : … » dans la conversation) : vérifier la clé API et le budget, renvoyer le message. Sinon passer au plan B de l'étape 2.

## Étape 2 : recherche et tri oui / peut-être / non (0:45 à 2:00)
- On dit : « L'agent cherche sur JobTeaser, lit chaque offre et la trie avec une raison. Il applique mes exclusions, mes dates et ne repropose pas ce que j'ai déjà postulé. »
- On montre : le message « J'ai lu N offres… » puis déplier « Voir les N offres et les raisons ». Pointer des raisons concrètes : « exclusion de l'étudiant : finance durable », « début 2027-01, incompatible avec ta disponibilité (01/03/2027) », « déjà postulé avec ce compte ». Les liens ouvrent l'offre.
- Chiffres à citer (source `docs/demo-metrics.md`) : aucun faux « oui » sur 38 offres étiquetées, 94 % des bonnes offres retrouvées, moins de 0,01 € par recherche.
- Si ça casse (JobTeaser déconnecté, recherche en échec, message « La recherche a échoué ») : ouvrir `data/offers-ranked.json` (42 offres déjà triées : 9 oui, 8 peut-être, 25 non) ou relire `runs/select-trial.log` qui contient le tableau complet. Dire que c'est le résultat d'une recherche réelle faite plus tôt.
- Variante WTTJ observée : la connexion Google mène à `/fr/jobs-matches`, puis le filtre `7 derniers jours`. Les offres sont lues depuis les liens `/fr/companies/.../jobs/...`; « Postuler » ouvre SmartRecruiters en parcours `oneclick-ui`.

## Étape 3 : l'agent choisit et prépare les candidatures en dry-run (2:00 à 3:30)
- On dit : « Je n'ai pas choisi les offres. L'agent prend les meilleurs « oui », remplit les formulaires, crée le compte si besoin, et s'arrête juste avant « Envoyer ». »
- On montre : le message « Je prépare les 3 meilleure(s) : … », le texte « L'agent travaille : … » sous la conversation, puis la carte « N candidature(s) sur M prête(s) à envoyer » avec, par offre, un statut (prête / needs_human / failed…), un résumé et la capture de la dernière page avant envoi (cliquer pour agrandir). Le bouton « Envoyer » est grisé : en mode test, l'identité fictive n'est jamais envoyée à une vraie entreprise. On peut aussi écrire « Prépare les 5 meilleures » (maximum 5, quota de démo).
- On dit aussi : quand l'agent bute (question qu'il ne peut pas trancher, code email), il le signale au lieu d'inventer une réponse : 0 champ inventé sur 20 pages rejouées.
- Si ça casse (statuts failed, needs_human, hors périmètre) : l'expliquer comme une fonction (« il m'a demandé au lieu de deviner »). Pour montrer une candidature complète : ouvrir `runs/2026-11-14/batch1-1794679681394/` (statut ready_to_submit, captures `01-page.png` à `03-page.png`, `letter.pdf`) ou `result.json` du même dossier.

## Étape 4 : networking, emails rédigés et validation (3:30 à 4:40)
- On dit : « Pour le réseau, je colle des contacts, l'agent devine leur email pro, rédige un message personnalisé, et c'est moi qui valide. »
- On montre : coller la suggestion « Contacts : Julie Martin, Analyst M&A, Lazard ; Thomas Petit, VP DCM, BNP Paribas ». Cartes de brouillon : destinataire, statut de l'email (vérifié / deviné), objet et texte modifiables. Boutons Modifier / Rejeter / Valider, puis Envoyer (confirmation) : en TEST_MODE, tout part vers l'adresse de test avec « [TEST] » dans l'objet. Ouvrir la boîte Gmail de test pour voir arriver le message. Remarquer le tutoiement avec l'analyste et le vouvoiement avec le VP.
- Si ça casse : si l'envoi échoue (Gmail non connecté), montrer les brouillons validés (statut « approved ») et dire que l'envoi se fait dans Gmail web ; ou ouvrir `data/` pour la file d'emails. Ne pas retenter plus de deux fois.

## Étape 5 : le coût (4:40 à 5:00)
- On dit : « Tout ça, c'est quelques centimes. » 
- On montre : la pastille de coût en haut (dépense cumulée en € sur le budget). Chiffres réels : recherche environ 0,008 € ; candidature en moyenne 0,016 $ ; dépense totale du projet à ce jour 0,93 € (voir `docs/demo-metrics.md`).
- Si la pastille ne se met pas à jour : lire `runs/spend.json`.

## Ce qu'il ne faut pas montrer
- L'identité de test : nom, email, téléphone, adresse. Elle apparaît dans le titre de la page (« Agent stage · Prénom Nom »), dans les captures avant envoi, dans le texte des emails et dans `profiles/test-candidate.json`. Cadrer/flouter, ou réduire la fenêtre, ne pas ouvrir le profil ni `data/vault.enc.json`.
- L'adresse de test Gmail (colonne destinataire, boîte de réception) : ne montrer que l'objet « [TEST] … ». Ne pas afficher l'URL ni la liste des comptes de la boîte.
- Les comptes créés chez les recruteurs (BNP Paribas, Natixis, etc.) : voir `docs/demo-metrics.md`. Ne pas ouvrir les pages de connexion, ne pas montrer le coffre, ne jamais afficher de mot de passe ni de code reçu par email.
- Le journal de l'agent déplié (URLs de session, emails) et le terminal.
- Ne jamais passer en envoi réel (`DRY_RUN=false`, `TEST_MODE=false`) pendant la démo.
- Ne pas promettre : 1 seule candidature a atteint le bouton final dans les `result.json` enregistrés, et le remplissage reste un moyen, pas la valeur vendue.
