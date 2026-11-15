---
type: research
status: closed
claimed_by: claude (session 2026-11-14)
blocked_by: []
---
# Fiche API : outils, vision et effort avec Haiku 5.5

## Question

Que permettent exactement l'API Anthropic (tool use, résultats d'outils avec images, effort de réflexion, cache de prompt) et Haiku 5.5 pour une boucle d'agent navigateur, et à quel coût par étape ? Sources officielles uniquement.

_Réponse recommandée (non confirmée) : à résoudre par une lecture de la documentation, sans agent humain._

## Résolution

Résolu par un agent de recherche : voir [fiche-api.md](../research/fiche-api.md). Faits retenus : les appels d'outils acceptent plusieurs actions par tour ; une capture d'écran peut être envoyée au modèle ; Haiku 5.5 accepte l'effort `high` avec les outils ; un tour de ~12k tokens coûte ~0,0011 $ (cache) à 0,00135 $, soit ~0,03 $ pour 30 étapes. Non confirmé : taille max d'un résultat d'outil, tokens réels d'une capture.
