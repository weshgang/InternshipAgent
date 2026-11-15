# Évaluation rejouée du remplissage (2026-11-15T09:43)

20 pages de formulaire distinctes (enregistrées dans runs/), plan par Haiku 5.5 (moteur actuel), note par Sonnet 5.5.

| bon | moyen | mauvais | action suivante juste | champs inventés | coût Haiku moyen par page |
|---|---|---|---|---|---|
| 13 | 7 | 0 | 20/20 | 0 | 0.0009 $ |

Coût total de l'évaluation (Haiku + juge Sonnet) : 0.203 €.

## Par page
- **moyen** `runs/2026-11-14/batch1-1794679681394/02-snapshot.txt` : Les refs des radios sont incorrects (e58 correspond à « janvier », e84 est le conteneur), ce qui peut faire cocher la mauvaise disponibilité ; le reste est correct et refuser les cookies est la bonne première action.
- **bon** `runs/2026-11-14/batch1-1794679681394/03-snapshot.txt` : Tous les champs requis sont déjà remplis correctement (stage, disponibilité « Autre » pour mars 2027, coordonnées, CV, confidentialité cochée) et l'envoi final par « submit » est le bon choix.
- **moyen** `runs/2026-11-14/batch1-1794680498132/03-snapshot.txt` : Le choix « Autre » est logique, mais le ref e47 pointe sur « janvier » au lieu de e56 (« Autre »), ce qui enverrait une mauvaise disponibilité ; le reste est correct.
- **moyen** `runs/2026-11-14/batch3-1794681757542/06-snapshot.txt` : Le plan est globalement correct et complet : seul le choix « Courant » pour le français natif est approximatif. Le partage international est cohérent avec le consentement « partage_donnees ».
- **bon** `runs/2026-11-14/batch3-1794681757542/07-snapshot.txt` : Le plan est correct : date du diplôme, langues et consentement de partage (autorisé par partage_donnees) sont cohérents avec le profil, et Continuer est la bonne action.
- **bon** `runs/2026-11-14/batch4-1794681884038/04-snapshot.txt` : Le plan remplit correctement civilité, type de contrat, ressortissant UE et case CGU (consentement présent), laisse la motivation à rédiger, et clique sur POSTULER, ce qui est cohérent.
- **bon** `runs/2026-11-14/batch5-1794681969169/04-snapshot.txt` : Le plan remplit correctement l'email et coche le consentement obligatoire (cgu_sites true), ignore le honeypot et clique sur Suivant.
- **bon** `runs/2026-11-14/batch5-1794681969169/14-snapshot.txt` : Le plan remplit correctement l'email et coche le consentement obligatoire (partage_donnees/cgu_sites vrais), puis clique sur Suivant ; rien à signaler.
- **bon** `runs/2026-11-14/batch5-1794681969169/16-snapshot.txt` : L'e-mail et la case de consentement sont déjà remplis, donc aucun champ à compléter, et cliquer sur « Suivant » est la bonne action.
- **bon** `runs/2026-11-14/batch5-1794681969169/24-snapshot.txt` : La page demande un code de vérification reçu par email, que le profil ne contient pas ; le plan ne remplit rien et choisit à raison need_email_code.
- **bon** `runs/2026-11-14/batch5-1794681969169/26-snapshot.txt` : La page demande un code de vérification reçu par email que le profil ne contient pas ; le plan ne remplit rien et demande correctement need_email_code.
- **bon** `runs/2026-11-14/dbg-1794679951077/05-snapshot.txt` : Le plan renseigne correctement l'email et coche le consentement obligatoire (cgu_sites true), puis clique sur Suivant ; rien à corriger.
- **bon** `runs/2026-11-14/dbg-1794679951077/07-snapshot.txt` : L'e-mail et la case de consentement sont déjà remplis correctement, aucun champ restant, et cliquer sur « Suivant » est la bonne action.
- **moyen** `runs/2026-11-14/dbg-1794679951077/08-snapshot.txt` : Le plan est globalement correct, mais le niveau d'études « Master 1 » est discutable puisque le stage se déroule pendant une césure (option « Césure » disponible).
- **bon** `runs/2026-11-14/dbg-1794680097478/07-snapshot.txt` : La page demande uniquement un code de vérification reçu par e-mail ; le plan ne remplit rien et signale à raison need_email_code, sans rien inventer.
- **bon** `runs/2026-11-14/dbg-1794680310762/09-snapshot.txt` : La page demande uniquement un code de vérification envoyé par e-mail, absent du profil ; le plan ne remplit rien et signale correctement need_email_code.
- **bon** `runs/2026-11-14/sg-project-finance-form-1794694897884/06-snapshot.txt` : Le plan remplit correctement l'e-mail, laisse les mots de passe au système et clique sur « Créer mon compte » ; l'e-mail réutilisé comme nom d'utilisateur est un choix acceptable (le mot de passe ne doit pas contenir le nom d'utilisateur, mais c'est géré par le système).
- **moyen** `runs/2026-11-14/step1-1794678759476/06-snapshot.txt` : Le plan est globalement cohérent et complet, avec seulement des choix d'options approximatifs (niveau de français, niveau d'expérience) ; le partage « International » est cohérent avec le consentement partage_donnees.
- **moyen** `runs/2026-11-14/step1-1794678822685/06-snapshot.txt` : Le plan renseigne bien la date du diplôme (30/06/2024) et clique sur Continuer, mais il remplace sans raison l'option A-levels déjà correcte par Bachelor's degree, et le choix du partage international n'est pas demandé.
- **moyen** `runs/2026-11-14/step1-1794678822685/08-snapshot.txt` : La date du diplôme est correcte et les langues sont bien remplies, mais le plan change sans justification le partage des données de National à International.

## Problèmes relevés
- faux: A quelle date êtes-vous disponible ? (Le ref e58 correspond au bouton radio « Stage débutant en janvier », pas à « Autre ». Le plan risque de cocher la mauvaise option.)
- faux: Quelle est la nature du contrat que vous recherchez ? (Le ref e84 est le conteneur du groupe radio « Stage ». Il faudrait cibler e85, le bouton radio lui-même.)
- faux: A quelle date êtes-vous disponible ? (Le ref e47 correspond au radio « Stage débutant en janvier », pas à « Autre ». La valeur « Autre » est associée au mauvais ref (e56 attendu), ce qui cocherait la mauvaise option.)
- faux: Niveau de langue 1 (Français) (Le profil indique « natif » pour le français. Le plan choisit « Courant », alors que le niveau le plus proche aurait été « Courant » faute de mieux : c'est acceptable, mais cela reste une approximation. Le niveau 2 (anglais « Courant ») est correct.)
- faux: Niveau d'études (Le profil indique une césure (première partie, début mars 2027) ; l'option « Césure » est proposée, alors que « Master 1 » est choisi. Le stage a lieu pendant la césure, donc « Master 1 » est discutable.)
- faux: Soumettre (next) (Le bouton « Soumettre » est le dernier envoi de la candidature, alors que la page affiche « étape 1 sur 3 » ; l'action « submit » est donc à confirmer, mais elle n'est pas fausse en soi.)
- faux: Langue 2 / Niveau de langue 2 (Français) (Le français est la langue native de l'étudiante, mais le plan le déclare « Courant ». Les options vont de Débutant à Courant, donc la valeur est acceptable. Le niveau reste un peu approximatif.)
- faux: Niveau d'expérience (« J'ai une première expérience professionnelle » est défendable, mais l'option « Je suis étudiant » correspondrait mieux au profil, qui est M1 chez HEC avec un stage.)
- faux: Certificat / Diplôme (Lycée) (Les classes préparatoires ECG ne sont pas un Bachelor's degree, et le diplôme n'a pas été obtenu ; "A-levels or equivalent" est déjà sélectionné et correspond mieux à ce niveau. Changer l'option est inutile et risque d'être faux.)
- faux: Langue 1 / Langue 2 / Langue 3 (ref f5e209, f5e220, f5e232) (Ces champs sont des widgets de recherche (textbox dans un combobox), pas de simples selects. Les refs pointent sur des textbox internes, donc la saisie risque d'échouer.)
- faux: Niveau de langue 3 (Français est natif dans le profil; seul « Courant » est disponible, c'est acceptable, mais l'ordre des langues (Anglais niveau 1 = Courant, Allemand niveau 2 = Intermédiaire) est cohérent. Le point faible est plutôt le choix du partage des données.)
- faux: Je suis d'accord pour partager mes données (Passe de « National » (déjà coché) à « International » alors que le profil ne donne que partage_donnees: true sans précision de portée; changement non justifié, et le champ est un radiogroup et non un select.)
