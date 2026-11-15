---
type: grilling
status: closed
claimed_by: claude (session 2026-11-14)
blocked_by: [01-declenchement]
---
# Critère de réussite et panel de test

## Question

Comment saura-t-on que le mode agent marche : combien d'offres sur combien, dont combien sur sites externes, pour quel coût maximum, et avec quelle comparaison au moteur rapide seul ?

_Réponse recommandée (non confirmée) : 3 offres sur 5, dont 2 externes (banque ou ATS), à moins de 30 cents chacune, sans aide humaine hors captcha._

## Résolution

Panel de 5 offres JobTeaser (profil de test, dry-run) dont au moins 2 renvoient vers un site externe de banque ou un ATS atteint depuis l'offre. Réussi si 3 offres sur 5 arrivent au bouton final sans aide humaine (hors captcha), pour moins de 0,30 $ chacune. Mesures par offre : statut, nombre d'appels, tokens, coût, durée, nombre de prises de relais et d'actions de l'agent. Le même panel est rejoué avec le moteur rapide seul pour comparer.

_Statut : réponse recommandée appliquée sur instruction de l'utilisateur ; à corriger si besoin._
