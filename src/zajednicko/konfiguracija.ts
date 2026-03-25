import { readFileSync } from 'fs';

export interface Konfiguracija{
    tajniKljucSesija: string;
    appStranicenje: number;
    tmdbApiKeyV3: string;
    tmdbApiKeyV4: string;
}

export class Konfigurator {
    podaci : Konfiguracija = {} as Konfiguracija;
    private konfiguracija : Map<string, string> = new Map();

    ucitajKonfiguraciju(putanja: string){
        let sadrzaj = readFileSync(putanja,"utf-8");
        let redovi = sadrzaj.split("\n");

        for (let red of redovi){
            if(!red.includes(":")|| red.trim()==="") continue;
            let pozicijaDvotocke = red.indexOf(":");
            let[kljuc, vrijednost] = red.split(":");
            this.popuniPodatak(kljuc.trim(), vrijednost.trim());
        }
        this.provjeriSvePodatke();
    }

    dajKonfiguraciju(kljuc: string): string {
        return this.konfiguracija.get(kljuc) || "";
    }

    private popuniPodatak(kljuc: string, vrijednost: string){
        this.konfiguracija.set(kljuc, vrijednost);
        if(kljuc === "tajniKljucSesija") this.podaci.tajniKljucSesija = vrijednost;
        if(kljuc === "appStranicenje") this.podaci.appStranicenje = parseInt(vrijednost);
        if(kljuc === "tmdbApiKeyV3") this.podaci.tmdbApiKeyV3 = vrijednost;
        if(kljuc === "tmdbApiKeyV4") this.podaci.tmdbApiKeyV4 = vrijednost;
    }

    private provjeriSvePodatke(){
        if(!this.podaci.tajniKljucSesija || this.podaci.tajniKljucSesija.length < 75) {
            throw new Error ("Pogreška: tajniKljucSesija mora ima 75-100 znakova!");
        }
        if(isNaN(this.podaci.appStranicenje) || this.podaci.appStranicenje < 5 || this.podaci.appStranicenje > 20) {
            throw new Error ("Pogreška: appStranicenje mora biti broj od 5 do 20!")
        }
    }
}
