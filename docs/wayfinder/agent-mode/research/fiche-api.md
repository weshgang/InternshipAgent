# Fiche API : boucle d'agent navigateur (Haiku 5.5)

Recherche du 2026-11-14. SDK installé : `@anthropic-ai/sdk` 1.8.0 (`node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts`, noté SDK:ligne). Docs : platform.claude.com/docs/en/…

## 1. Tool use
- Requête : `tools: [{ name (^[a-zA-Z0-9_-]{1,128}$), description, input_schema: {type:'object', properties, required} }]`, option `strict`, `input_examples`, `cache_control` ([define-tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), [tool-reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference)). Les descriptions détaillées sont le facteur n°1 de qualité.
- Réponse : `stop_reason: 'tool_use'`, `content` = [text?, tool_use{id,name,input}, ...] (SDK:4731 `ToolUseBlock`) ([handle-tool-calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)).
- Retour : UN message `role:'user'` contenant `{type:'tool_result', tool_use_id, content, is_error?}` ; ce message doit suivre immédiatement le tour assistant ; les `tool_result` d'abord, tout texte après (sinon 400) (même page).
- Plusieurs `tool_use` par tour : oui par défaut ; l'API ne prescrit pas l'ordre d'exécution ; renvoyer tous les résultats dans un seul message user ([parallel-tool-use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)). Désactivation : `tool_choice: {type:'auto'|'any', disable_parallel_tool_use:true}` (SDK:4479-4492).
- `tool_choice` : `auto` (défaut), `any`, `tool` (+name), `none`. Haiku 5.5 accepte `any`/`tool`, mais un appel forcé saute le thinking ; Sonnet 5.5 renvoie 400 sur `any`/`tool` (define-tools, tableau « Forcing tool use »). Changer `tool_choice` invalide le cache des messages.
- Existe aussi un toolset Anthropic `browser_toolset_20260801` (client toolset, résultats texte+image) : [tool-reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference). Non étudié en détail (voir §Non confirmé).

## 2. Images dans tool_result
- Oui : `content: [{type:'text',text}, {type:'image', source:{type:'base64', media_type:'image/jpeg', data}}]` (handle-tool-calls, « Example of tool result with images ») ; SDK:4561 `content?: string | Array<TextBlockParam | ImageBlockParam | SearchResultBlockParam | DocumentBlockParam | ToolReferenceBlockParam | BrowserStateBlockParam>`. Formats : jpeg, png, gif, webp ([vision](https://platform.claude.com/docs/en/build-with-claude/vision)).
- Haiku 5.5 : entrée « Text and images → text » ([overview](https://platform.claude.com/docs/en/models/haiku-5-5/overview)) et listé dans les modèles vision.
- Coût : patches de 28x28, `ceil(l/28) x ceil(h/28)` tokens. Haiku 5.5 est dans le palier « Claude 4.7 et plus » (bord max 2576 px, 4784 tokens). 1280x800 : 46 x 29 = 1334 tokens, sans redimensionnement (calcul d'après la formule, pas mesuré). Facturés comme tokens d'entrée.
- Limites : 10 Mo base64 par image (API directe), 600 images/requête (contexte 1M), requête max 128 Mo ([api/overview](https://platform.claude.com/docs/en/api/overview)). Au-delà de 20 images dans une requête, une limite de dimension plus stricte s'applique à toutes, y compris les captures d'anciens tours et celles dans des `tool_result` (vision) : élaguer les vieilles captures.
- Ajouter/retirer des images dans l'historique invalide le cache des messages (prompt-caching).

## 3. effort et thinking
- `output_config.effort` : `low | medium | high | xhigh | max` (SDK:3918). Haiku 5.5 supporte les 5 niveaux, défaut `medium` (le code actuel force `low` par défaut) ; effort s'applique à tous les tokens, tool calls compris ; bas = moins d'appels d'outils, plus terses, mais risque de sauter une vérification ou de s'arrêter tôt dans les longs prompts d'agent ([effort](https://platform.claude.com/docs/en/build-with-claude/effort)).
- Thinking : séparé, activé par défaut (adaptatif) sur Haiku 5.5 ; `thinking:{type:'disabled'}` accepté seulement à effort <= high (400 à xhigh/max) ; `enabled`+budget_tokens et `between_tools` : 400 sur Haiku 5.5 ([thinking](https://platform.claude.com/docs/en/build-with-claude/thinking), tableau des modèles). Le thinking compte dans `max_tokens` et dans `output_tokens` (`output_tokens_details.thinking_tokens`, SDK:3925).
- Historique : dans un tour d'outils, renvoyer tous les blocs `thinking` ET `redacted_thinking` complets, non modifiés, avec le `tool_use` (thinking#preserving-thinking-blocks). Filtrer sur `type==='thinking'` seul casse le protocole. Haiku 5.5 conserve les thinking des tours précédents (comptés comme entrée). Ils ne marchent que dans le compte qui les a produits.

## 4. Prompt caching ([prompt-caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [tool-use-with-prompt-caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching))
- Ordre du préfixe : tools -> system -> messages. Un breakpoint met en cache tout jusqu'au bloc marqué. Max 4 breakpoints explicites.
- Placement : `cache_control` sur le DERNIER outil de `tools` (ou sur le dernier bloc system, ce qui couvre tools+system) ; puis sur le dernier bloc du dernier message (le `tool_result` courant) pour que le tour suivant relise l'historique. Alternative : `cache_control` de premier niveau (automatique), le breakpoint suit le dernier bloc cachable.
- Lookback : 20 blocs en arrière si miss. TTL 5 min (renouvelé à chaque lecture), 1 h via `ttl:'1h'`. Minimum cachable Haiku 5.5 : 512 tokens (Haiku 4.5 : 4096). Sous le minimum, silencieusement non caché (usage à 0).
- Invalidations : modifier les outils = tout ; `tool_choice`, images ajoutées/retirées, thinking, `effort` = au moins les messages. Garder effort/thinking/tool_choice constants pendant une session.
- Prix Haiku 5.5 (<=100k) : écriture 5 min 0,125 $/M, 1 h 0,20 $/M, lecture 0,01 $/M (overview).

## 5. Limites
- `max_tokens` : sortie max 128K (overview) ; réserver de la place pour le thinking. Contexte 1M.
- Nombre d'outils et taille max d'un `tool_result` : non documentés (seulement requête 128 Mo, image 10 Mo).
- Erreur d'outil : `{type:'tool_result', tool_use_id, content:'message instructif', is_error:true}` ; le modèle réessaie 2-3 fois (handle-tool-calls). Entrée invalide : mieux vaut `strict:true`.
- Le contenu de page est non fiable (injection) : le garder dans les `tool_result`, pas dans system.

## 6. Coût d'un tour (Haiku 5.5, <=100k, hors thinking)
Hypothèse : 12k tokens d'entrée (3k system+tools, 8k snapshot, 1k historique), 300 tokens de sortie.
- Sortie : 300 x 0,50/M = 0,00015 $.
- Régime établi, system+tools lus du cache, le reste non caché : 3k x 0,01 + 9k x 0,10 = 0,00003 + 0,0009 -> **~0,0011 $/tour**.
- Sans cache : 12k x 0,10 = 0,0012 + 0,00015 -> ~0,00135 $. Premier tour (écriture 3k à 0,125) : ~0,0014 $.
- + capture 1280x800 (~1334 tokens) : +0,00013 $. Thinking : chaque 500 tokens ajoutent 0,00025 $.
- Le cache ne vaut presque rien ici : les 3k cachés économisent ~0,00027 $/tour. Cacher le dernier message n'est rentable que si le snapshot reste dans l'historique ; s'il est remplacé à chaque tour, le préfixe change et c'est une écriture à 1,25x pour rien.
- Une session de 30 étapes : ~0,03 $ (~0,03 EUR). Sonnet 5.5 : prix du code (2 $/10 $ par M), environ 20x plus cher en entrée.

## Points non confirmés
- Limite du nombre d'outils par requête et taille maximale d'un `tool_result` : non trouvées dans la doc lue.
- `output_config.format` (json_schema) combiné avec `tools` sur Haiku 5.5 : non vérifié ; `format` n'est pas utile dans la boucle.
- Comportement exact si `max_tokens` coupe un `tool_use` : non lu.
- Lire un historique contenant des blocs thinking de Haiku 5.5 avec Sonnet 5.5 (changement de modèle en cours de boucle) : doc partiellement lue (Haiku 5.5 ne lit pas ceux de Sonnet 5.5) ; éviter de mélanger les modèles dans un même historique.
- Support de `browser_toolset_20260801` par Haiku 5.5, et son prix/contraintes : non étudié.
- Nombre réel de tokens d'une capture : formule de la doc, à mesurer avec `usage.input_tokens` ou l'API de comptage.
- Texte de la doc sur le comportement de Haiku 5.5 avec thinking désactivé (« can skip a tool… ») tronqué à la lecture.
