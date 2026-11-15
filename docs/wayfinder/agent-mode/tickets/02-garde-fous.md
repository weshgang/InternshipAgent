---
type: grilling
status: closed
claimed_by: claude (session 2026-11-14)
blocked_by: []
---
# Quels garde-fous le code impose-t-il à l'agent ?

## Question

Quelles actions l'exécuteur refuse-t-il quoi que dise le modèle : clic sur le bouton final en dry-run, cases marketing, mot de passe ou capture pendant une connexion, sortie de la liste blanche, information inventée (ask_human) ? Y en a-t-il d'autres ?

_Réponse recommandée (non confirmée) : ces cinq règles, imposées par le code et non par le prompt._

## Résolution

Cinq refus appliqués par l'exécuteur d'actions, quoi que dise le modèle : (1) clic sur un bouton d'envoi final en dry-run ; (2) case marketing / newsletter / alertes ; (3) mot de passe saisi en clair ou capture d'écran sur une page de connexion (les secrets passent par des jetons {{vault.x}}) ; (4) navigation hors de la liste blanche (déjà imposé par src/scope/allowlist.ts) ; (5) toute valeur absente du profil, des réponses données ou de la page : l'agent appelle ask_human. Chaque refus est renvoyé au modèle comme résultat d'outil et journalisé.

_Statut : réponse recommandée appliquée sur instruction « fais tous... suis le plan » de l'utilisateur ; à corriger s'il n'est pas d'accord._
