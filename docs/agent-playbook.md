# Guide d'Architecture & Bonnes Pratiques : Agent de Candidature et Networking IA

> **Destiné aux agents et développeurs travaillant sur le projet MVP.**  
> Ce document synthétise l'ensemble des spécifications du projet, les décisions architecturales déjà validées, l'analyse des runs réels et les meilleures pratiques 2025-2026 de l'écosystème des agents navigateurs (Stagehand, browser-use, Skyvern, Steel, Browserbase).

---

## 1. Vision Produit & Proposition de Valeur

### 1.1. Pour qui et pourquoi ?
* **Cible :** Étudiants en école de commerce (M1/M2) recherchant leur stage de première ou deuxième partie de césure (notamment en M&A, Private Equity, Transaction Services, Corporate Finance, Conseil en Stratégie).
* **Ce que l'étudiant achète :**
  1. **La pertinence absolue :** Filtrage impitoyable des offres hors-sujet (audit, comptabilité, marketing, finance durable/ESG exclue) et détection des dates de césure réelles.
  2. **La confiance totale :** Jamais de candidature envoyée sans validation explicite ; jamais de fait inventé dans un formulaire ou une lettre.
  3. **Zéro effort :** L'agent repère l'offre, s'enregistre sur l'ATS de l'entreprise, remplit le formulaire, uploade CV et lettre, résout les codes email et présente le dossier prêt au clic final. En parallèle, il identifie les contacts clés (alumni) et prépare des messages de networking personnalisés.

---

## 2. Architecture Globale du Système

```text
                                 [ ÉTUDIANT ]
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            ▼                                                   ▼
   [ Interface / Chat UI ]                             [ Profil Candidat JSON ]
   (Validation, Logs SSE, Statuts)                     (Identité, Cibles, Exclusions)
            │                                                   │
            ├─────────────────────────┬─────────────────────────┤
            ▼                         ▼                         ▼
   [ Moteur de Sélection ]   [ Moteur de Remplissage ]   [ Moteur Networking ]
   - Recherche JobTeaser     - Batch déterministe (1-shot) - Recherche LinkedIn (local)
   - Double passe Haiku 5.5  - Takeover agentique (fallback) - Devinette email + Hunter
   - Veto dur & dates        - Coffre-fort chiffré (Vault)  - Rédaction Sonnet 5.5
                             - Gestion OTP Gmail web        - Programmation Gmail web
                                      │
                                      ▼
                       [ Chrome Local de l'Étudiant ]
                       (Session JobTeaser, LinkedIn, Gmail, IP résidentielle)
```

### 2.1. Les 4 Piliers Fonctionnels

| Module | Fichiers clés | Rôle & Approche |
|---|---|---|
| **Sélection & Tri** | [match.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/match.ts), [select.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/select.ts) | Deux passes : Veto code sur exclusions -> Passe 1 (titres/extraits) -> Passe 2 (texte complet sur `oui`/`peut-être`). Contrôle déterministe des dates. |
| **Remplissage ATS** | [fill.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/fill.ts), [prompt.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/prompt.ts), [agent/](file:///Users/maelmispelblombeijer/Documents/MVP/src/agent) | Mode hybride : Snapshot ARIA -> 1 appel Haiku 5.5 -> Remplissage déterministe Playwright. En cas de blocage, bascule en agent multi-tours. |
| **Auth & Sécurité** | [auth/](file:///Users/maelmispelblombeijer/Documents/MVP/src/auth), [scope/](file:///Users/maelmispelblombeijer/Documents/MVP/src/scope) | Coffre-fort chiffré par origine ([vault.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/auth/vault.ts)), masquage des secrets dans les snapshots, liste blanche de domaines ([allowlist.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/scope/allowlist.ts)). Pour chaque nouveau site carrière, l'interface demande si un compte existe déjà ; « créer automatiquement » génère ensuite l'email du profil et un mot de passe stocké dans le coffre, tandis que « compte existant » attend une connexion humaine. |
| **Networking & Outreach** | [networking/](file:///Users/maelmispelblombeijer/Documents/MVP/src/networking), [gmail.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/gmail.ts) | Extraction 1 page LinkedIn sans scraping agressif, génération de l'adresse pro, rédaction Sonnet contextualisée, programmation d'envoi Gmail. |

---

## 3. Bonnes Pratiques de l'Écosystème Browser Agents (2025–2026)

### 3.1. Approche Hybride "Extraction + Remplissage Déterministe" vs Pure Vision
* **Le piège de la boucle pure vision ("1 screenshot = 1 clic") :** Les frameworks naïfs font 40 à 80 allers-retours LLM pour remplir un formulaire Workday ou Taleo. Conséquences : latence inacceptable (3 à 5 minutes par page), coût de plusieurs dollars par candidature, et dérive fréquente.
* **Le consensus moderne (Stagehand, Browserbase, Skyvern) :**
  1. **Extraction de l'arbre d'accessibilité (ARIA) :** Moins verbeux que le DOM brut, débarrassé des nœuds décoratifs, chaque élément interactif reçoit un repère (`[ref=eN]`).
  2. **Plan par lot (Batch Planning) :** 1 seul appel LLM renvoie l'intégralité des champs à remplir sur la page (`{ fields: [{ ref, value, kind }], next: action }`).
  3. **Exécution Playwright déterministe :** Remplissage instantané via l'API Playwright.
  4. **Agent de secours (Fallback Takeover) :** L'agent multi-tours n'est déclenché *que* si la page reste bloquée après 2 tentatives ou si une erreur de validation persiste (voir [design.md](file:///Users/maelmispelblombeijer/Documents/MVP/docs/wayfinder/agent-mode/design.md)).

### 3.2. Gestion des Composants Complexes des ATS (Workday, Greenhouse, Lever, SmartRecruiters)
1. **Dropdowns asynchrones / Comboboxes personnalisés :**
   * Les ATS modernes n'utilisent presque jamais de balises `<select>` natives.
   * *Bonne pratique :* Cliquer sur le champ -> taper les 3 à 5 premières lettres de la valeur (ex: `Pari` pour Paris, `HEC` pour HEC Paris) -> attendre 300 à 500 ms que le conteneur `[role="listbox"]` ou `[role="option"]` monte -> cliquer sur l'option exacte.
2. **Formats de Date :**
   * `<input type="date">` requiert impérativement le format ISO `YYYY-MM-DD`.
   * En revanche, les champs textuels génériques (`<input type="text">`) sur les sites français (Société Générale, BNP, Galeries Lafayette) attendent généralement `JJ/MM/AAAA`. Le moteur doit adapter le format selon le type HTML et le placeholder.
3. **Upload de Fichiers (CV & Lettre) :**
   * Ne jamais laisser l'agent déclencher ou manipuler la boîte de dialogue native du système d'exploitation.
   * *Pattern validé :* Écouter l'événement `page.on('filechooser')` et injecter directement le chemin du fichier via `fileChooser.setFiles(cvPath)`.
4. **Comptes Candidats par Tenant :**
   * Chez Workday ou Oracle Cloud, chaque entreprise possède son propre domaine isolé (`entreprise.myworkdayjobs.com`). Un compte créé pour l'Entreprise A n'existe pas chez l'Entreprise B.
   * *Règle :* Clé de coffre-fort indexée sur l'`origin` exacte (protocole + domaine). Générer un mot de passe robuste, le stocker dans le coffre avant même la soumission du formulaire d'inscription.
5. **Codes de Vérification Email (OTP / Magic Links) :**
   * À la création de compte ou à la connexion, l'ATS envoie un code à 6 chiffres.
   * *Workflow :* Le moteur suspend la page candidate -> bascule sur l'onglet Gmail du navigateur résidentiel -> recherche l'email récent du recruteur -> extrait le code via regex (`\b\d{6}\b`) -> revient sur la page et tape le code (avec support des formulaires à cases individuelles "un chiffre par boîte", voir [codeEntry.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/codeEntry.ts)).

---

## 4. Filtrage & Matching des Offres : Robustesse et Rappel

### 4.1. Leçons tirées des runs réels (38 offres étiquetées)
* **Veto binaire strict (Knockout) :**
  * Traité dans le code en amont du LLM : mots-clés d'exclusions dans le titre (ESG, marketing, comptabilité, alternance, CDI). Coût token : 0 €.
* **Le piège des dates de démarrage :**
  * *Erreur observée :* Un filtre d'incompatibilité trop rigide (ex. disponibilité déclarée en mars 2027 qui élimine tous les stages débutant le 4 janvier 2027).
  * *Recommandation :* 
    * Si le score métier/secteur est élevé (> 75/100), une offre démarrant 1 à 2 mois avant ou après la date cible doit être classée en `peut-être` avec un motif explicite (*"Débute en janvier 2027 : valider si décalage possible"*), plutôt qu'un `non` destructeur.
* **Évaluation sur le travail réel :**
  * Juger la description des missions, pas le prestige de l'intitulé (un "Business Analyst" qui fait de l'administration = `non` ; un poste au titre flou décrivant de l'origination ou de la modélisation = `oui`).

---

## 5. Networking LinkedIn & Outreach Responsable

### 5.1. Principes Anti-Détection & Respect de l'Utilisateur
* **Session locale résidentielle :**
  * Utiliser impérativement le Chrome de l'étudiant (`~/.agent-profile`) connecté à son compte LinkedIn.
  * Aucune API non officielle non approuvée, aucun scraping de masse.
* **Lecture à faible empreinte :**
  * Une seule requête de recherche LinkedIn ciblée (par mots-clés ou booléens : *"Alumni HEC M&A analyst Paris"*).
  * Analyse de la première page de résultats uniquement (10 profils max).
  * Aucune visite automatique en cascade de profils (évite les notifications *"X a vu votre profil"*).

### 5.2. Rédaction d'Emails Hautement Convertibles (Sonnet 5.5)
* **Structure gagnante :**
  1. *Accroche (Hook) :* 1 élément réel visible (école commune, parcours similaire, transaction/deal récent).
  2. *Contexte :* Présentation ultra-concise (1 phrase : année, spécialisation, intérêt pour l'équipe).
  3. *Call to Action (CTA) à faible friction :* Demande de 10-15 minutes d'échange informel sur son quotidien et son parcours. **Ne jamais demander directement un stage ou un referral dans le premier message.**
* **Règles de style :**
  * Longueur : 60 à 110 mots maximum.
  * Zéro jargon IA (*"Dans un environnement en constante évolution"*, *"Je me permets de vous contacter"*).
  * Ton : Tutoiement jusqu'à Analyst/Associate (culture business school), vouvoiement à partir de VP/Directeur.
* **Mode Sécurisé (Guardrails) :**
  * `TEST_MODE=true` : Réécriture systématique de l'adresse destinataire vers une boîte de test contrôlée par l'étudiant.
  * Programmation des envois uniquement sur les heures ouvrées (du lundi au vendredi, entre 9h10 et 18h30).

---

## 6. Règles de Sécurité et Garde-fous Absolus

Toute modification de code effectuée par un agent **DOIT** respecter ces invariants :

1. **Interdiction de Soumission Finale en `DRY_RUN` :**
   * L'agent ne doit jamais cliquer sur les boutons portant les libellés `/envoyer|soumettre|submit|finaliser/i`.
   * L'arrêt doit intervenir sur l'écran récapitulatif avec capture d'écran horodatée.
2. **Pas d'Hallucination Factuelle :**
   * Si un formulaire demande une information obligatoire absente du profil candidat (numéro de sécurité sociale, permis de conduire, réponse non renseignée), l'agent doit émettre `missing` ou `ask_human`.
3. **Protection des Comptes et Job Boards :**
   * Interdiction formelle de cliquer sur les boutons de déconnexion (`logout`, `sign out`).
   * Interdiction de créer un compte candidat sur JobTeaser (le compte personnel de l'étudiant y est déjà connecté).
4. **Refus des Consentements Marketing :**
   * Accepter les CGU obligatoires si le profil l'autorise (`cgu_sites: true`).
   * Refuser systématiquement les newsletters, alertes offres d'emploi et communications commerciales de tiers.

---

## 7. Directives d'Implémentation pour les Agents du Projet

### 7.1. Stack & Commandes Utiles
* **Environnement :** Node.js >= 22, TypeScript, ESM natif (`type: "module"`).
* **Commandes clés :**
  * `npm test` : Lance la suite complète de 54 tests unitaires et de sécurité. Doit toujours être verte.
  * `npm run select` : Exécute la recherche JobTeaser et le double tri.
  * `npm run fill -- <scenario> <url>` : Lance le remplissage d'une candidature en dry-run.
  * `npm run network -- find "<query>" 5` : Lance la recherche networking.
  * `npm run ui` : Démarre le serveur d'interface locale (SSE + interface web).
  * `npm run eval:fill` / `npm run eval:match` / `npm run eval:drafts` : Rejoue les évaluations hors-ligne.

### 7.2. Fichiers et Répertoires Clés
* [MVP_BRIEF.md](file:///Users/maelmispelblombeijer/Documents/MVP/MVP_BRIEF.md) : Cahier des charges initial et contraintes budgétaires.
* [PROMPT_MVP_CE_SOIR.md](file:///Users/maelmispelblombeijer/Documents/MVP/PROMPT_MVP_CE_SOIR.md) : Priorités révisées axées sur la valeur et la confiance.
* [docs/ledger.md](file:///Users/maelmispelblombeijer/Documents/MVP/docs/ledger.md) : Journal de bord horodaté des décisions et correctifs.
* [docs/demo-metrics.md](file:///Users/maelmispelblombeijer/Documents/MVP/docs/demo-metrics.md) : Métriques réelles observées (coûts, durées, taux de succès).
* [src/prompt.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/prompt.ts) : Prompt système du moteur de navigation rapide (Haiku 5.5).
* [src/agent/loop.ts](file:///Users/maelmispelblombeijer/Documents/MVP/src/agent/loop.ts) : Boucle de secours de l'agent complet.
