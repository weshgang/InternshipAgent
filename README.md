# MVP agent de candidature

## Ce que l'agent stocke (et ne stocke pas) à propos de tes mots de passe
- Il stocke **uniquement** les comptes qu'il crée pour toi sur les sites carrières, et ceux que tu ajoutes toi-même (`npm run vault:add`). Tout est chiffré en local (AES-256-GCM) dans `data/vault.enc.json` ; la clé est dans le trousseau de ton ordinateur.
- Il **ne lit jamais** les mots de passe enregistrés dans Chrome et n'en importe aucun.
- Le modèle d'IA ne voit jamais un mot de passe : il manipule seulement des jetons, remplacés au moment de taper. Les logs et les fichiers de `runs/` sont expurgés.
- Il ne réinitialise un mot de passe que si tu l'as autorisé (`consentements.reset_mot_de_passe` dans `profile.json`), et te prévient.
- Si rien ne marche, il te demande de te connecter toi-même dans la fenêtre Chrome de l'agent.

Commandes : `npm run vault:add -- --origin <url> --username <email>`, `npm run vault:list`, `npm run test:auth`, `npm run auth:stats`.

## Documentation & Guide pour les agents
- [Guide d'architecture & Bonnes pratiques pour les agents](docs/agent-playbook.md) : vision produit, patterns 2025-2026 (Stagehand, Browserbase, Skyvern, Workday autofill), sécurité, et instructions d'implémentation.
- [Brief initial](MVP_BRIEF.md) et [Plan révisé](PROMPT_MVP_CE_SOIR.md).
- [Journal de bord](docs/ledger.md) et [Métriques réelles](docs/demo-metrics.md).

