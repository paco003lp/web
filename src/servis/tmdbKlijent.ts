export class TmdbKlijent {
    private baznaPutanja = "https://api.themoviedb.org/3";
    private apiKljuc : string;

    constructor (apiKljuc: string){
        this.apiKljuc = apiKljuc;
    }

    async dohvatiZanrove(){
        let resurs = '/genre/movie/list?language=en-US';
        let odgovor = await fetch (this.baznaPutanja + resurs + `&api_key=${this.apiKljuc}`);
        let podaci = await odgovor.json();

        console.log("Podaci s TMDB", podaci);
        return podaci.genres || [];
    }

    async dohvatiFilmove(upit: string, stranica: number = 1) {
       const cistUpit = upit.trim();
       if(!cistUpit){
        throw new Error("Nedostaje upit za pretragu");
       }

       const resurs = `/search/movie?query=${encodeURIComponent(cistUpit)}&page=${stranica}&language=en-US&include_adult=false`;
       const url = this.baznaPutanja + resurs + `&api_key=${this.apiKljuc}`;
       const odgovor = await fetch(url);
       const podaci = await odgovor.json();

       if(!odgovor.ok){
        throw new Error(podaci?.status_message || "Greska pri dohvatu filmova");
       }
       return podaci;
    }
}