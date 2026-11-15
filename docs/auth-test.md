# Tests manuels de connexion (réel)

Prérequis : Chrome de l'agent lancé (`chrome-agent.sh`), `DRY_RUN=true`, `npm run test:auth` au vert.
Après chaque test : `npm run auth:stats` (taux de réussite par méthode et par domaine) et `npm run vault:list`.

1. **JobTeaser via SSO école (session existante)**
   `npm run fill -- auth-jt "<url d'une offre JobTeaser>"` avec la session école ouverte dans le Chrome de l'agent.
   Attendu : `[auth …] existing session` ou `sso …`, aucune saisie de mot de passe, `auth_method` visible dans `runs/auth-metrics.json`.
2. **Un tenant Workday : création de compte + validation email** (`creation_comptes_ats: true`, `reset_mot_de_passe: false`)
   `npm run fill -- auth-wd "<url d'une offre sur *.myworkdayjobs.com>"`.
   Attendu : mot de passe créé dans le coffre AVANT l'envoi du formulaire (`vault:list` montre l'origine du tenant, `created_by: agent`), code ou lien lu dans Gmail, arrêt avant l'envoi final.
   Puis relancer la même offre : connexion par `vaultCredentials`, sans nouveau compte.
3. **Un site avec bouton Google** : attendu `ssoButton`, compte choisi = `identite.email`.
4. **Compte déjà existant, réinitialisation** : mettre `reset_mot_de_passe: true`, utiliser un tenant où l'étudiant a déjà un compte.
   Attendu : « mot de passe oublié » → lien Gmail → nouveau mot de passe dans le coffre → message « J'ai réinitialisé… ». Avec `false` : message à l'étudiant, attente jusqu'à 10 min.
5. **Fuite** : `grep -rF "<mot de passe du coffre>" runs/` ne doit rien renvoyer.

Non vérifié automatiquement : `browserAutofill` (expérimental, dépend du Chrome réel), le code reçu par email (seul le lien est testé sur le faux site), les règles de mot de passe propres à chaque site (20 caractères mixtes par défaut).
