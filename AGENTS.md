# Oamk Debian TKI -palvelin

Tämä projekti koskee Oamkin intranetissä olevan Debian TKI -palvelimen konfigurointia ja ylläpitoa. Palvelimelle pääsy edellyttää Oamkin VPN-yhteyttä.

## Ympäristö ja yhteydet

- Suorita kaikki Linux-, verkko- ja SSH-komennot WSL2:n Ubuntu-jakelun kautta käyttäen `wsl.exe -d Ubuntu`.
- Projektin paikallinen polku WSL:ssä on `/mnt/e/Codex/oamk-tki-server`.
- Palvelimella on Ubuntu Server 24.04.4 LTS.
- Muodosta SSH-yhteys Windowsista WSL2:n kautta SSH-aliaksella `oamk-tki`.
- Älä tee palvelinyhteyttä, ellei tehtävä sitä erikseen edellytä.

## Varmistettu palvelimen nykytila

- Nginx 1.24 toimii host-järjestelmässä.
- Käytössä ovat Docker 29.7.2 ja Docker Compose 5.5.0.
- Nykyiset Docker Compose -stackit ovat `arcticai` ja `comfyui`.
- Portainer on asennettu ja käynnissä omana Docker Compose -stackinaan.
- Älä muuta Portainerin kautta olemassa olevia stackeja ilman käyttäjän erillistä lupaa.
- `comfyui`, sen hakemisto `/opt/comfyui`, portti 8188 sekä siihen liittyvät Docker-resurssit kuuluvat toisen henkilön projektiin. Niihin ei saa koskea.
- Älä tee `arcticai`-stackiin muutoksia Portainerin asennuksen yhteydessä.
- Älä koskaan suorita `docker system prune`, `docker volume prune` tai muita Dockerin siivouskomentoja ilman käyttäjän erillistä lupaa.

## Tietoturva

- Älä tallenna salasanoja, SSH-avaimia, tokeneita tai muita salaisuuksia projektiin.
- Käytä salaisuuksille ympäristömuuttujia, käyttöjärjestelmän suojattua avainhallintaa tai muuta projektin ulkopuolista turvallista säilytystä.

## Muutoshallinta

- Tarkista aina nykytila ennen muutosten tekemistä.
- Ota varmuuskopio kaikista muutettavista asetuksista ennen muutosta.
- Pyydä käyttäjän nimenomainen hyväksyntä ennen tuotantopalvelimen merkittäviä tai poistavia muutoksia.
- Älä tee tuotantopalvelimelle muutoksia ilman tehtävässä annettua valtuutusta.

## Sovellukset ja hallinta

- Toteuta sovellukset Docker Compose -kokonaisuuksina.
- Käytä Portaineria hallintanäkymänä.
- Pidä Docker Compose -tiedostot Git-versionhallinnassa.

## ArcticAIChatbotti

- Paikallinen lähdekansio on `apps/ArcticAIChatbotti`.
- Lopullinen URL on `http://193.167.145.67/TKI-hankkeet/ArcticAIChatbotti/`.
- Palvelimen web-kansio on `/srv/TKI-hankkeet/ArcticAIChatbotti/web/`.
- Tuleva Docker Compose -hakemisto on `/opt/arcticai-chatbotti/`.
- Suunnittele kaikki frontendin resurssipolut toimimaan base-polussa `/TKI-hankkeet/ArcticAIChatbotti/`.
- Älä käytä absoluuttisia juuripolkuja, kuten `/assets` tai `/api`.
- Säilytä lähdekoodi aina paikallisessa Git-projektissa.
- Codex saa siirtää julkaistavat web-tiedostot vain hakemistoon `/srv/TKI-hankkeet/ArcticAIChatbotti/web/`.
- Codex ei saa poistaa tai muuttaa muita `/srv/TKI-hankkeet`-hakemistoja.
- ArcticAI-, ComfyUI- ja Portainer-kontteihin ei saa koskea.
- Tarkista Nginx-muutokset aina komennolla `nginx -t` ennen reloadia.
- Älä kirjoita ArcticAIChatbotti-sovelluskoodia tai ota sitä käyttöön, ellei käyttäjä erikseen pyydä.
