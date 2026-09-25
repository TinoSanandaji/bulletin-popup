# Bulletin – prenumerationspopup

Det här repot är popupens hem. bulletin.nu hämtar `bulletin-popup.js` och `config.json` härifrån
(via GitHub Pages: https://tinosanandaji.github.io/bulletin-popup/). Ändra `config.json` här på GitHub → live på sajten inom ca 10 minuter.
Ingen kodrelease, ingen GTM-publicering.

## Ändra texter, varianter, av/på

1. Öppna `config.json` → pennan (Edit) → ändra → **Commit changes**.
2. Kontrollera på https://tinosanandaji.github.io/bulletin-popup/ (statussidan visar exakt det sajten hämtar) och på en artikel
   med `?bp_debug=1&bp_variant=C`.

Nycklar i `config.json`:

| Nyckel | Betyder |
| --- | --- |
| `enabled` | `false` stänger av popupen helt |
| `text` | rubrik, brödtext (`body`, `bodyShort`), tagline, knapptexter (`month`, `year`) |
| `graven` | de fyra urklippen (rubrik, ingress, url) |
| `variants` | varianterna; `weight: 0` stänger av en variant, `secondary: ""` = ingen årsknapp, `tagline: ""` = ingen tagline, `items: "@graven"` = urklippen |
| `triggers` | `pageviewsBeforeShow`, `scrollPercent`, `secondsOnPage`, `exitIntent`, `minDelayMs` |
| `frequency` | `dismissDays` (tyst efter ”Inte just nu”), `clickDays` (tyst efter klick) |
| `excludePaths` | sidor (regex) där popupen aldrig visas |

Strängar som börjar med `@` hämtas från `text` – så att samma text kan användas i flera varianter.

## Så sitter den på sajten (en gång)

Loadern i `bulletin-popup.loader.html` ligger som Custom HTML-tagg i Google Tag Manager (GTM-P48CJNML,
trigger All Pages) eller som en rad i bulletin-web `_app`:

```jsx
<Script src="https://tinosanandaji.github.io/bulletin-popup/bulletin-popup.js" data-config="https://tinosanandaji.github.io/bulletin-popup/config.json" strategy="afterInteractive" />
```

Det är det enda som behöver finnas på sajten. Allt annat styrs härifrån.

## Mätning

Varje visning/klick skickas som händelsen `bulletin_popup` (popup_variant, popup_action, popup_trigger) till dataLayer
och Meta Pixel. GA4 behöver en eventtagg i GTM (finns i `bulletin-popup.gtm-container-loader.json` i Downloads\Bulletin_popup).
Jämför varianterna på klick per visning i GA4 och på nya avtal i Sesamy Portal.

## Filer

- `bulletin-popup.js` – motorn (ändras sällan; nya versioner läggs här och når sajten inom en timme)
- `config.json` – allt som styr popupen
- `index.html` – statussida: visar vad sajten hämtar, med knappar som visar varje variant
- `bulletin-popup.loader.html` – kroken för GTM/_app
