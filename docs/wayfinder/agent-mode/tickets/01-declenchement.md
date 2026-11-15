---
type: grilling
status: closed
claimed_by: claude (session 2026-11-14)
blocked_by: []
---
# Quand l'agent complet prend-il la main ?

## Question

Sur quels signaux le moteur rapide cède-t-il la main : erreur de validation non corrigée, page inchangée deux fois, blocage hors règles ? Existe-t-il un mode « agent partout » pour les tests ? Comment rend-il la main ensuite ?

_Réponse recommandée (non confirmée) : sur échec seulement ; option agent partout pour les tests ; l'agent rend la main dès que la page a changé._

## Résolution

Le moteur rapide garde la main par défaut. L'agent complet prend la main sur une page quand : (a) une erreur de validation visible persiste après un tour de correction du moteur rapide, (b) la page n'a pas changé après 2 actions, (c) le modèle répond « bloqué » pour une raison que aucune règle ne couvre (pas captcha, offre fermée, compte existant, chargement). Option d'essai : variable AGENT_MODE=full (l'agent mène toute la candidature). L'agent rend la main au moteur rapide dès que la page a changé ou qu'il appelle finish(page_done).

_Statut : réponse recommandée appliquée sur instruction « fais tous... suis le plan » de l'utilisateur ; à corriger s'il n'est pas d'accord._
