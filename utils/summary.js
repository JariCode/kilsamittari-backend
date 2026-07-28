// Palauttaa päivämäärän muodossa VVVV-KK-PP paikallisesta ajasta
function muotoilePaiva(pvm) {
  const vuosi = pvm.getFullYear();
  const kuukausi = String(pvm.getMonth() + 1).padStart(2, '0');
  const paiva = String(pvm.getDate()).padStart(2, '0');
  return `${vuosi}-${kuukausi}-${paiva}`;
}

// Palauttaa kuluvan viikon maanantain päivämäärän
function viikonAlku(pvm) {
  const kopio = new Date(pvm);
  // Sunnuntai on 0, muutetaan se seitsemäksi jotta maanantai on viikon alku
  const viikonpaiva = kopio.getDay() === 0 ? 7 : kopio.getDay();
  kopio.setDate(kopio.getDate() - (viikonpaiva - 1));
  return muotoilePaiva(kopio);
}

// Laskee koonnit merkinnöistä
function laskeKoonnit(merkinnat) {
  const nyt = new Date();
  const tanaan = muotoilePaiva(nyt);
  const viikonEnsimmainen = viikonAlku(nyt);
  const kuukaudenAlku = `${nyt.getFullYear()}-${String(nyt.getMonth() + 1).padStart(2, '0')}-01`;
  const vuodenAlku = `${nyt.getFullYear()}-01-01`;

  let paiva = 0;
  let viikko = 0;
  let kuukausi = 0;
  let vuosi = 0;
  let yhteensa = 0;

  for (const merkinta of merkinnat) {
    yhteensa += merkinta.km;

    if (merkinta.date === tanaan) {
      paiva += merkinta.km;
    }

    if (merkinta.date >= viikonEnsimmainen && merkinta.date <= tanaan) {
      viikko += merkinta.km;
    }

    if (merkinta.date >= kuukaudenAlku && merkinta.date <= tanaan) {
      kuukausi += merkinta.km;
    }

    if (merkinta.date >= vuodenAlku && merkinta.date <= tanaan) {
      vuosi += merkinta.km;
    }
  }

  // Pyöristetään kahteen desimaaliin liukulukuvirheiden takia
  return {
    paiva: Math.round(paiva * 100) / 100,
    viikko: Math.round(viikko * 100) / 100,
    kuukausi: Math.round(kuukausi * 100) / 100,
    vuosi: Math.round(vuosi * 100) / 100,
    yhteensa: Math.round(yhteensa * 100) / 100
  };
}

// Laskee keskiarvot kalenteripäiviä kohti
function laskeKeskiarvot(koonnit) {
  const nyt = new Date();

  // Kuluvan viikon päivien määrä, maanantaista tähän päivään
  const viikonpaiva = nyt.getDay() === 0 ? 7 : nyt.getDay();

  // Kuluvan kuukauden päivien määrä
  const kuukaudenPaiva = nyt.getDate();

  // Kuluvan vuoden päivien määrä
  const vuodenAlku = new Date(nyt.getFullYear(), 0, 1);
  const vuodenPaiva = Math.floor((nyt - vuodenAlku) / 86400000) + 1;

  return {
    viikko: Math.round((koonnit.viikko / viikonpaiva) * 100) / 100,
    kuukausi: Math.round((koonnit.kuukausi / kuukaudenPaiva) * 100) / 100,
    vuosi: Math.round((koonnit.vuosi / vuodenPaiva) * 100) / 100
  };
}

// Palkintojen rajat kilometreinä
const PALKINNOT = [100, 200, 500, 1000];

// Palauttaa palkinnot ja tiedon onko ne avattu
function laskePalkinnot(yhteensa) {
  return PALKINNOT.map((raja) => ({
    raja,
    avattu: yhteensa >= raja
  }));
}

module.exports = { muotoilePaiva, laskeKoonnit, laskeKeskiarvot, laskePalkinnot };