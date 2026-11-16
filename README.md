# OuluBot / Mutinatulkki

OuluBot on Oamk Journal -aineistoon perustuva suomenkielinen puhekäyttöliittymä. Sen erityispiirre on **Mutinatulkki**: se muuttaa puhekielisen ja murteellisen puheen hakukelpoiseksi kysymykseksi ennen kuin vastausta haetaan Oamk Journalista.

Julkaistu palvelu: [OuluBot](https://193.167.145.67:8443/TKI-hankkeet/ArcticAIChatbotti/)

## Käyttöohje

1. Avaa palvelu Microsoft Edgessä tai muussa modernissa selaimessa.
2. Paina **Aloita keskustelu** ja salli mikrofonin käyttö selaimessa.
3. Odota, että tilaksi vaihtuu **Kuunnellaan puhetta**. Alun melukalibrointi kestää hetken.
4. Sano kysymyksesi normaalisti. Palvelu tunnistaa puheenvuoron päättymisen ja käsittelee vastauksen automaattisesti.
5. Tulospaneelissa näkyvät sekä puhuttu raakateksti että Mutinatulkin hakua varten tulkitsema teksti. Vastaus tuotetaan valitun teksti- ja/tai äänivastauksen mukaan.

Jos tulkinta jää epävarmaksi, palvelu pyytää kokeilemaan uudelleen. Äänitallenne käsitellään vain pyynnön ajan, eikä sitä tallenneta palvelimelle.

### Käyttäjän asetukset

**Asetukset**-painikkeesta voi vaihtaa mikrofonin herkkyyden, puheenvuoron katkaisun viiveen, passiivisuuskatkaisun, teeman sekä teksti- ja äänivastauksen.

Tulospaneelin alaosan **Toiminnallisuus** kuvaa lyhyesti palvelun käsittelyketjun. **Tekniset tiedot** auttaa testaamisessa: siitä näkee tallennuksen, puheenvuoron ja käsittelyn tilan.

## Miten palvelu toimii

```text
Mikrofoni → selain tallentaa puhechunkin → Faster Whisper
          → Mutinatulkki (murre ja puhekieli)
          → Oamk Journal / Qdrant → AgentAPI / Ollama → teksti ja Piper-ääni
```

Mutinatulkki säilyttää ensisijaisen murretulkinnan, mutta pitää rinnalla myös puheen raakatekstiin perustuvan ehdokkaan. AgentAPI valitsee Oamk Journal -aineiston osumien perusteella tarkoitusta parhaiten vastaavan kyselyn. Tasatilanteessa murretulkinta voittaa.

## Kehitys ja ylläpito

Palvelin edellyttää Oamkin VPN-yhteyttä. Linux-, Docker-, verkko- ja SSH-komennot suoritetaan Windowsissa aina WSL2:n Ubuntu-jakelun kautta.

```powershell
wsl.exe -d Ubuntu -- bash -lc 'cd /mnt/e/Codex/oamk-tki-server && ./scripts/ensure-ssh-agent.sh'
```

| Kohde | Polku |
| --- | --- |
| Paikallinen projekti | `E:\Codex\oamk-tki-server` |
| WSL-projekti | `/mnt/e/Codex/oamk-tki-server` |
| Palvelimen Compose-projekti | `/opt/mutinatulkki` |
| Julkinen web-polku | `/TKI-hankkeet/ArcticAIChatbotti/` |
| Palvelun localhost-portti | `127.0.0.1:5500` |

Ennen tuotantoon julkaisemista:

1. Tarkista nykytila ja ota varmuuskopio muutettavista tiedostoista.
2. Validoi Compose:

   ```powershell
   wsl.exe -d Ubuntu -- bash -lc 'cd /mnt/e/Codex/oamk-tki-server && docker compose -f apps/Mutinatulkki/compose.yaml config --quiet'
   ```

3. Julkaise vain Mutinatulkkiin kuuluvat lähdetiedostot ja käynnistä vain tarvittavat palvelut.
4. Tarkista palveluiden health-endpointit ja julkinen sivu julkaisemisen jälkeen.

Älä koske ArcticAI-, ComfyUI- tai Portainer-kontteihin. Älä aja Dockerin prune- tai muita siivouskomentoja.

## Lähdekoodi

- `apps/Mutinatulkki/compose.yaml` – Docker Compose -määrittely
- `apps/Mutinatulkki/src/Mutinatulkki/` – selainkäyttöliittymä ja välityspalvelu
- `apps/Mutinatulkki/src/HH-tulkkiAPI/` – Murretulkki ja puheentunnistuksen laatuportti
- `apps/Mutinatulkki/src/AgentAPI/` – Oamk Journal -haku ja vastauslogiikka
- `apps/Mutinatulkki/src/HH-TTSservice/` – Piper-puhevastaukset

## Työkalut ja linkit

- [GitHub-repositorio](https://github.com/Supehit-repo/OuluBot)
- [OpenAI Codex](https://openai.com/codex/)
- [Claude](https://claude.ai/)
- [Oamk Journal](https://oamkjournal.oamk.fi/)

## Tietoturva

Älä lisää tähän repositorioon salasanoja, SSH-avaimia, käyttöoikeustunnuksia, tokeneita tai `.env`-tiedostoja. Salaisuudet säilytetään palvelimella tai käyttöjärjestelmän suojatussa avainhallinnassa.
