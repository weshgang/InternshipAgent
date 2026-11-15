# Métriques de la démo (chiffres réels uniquement)

Chaque chiffre cite son fichier source. Rien n'est extrapolé. Date des données : 14 nov. 2026.

## 1. Sélection des offres
| Mesure | Valeur | Source |
|---|---|---|
| Offres étiquetées | 38 | `PROMPT_MVP_CE_SOIR.md` (Plan révisé, étape 1) ; `docs/ledger.md` |
| Fausses offres retenues (« oui » à tort) | 0 | idem |
| Rappel (bonnes offres retrouvées) | 94 % | `PROMPT_MVP_CE_SOIR.md` (Plan révisé). Le ledger notait 88 % à une étape antérieure, 94 % est la valeur finale du plan |
| Coût par offre triée | 0,00006 € | `docs/ledger.md` (étape 3 bis) |
| Coût d'une recherche complète (38 offres lues) | 0,0076 € (3 « oui », 1 « peut-être ») | `runs/select-trial.log` (dernière ligne) |
| Shortlist déjà calculée | 42 offres : 9 oui, 8 peut-être, 25 non | `data/offers-ranked.json` (décompte) |

Le fichier d'évaluation sur les 38 offres n'est pas dans `docs/` : le 94 % vient du plan, pas d'un rapport relisible. À vérifier en relançant `npm run eval:match` (appelle un LLM, non fait ici).

## 2. Remplissage (évaluation rejouée, sans navigateur)
| Mesure | Valeur | Source |
|---|---|---|
| Pages évaluées | 20 | `docs/eval-fill.md` |
| Bon / moyen / mauvais | 12 / 5 / 3 | `docs/eval-fill.md` |
| Bonne action suivante | 17 sur 20 | `docs/eval-fill.md` |
| Champs inventés | 0 | `docs/eval-fill.md` |
| Coût moyen Haiku par page | 0,0009 $ | `docs/eval-fill.md` |
| Coût total de l'évaluation (Haiku + juge Sonnet) | 0,214 € | `docs/eval-fill.md` |

Les 3 « mauvais » portent sur d'anciennes offres de finance durable (exclusion de l'étudiant) ; correction du format de date appliquée ensuite (`docs/ledger.md`).

## 3. Candidatures : coût et durée observés
Source : 28 fichiers `runs/2026-11-14/*/result.json` (tous en dry-run, modèle Haiku 5.5). Coût en dollars, tel qu'écrit dans `cost_usd`. Ce sont des runs de mise au point, pas une série homogène : beaucoup se sont arrêtés tôt.

| Statut | Runs | Coût médian (min à max) | Durée médiane (min à max) | Appels LLM médian |
|---|---|---|---|---|
| ready_to_submit | 1 | 0,0418 $ | 50 s | 8 |
| needs_human | 10 | 0,0215 $ (0,0044 à 0,0463) | 77 s (38 à 352) | 11,5 |
| failed | 7 | 0,0139 $ (0,0004 à 0,0249) | 46 s (4 à 167) | 6 |
| out_of_scope (liens hors liste blanche) | 6 | 0,0132 $ (0 à 0,0137) | 11 s (0 à 12) | 3 |
| not_matching (offre écartée à l'ouverture) | 4 | 0,0008 $ (0,0007 à 0,0012) | 4 s (4 à 5) | 1 |
| Tous statuts | 28 | 0,0138 $ (0 à 0,0463), moyenne 0,0158 $ | 42 s (0 à 352), moyenne 60 s | 5,5 (0 à 55) |

Total des 28 runs : 0,4437 $.
- `runs/batch-1794682321723.json` (Air Liquide DCM) affiche « success », mais c'est un faux statut : le modèle a répondu « terminé » sur une page de connexion, aucune candidature n'a été envoyée. Corrigé depuis : « envoyé » exige une page de confirmation.

## 4. Dépense LLM totale
Source : `runs/spend.json` : 0,93108 € au total (Haiku 5.5 : 0,3255 € ; Sonnet 5.5 : 0,60558 €). Ce total couvre toutes les sessions de la journée (runs, évaluations, tris), donc il dépasse la somme des `result.json`.

## 5. Comptes créés avec l'identité de test
À supprimer ou à clôturer après la démo si possible. Déduit de `docs/ledger.md`, `runs/auth-metrics.json`, `data/login-attempts.json`, `runs/2026-11-14/*/result.json`. Aucun fichier ne confirme explicitement une création de compte réussie ; le coffre (`data/vault.enc.json`) est chiffré et n'a pas été ouvert.

| Site | Ce que montrent les fichiers | Compte créé ? |
|---|---|---|
| BNP Paribas (`bwelcome.hr.bnpparibas`) | `step1-…313018/auth-log.txt` : « no account yet: sign-up » ; ledger : pages d'inscription atteintes ; ensuite connexion refusée (`batch2-1794680529415`, `runs/auth-metrics.json` : 4 échecs, `data/login-attempts.json` : 3 tentatives le 14 nov.) | Probable, à vérifier (mot de passe non retrouvé) |
| Natixis, Oracle Recruiting (`ekez.fa.em2.oraclecloud.com`, via `aplitrak.com`) | ledger : compte de test verrouillé 30 min après codes erronés, code email Gmail lu correctement ; `batch5-1794681969169` : 55 appels, code rejeté deux fois | Très probable, à vérifier |
| JobTeaser (`dauphine.jobteaser.com`) | ledger : session déconnectée par l'agent, reconnexion demandée à l'utilisateur ; aucune trace de création | Non (tentative de connexion seulement), à vérifier |
| Galeries Lafayette (`carrieres.groupegalerieslafayette.com`) | `batch1-1794679681394` : arrivé jusqu'au bouton final ; aucune trace explicite de création de compte | À vérifier |
| BPI (`bpi.tzportal.io`) | `batch4-1794681884038` : candidature démarrée (`needs_human`) | À vérifier |

## Limites connues
- Un seul run a atteint le bouton final dans les `result.json` ; les autres demandent de l'aide, échouent ou sont hors périmètre.
- Les coûts de candidature viennent de runs de mise au point, pas d'un échantillon représentatif ; pas de médiane « réussite » possible (n = 1).
- Le rappel de 94 % porte sur 38 offres d'une seule recherche (M&A, césure 2027) : pas de généralisation prouvée.
- Les sites avec code email, mot de passe ou captcha restent le point faible ; le remplissage est évalué hors ligne (20 pages), jamais sur envoi réel.
- Tout est en TEST_MODE avec une identité fictive ; aucun envoi vers une vraie entreprise ni un vrai contact n'a été fait.
- Aucun essai réel avec le vrai profil du fondateur n'est consigné à ce stade (étape 4 du plan non documentée).

## Vérification WTTJ du 14 novembre
| Mesure | Valeur | Source |
|---|---|---|
| Première page lue | 5 offres récentes | `data/offers-ranked.json` après `OFFERS_SOURCE=wttj` |
| Verdicts | 4 non, 1 peut-être, 0 oui | idem |
| Filtre de fraîcheur | dates nues (« 13 novembre 2026 ») reconnues | `src/select.ts` |
| Parcours candidature observé | WTTJ → SmartRecruiters `oneclick-ui` | session Chrome de l'agent |
| Envoi | 0, dry-run conservé | `.env`, garde-fous |

## Vérification du 14 novembre, relance élargie
| Mesure | Valeur | Source |
|---|---|---|
| Offres lues | 40 | `runs` de la sélection relancée |
| Offres `oui` | 1 | `data/offers-ranked.json` |
| Offres `peut-être` | 2 | `data/offers-ranked.json` |
| Candidature préparée jusqu'au bouton final | 0 | `runs/2026-11-14/batch1-1794690973615/result.json` |
| Motif d'arrêt | Début le 04/01/2027, incompatible avec mars 2027 | idem |
| Recherche LinkedIn réelle | Bloquée: session absente | journal du run networking |
| Email de test envoyé | 0 | aucun brouillon créé faute de session LinkedIn |
