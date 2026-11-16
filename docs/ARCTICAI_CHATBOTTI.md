# ArcticAIChatbotti: käyttöohje

Tämä ohje kuvaa paikallisen ArcticAIChatbotti-kehityksen, palvelimelle julkaistavan web-sivun sekä tulevan Docker-agentin vastuut. Kehitys tehdään paikallisesti hakemistossa `E:\Codex\oamk-tki-server`; palvelimelle ei julkaista mitään ilman erillistä pyyntöä ja ennakkotarkistuksia.

## Hakemistorakenne

| Sijainti | Sisältö ja vastuu |
| --- | --- |
| `apps/ArcticAIChatbotti/web/` | Julkaistavat staattiset sivut. Tällä hetkellä `index.html`. |
| `apps/ArcticAIChatbotti/agent/` | Dockerissa ajettava FastAPI-kehitysagentti. |
| `apps/ArcticAIChatbotti/compose.yaml` | Agentin paikallinen ja tuleva palvelin-Compose-määrittely. |
| `infra/portainer/compose.yaml` | Portainerin erillinen stack; sitä ei muuteta tämän sovelluksen yhteydessä. |
| `scripts/open-portainer.ps1` | Avaa vain Portainerin SSH-hallintatunnelin Windowsista. |
| `scripts/ensure-ssh-agent.sh` | Valmistelee WSL2:n SSH-agentin tunnelointiskriptille. |
| `AGENTS.md` | Projektin sitovat toiminta- ja turvallisuusohjeet. Lue aina ennen palvelintyötä. |

Paikallinen Windows-polku on `E:\Codex\oamk-tki-server` ja sama hakemisto WSL2:ssa on `/mnt/e/Codex/oamk-tki-server`.

## Nykyinen toiminta

Staattinen käyttöliittymä on tiedostossa `apps/ArcticAIChatbotti/web/index.html`. Se lähettää viestin suhteellisella polulla `./api/chat`. Tämän ansiosta pyyntö toimii suunnitellussa base-polussa `/TKI-hankkeet/ArcticAIChatbotti/`; sovelluksessa ei käytetä juuripolkuja kuten `/api` tai `/assets`.

Agenttirajapinta on kevyt FastAPI-kehitysrunko. Se tarjoaa:

- `GET /health` palauttaa palvelun tilan.
- `POST /api/chat` vastaanottaa JSON-muodossa kentän `message` ja palauttaa kehitysvastauksen.

Agentti ei vielä sisällä mallia, mallipainoja, API-avaimia tai ulkoisia integraatioita. Kun paikallinen kielimalli valitaan, se liitetään tähän rajapintaan erillisenä, versionhallittuna muutoksena.

## Paikallinen ajo

Suorita Docker- ja muut Linux-komennot aina WSL2:n Ubuntu-jakelussa:

```powershell
wsl.exe -d Ubuntu -- bash -lc 'cd /mnt/e/Codex/oamk-tki-server && docker compose -f apps/ArcticAIChatbotti/compose.yaml up --build'
```

Agentti kuuntelee vain paikallisesti osoitteessa `127.0.0.1:8081`. Tarkista se esimerkiksi:

```powershell
wsl.exe -d Ubuntu -- curl --fail http://127.0.0.1:8081/health
```

Portti 8081 on valittu, jotta olemassa olevan ArcticAI-sovelluksen localhost-porttiin 8080 ei kosketa. Komento `docker compose ... down` pysäyttää vain tämän Compose-tiedoston agenttikontin. Älä käytä Dockerin prune- tai muita siivouskomentoja.

## Palvelinjulkaisu

Palvelin on `linux-EM01G1HV` ja vaatii Oamkin VPN-yhteyden. SSH-yhteys tehdään aina WSL2:n kautta aliaksella `oamk-tki`.

- Julkaistavat web-tiedostot saa siirtää vain hakemistoon `/srv/TKI-hankkeet/ArcticAIChatbotti/web/`.
- Tuleva Compose-stack asennetaan vain käyttäjän hyväksynnällä hakemistoon `/opt/arcticai-chatbotti/`.
- Nginxin osoitepolku on `http://193.167.145.67/TKI-hankkeet/ArcticAIChatbotti/`.
- Ennen jokaista palvelinmuutosta tarkistetaan nykytila ja otetaan tarvittaessa varmuuskopio muutettavista asetuksista.
- Mahdollinen Nginx-muutos tarkistetaan aina komennolla `nginx -t` ennen reloadia.

Sivun `./api/chat`-pyyntö tarvitsee myöhemmin Nginxiin erillisen, hyväksytyn välityssäännön tähän base-polkuun. Sellaista sääntöä ei tehdä osana paikallista kehitystä eikä ilman käyttäjän nimenomaista hyväksyntää.

## Rajat ja turvallisuus

- Lähdekoodi pidetään tässä paikallisessa Git-projektissa; Git-tietovarasto on alustettu projektin juureen.
- Salasanoja, SSH-avaimia, tokeneita ja mallien käyttöoikeuksia ei tallenneta projektiin. Paikalliset `.env`-tiedostot jätetään versionhallinnan ulkopuolelle.
- ArcticAI-, ComfyUI- ja Portainer-kontteihin ei kosketa.
- ComfyUI, `/opt/comfyui` ja portti 8188 kuuluvat toiselle projektille.
- Muita `/srv/TKI-hankkeet`-hakemistoja ei muuteta tai poisteta.
