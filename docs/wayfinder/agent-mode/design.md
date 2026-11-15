# Mode agent complet : conception

Destination de la carte [map.md](map.md). Toutes les décisions viennent des tickets fermés (liens dans la carte).

## Rôle
Le moteur rapide (1 appel par page) reste le chemin normal. Quand une page lui résiste, l'**agent complet** prend la relève : il regarde la page, essaie une action, voit le résultat (erreur comprise) et recommence, jusqu'à ce que la page avance.

## Déclenchement (`src/agent/trigger.ts`)
Prise de relais si : une erreur de validation visible subsiste après un tour de correction du moteur ; la page est inchangée après 2 actions ; le moteur répond « bloqué » pour une raison qu'il ne sait pas traiter (hors captcha, offre fermée, compte existant, chargement). `AGENT_MODE=full` force l'agent partout (tests), `off` le coupe, `auto` par défaut. Limite par candidature : 4 prises de relais et 0,30 $.

## Boucle (`src/agent/loop.ts`, modèle dans `src/agent/model.ts`)
Tours sans mémoire : objectif + 8 dernières actions avec leur résultat + page fraîche (arbre d'accessibilité masqué). Le modèle (Haiku 5.5, effort `high`) renvoie une ou plusieurs actions parmi : click, fill, select, check, press, upload, scroll, wait, screenshot, goto, read_email_code, ask_human, finish. La boucle s'arrête quand la page change (retour au moteur), sur `finish`, sur `ask_human` (l'étudiant répond), à 12 actions ou 0,06 $.

## Garde-fous (`src/agent/guard.ts`), imposés par le code
1. Pas de clic sur l'envoi final en dry-run. 2. Jamais de case newsletter, marketing ou alertes. 3. Mot de passe seulement via le jeton `{{vault.password}}`, pas de capture sur une page de connexion. 4. Navigation limitée à la liste blanche (`src/scope/allowlist.ts`). 5. Un champ factuel (téléphone, numéro, salaire, adresse…) n'accepte qu'une valeur présente dans le profil, les réponses ou la page, sinon `ask_human`. Un refus est renvoyé au modèle comme résultat d'action.

## Critère de réussite
Panel de 5 offres JobTeaser (profil de test, dry-run) dont 2 externes : réussi si 3 arrivent au bouton final sans aide humaine pour moins de 0,30 $ chacune. À comparer avec le moteur rapide seul (`AGENT_MODE=off`).

## Tests
`npm test` : 5 règles de garde-fous, la décision de prise de relais, la boucle sur une page locale avec faux modèle (13 tests). Les outils select, check, press, upload, scroll, wait, screenshot, goto, read_email_code et le vrai modèle ne sont couverts que par le test réel du panel.
