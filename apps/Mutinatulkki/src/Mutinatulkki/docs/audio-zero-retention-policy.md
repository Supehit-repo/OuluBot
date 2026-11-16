# Audio Zero-Retention Policy

Luonnos päivitetty 24.5.2026.

Huomenta Helena käsittelee ääntä vain väliaikaisesti puheen muuttamiseksi tekstiksi.
Äänitiedostoja ei tallenneta selaimeen, palvelimen levylle, tulkkipalvelimelle, lokiin tai varmuuskopioihin.

## Periaate

Audio on palvelussa vain transientti kuljetusdata.

```text
Selain nauhoittaa äänen muistissa
-> selain lähettää äänen palvelimelle HTTPS-yhteydellä
-> palvelin välittää äänen tulkille muistissa tai väliaikaisessa RAM-pohjaisessa käsittelyssä
-> tulkki palauttaa raakatekstin
-> audio poistetaan heti
-> vain teksti ja tekninen metadata voivat jäädä talteen
```

## Onnistunut tulkinta

Kun tulkki palauttaa tekstin, audio poistetaan heti selaimen, API-palvelimen ja tulkkipalvelimen muistista.
Pysyvään tallennukseen saa jäädä vain tekstiksi tulkittu puhe, keskustelun tunnisteet, aikaleimat, sovellusversio sekä VAD- ja taukotunnistuksen metadata.

## Epäonnistunut tulkinta

Jos tulkinta epäonnistuu, audio poistetaan silti.
Palvelu ei säilytä epäonnistunutta äänipätkää myöhempää uudelleenajoa varten.
Käyttäjälle näytetään virhe ja pyydetään tarvittaessa puhumaan uudelleen.

## Lokit ja varmuuskopiot

Ääntä ei kirjoiteta lokiin, virheraportteihin, crash dumppeihin, analytiikkaan tai varmuuskopioihin.
Lokit saavat sisältää vain teknisiä tapahtumatietoja, kuten käyttäjä- tai laitetunnisteen, keskustelutunnisteen, aikaleiman, virhekoodin ja käsittelyn keston.

## Kehitys- ja debug-poikkeus

Mahdollinen kehityksen debug-tallennus on aina erillinen tila.
Se ei saa olla tuotannon oletus, sen pitää olla näkyvästi merkitty ja sen tallenteille pitää olla lyhyt säilytysaika.
