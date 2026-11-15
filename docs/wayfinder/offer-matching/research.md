# Filtrage d'offres par LLM : recherche (2026-11-14)

Légende : [DOC] = documenté par la source citée ; [INF] = inférence/recommandation de l'agent, non documentée.
Constat global : il n'existe pas de bonne pratique canonique publiée pour ce cas précis. Les sources sont surtout des docs Anthropic, quelques préprints et des blogs de vendeurs.

## 1. Rubrique de notation
- [DOC] Sortie structurée garantie par schéma, Haiku 5.5 supporté ; `minimum`/`maximum`, `minLength` et la plupart des contraintes de tableau ne sont PAS supportés par l'API (enum de chaînes OK) : borner le score 0-100 côté code. https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- [DOC] Enchaîner : critères binaires vérifiables d'abord (« knockout »), puis scoring, puis humain ; le screening marche mal sur le subjectif. Source = blogs praticiens (faible) : https://resources.rework.com/libraries/ai-for-hr/ai-resume-screening
- [DOC] LinkedIn (SAGE) : juge LLM piloté par une politique en langage naturel + exemples-précédents curés, rubrique « multi-dimensionnelle » ; abstract seul, sans échelle ni chiffres. https://arxiv.org/abs/2602.07840
- [INF] Schéma proposé : `verdict` enum {oui, peut_etre, non}, `exclusion_violee` (enum/null), `score` 0-100, `raison` courte. Critères : famille de métier (M&A/DCM/ECM vs adjacents), nature du stage (césure, durée, dates), localisation, séniorité. Exclusions explicites = veto dur (verdict non), traité séparément du score, pas pondéré.
- [INF] Pondération, nombre d'exemples (few-shot) et seuils : aucune source ; à calibrer sur le jeu étiqueté (§5). Les exemples dans le prompt sont recommandés par Anthropic pour la cohérence : https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency

## 2. Deux passes
- [DOC] Anthropic recommande de découper une tâche complexe en sous-tâches enchaînées (même page increase-consistency). Les papiers retrieval/rerank décrivent un étage « haut rappel » puis un étage « haute précision » (Synapse : https://arxiv.org/abs/2604.02539). LinkedIn note que les juges LLM en ligne sont chers, d'où la distillation (https://arxiv.org/pdf/2602.07309).
- [INF] Passe 1 (titre+extrait) : oui net -> garder, non net -> rejeter, peut_etre -> passe 2 sur texte complet. Régler la passe 1 pour un rappel élevé (peu de faux rejets).
- Non documenté : seuil de score déclenchant la passe 2, ratio de coût réel. À mesurer : % d'offres en passe 2 et tokens moyens sur le jeu étiqueté.

## 3. Titres ambigus
- Aucune source trouvée traitant de titres ambigus (« Chargé d'études », « Structuration », « Assistant trader »).
- [DOC, indirect] Anthropic recommande d'inclure des cas ambigus « où même un humain hésiterait » dans les évals : https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
- [INF] Forcer le verdict `peut_etre` sur ces titres (liste de titres ambigus dans le prompt) pour les envoyer en passe 2 ; demander dans le schéma un champ `description_du_poste` (1 phrase) AVANT le verdict. Efficacité de ce « décrire d'abord » : non confirmée par une source ; à tester sur le jeu étiqueté. Note : Anthropic déconseille de se fier à l'ordre des champs sans test.

## 4. Génération de requêtes
- [DOC] LinkedIn : un « query rewriter » LLM désambiguïse l'intention, injecte le profil, et « étend les synonymes pour augmenter le rappel » ; taxonomies contraintes dans le prompt pour éviter l'élargissement excessif. Pas de métrique propre au rewriter, pas de termes d'exclusion mentionnés. https://arxiv.org/html/2509.09690
- Pipeline hybride avec étape « query enrichment » : https://arxiv.org/pdf/2603.14558v2 (détails non lus en entier).
- [INF] Générer FR+EN (« fusions-acquisitions » / « M&A » / « mergers acquisitions », « banque d'affaires », « investment banking », « DCM », « ECM », « origination »), dédupliquer, et appliquer les exclusions (ESG, marketing, comptabilité) en filtre aval sur le texte plutôt que par opérateurs de recherche (support par JobTeaser non vérifié). Pas de source sur l'efficacité du FR/EN.

## 5. Évaluation
- [DOC] Anthropic : critères de succès mesurables (précision, rappel, F1), évals reflétant la distribution réelle, cas limites inclus, « plus de questions, même moins parfaites » plutôt que peu de questions parfaites ; juge LLM de préférence différent du modèle évalué. https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
- Les définitions précision/rappel/matrice de confusion sont standard, non propres aux sources ci-dessus.
- [INF] Coût des erreurs : candidater à tort (faux positif) = candidature gaspillée, risque de réputation/doublon, mais peu coûteux si Mael relit ; rater une offre = perte d'opportunité invisible. Pas de source. Proposition : viser un rappel élevé en passe 1 et une précision élevée avant envoi (seuil d'envoi strict, `peut_etre` -> validation humaine). Seuil réglé sur la courbe précision/rappel du jeu étiqueté ; taille minimale du jeu : non documentée (ordre de grandeur 50-100 offres, avis personnel).
- Ordre de grandeur de fiabilité : un projet Stanford rapporte AUC 0,685 pour prédire la progression en entretien, donc la prédiction « succès » reste faible (rapport de projet étudiant, faible confiance) : https://cs191w.stanford.edu/projects/Winter2026/_Aditya___Sood_.pdf. Cela ne concerne pas le filtrage de pertinence.

## 6. Outils concurrents
- Simplify : matching « IA, au-delà des filtres par mots-clés », selon ses propres pages ; pas de mention de score de match ni de « dealbreakers » ; le score cité est un score CV/ATS. https://simplify.jobs/ai-job-search
- Teal : score de match = recouvrement de mots-clés CV vs offre (donc mots-clés, pas filtrage de pertinence LLM). https://help.tealhq.com/en/articles/10604396-what-is-job-matching
- LazyApply / JobCopilot : filtres titre/mots-clés/localisation puis envoi massif ; l'existence d'un score de fit est contradictoire selon les blogs concurrents, non confirmé. https://jobright.ai/compare/lazyapply ; https://remotestack.in/blog/jobcopilot-vs-loopcv-vs-remotestack
- Aucun de ces éditeurs ne documente son prompt, ses seuils ni ses métriques.

## Points non confirmés
- JobWizard, AIApply, Kombo : aucune documentation de filtrage trouvée.
- LazyApply/JobCopilot : présence d'un score de fit (sources contradictoires, de concurrents).
- Seuil passe 1 -> passe 2, coûts comparés, taille du jeu d'éval, pondération des critères : aucune source.
- Efficacité de « décrire le poste d'abord » ; traitement des titres ambigus ; gestion des exclusions par LLM : aucune source directe.
- Génération de requêtes FR/EN avec termes négatifs : non documentée ; le support de recherche JobTeaser n'a pas été vérifié.
- Papiers 2026 (2603.26710, 2604.02539, 2603.14558, SAGE) : seuls abstracts/extraits lus, pas de chiffres vérifiés.
- Blog d'ingénierie LinkedIn d'origine non consulté (résumé secondaire).
