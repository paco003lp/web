import express from 'express';
import { existsSync } from 'fs';
import { Konfigurator } from './build/zajednicko/konfiguracija.js';
import { BazaKlijent } from './build/servis/bazaKlijent.js';
import {TmdbKlijent} from './build/servis/tmdbKlijent.js'
import path from 'path';

const server = express();
const putanjaKonfiguracije = process.argv[2];
const __dirname = path.resolve();

if (!putanjaKonfiguracije || !existsSync(putanjaKonfiguracije)) {
    console.error("Pogreška: Niste proslijedili ispravnu putanju do konfiguracije!");
    process.exit(1);
}

const konf = new Konfigurator();
let tmdb;
try {
    konf.ucitajKonfiguraciju(putanjaKonfiguracije);
    console.log("Konfiguracija uspješno učitana.");

    const tmdbKljuc = konf.dajKonfiguraciju("tmdbApiKeyV3").trim();
    if (!tmdbKljuc) {
        throw new Error("TMDB API ključ nije pronađen u konfiguraciji.");
    }
    console.log("TMDB API ključ uspješno učitan.");
    tmdb = new TmdbKlijent(tmdbKljuc);

} catch (greška) {
    console.error("Problem s konfiguracijom:", greška.message);
    process.exit(1);
}

const putanjaBaze = `./podaci/RWA2024pcrncic22.sqlite`; 
const baza = new BazaKlijent(putanjaBaze);
const port = process.argv[3] || 12345; 

server.use(express.static("javno"));
server.use(express.json());

server.use((zahtjev,odgovor,next)=>{
    const sql = "INSERT INTO dnevnik(metoda, putanja) VALUES (?, ?)";
    baza.izvrsiUpit(sql,[zahtjev.method, zahtjev.url])
    .catch(err => console.error("Dnevnik greška: ", err));
    next();
})

server.use("/dokumentacija", express.static(path.resolve(process.cwd(),"dokumentacija")));

server.get("/", (zahtjev, odgovor) => {
    odgovor.sendFile(path.resolve(process.cwd(),"javno","index.html"));
});

server.get("/api/korisnici", (zahtjev, odgovor)=>{
    baza.izvrsiUpit("SELECT * FROM korisnik", [])
    .then((podaci)=>{
        odgovor.type('application/json');
        odgovor.send(JSON.stringify(podaci));
    })
    .catch((greska) => {
        odgovor.status(500).json({greska:greska.message});
    })
});

server.get("/api/zanr",async(zahtjev,odgovor)=>{
    try{
    let mojiZanrovi= await baza.izvrsiUpit("SELECT * FROM zanr", []);

    if (mojiZanrovi.length === 0){
        console.log("Baza je prazna, dohvacam zanrove s TMDBa");
        const tmdbZanrovi = await tmdb.dohvatiZanrove();

        for(let z of tmdbZanrovi){
            await baza.izvrsiUpit("INSERT INTO zanr (id, naziv) VALUES (?,?)", [z.id, z.name]);
        }
        mojiZanrovi = await baza.izvrsiUpit("SELECT * FROM zanr", []);
    }
    odgovor.json(mojiZanrovi);
    }catch(g){
        console.error("Greska kod zanrova: ",g);
        odgovor.status(500).json({greska: "Neuspjeh rada s zanrovima"});
    }
})

server.get("/api/tmdb/film",async(zahtjev,odgovor)=>{
    try{
        const upit = (zahtjev.query.upit || "").toString().trim();
        const stranica = Number.parseInt((zahtjev.query.stranica || "1").toString(),10);

        if (!upit){
            return odgovor.status(400).json({greska: "Parametar 'upit' je obavezan"});
        }

        if (Number.isNaN(stranica)|| stranica < 1){
            return odgovor.status(400).json({greska: "Parametaar 'stranica' mora biti broj >=1"});
        }

        const rezultat = await tmdb.dohvatiFilmove(upit, stranica);
        odgovor.json(rezultat);
    }catch(g){
        console.error("Greska TMDB pretrage: ",g);
        odgovor.status(500).json({greska: "Neuspjeh pretrage filmova na TMDBu"})
    }
})
/*
server.get("/api/film",(zahtjev,odgovor)=>{
    const sql = "SELECT * FROM film";
    baza.izvrsiUpit(sql,[])
    .then((podaci)=>{
        odgovor.json(podaci);
    })
    .catch((greska)=>{
        odgovor.status(500).json({greska: greska.message});
    })
})*/



server.post("/api/korisnici", (zahtjev,odgovor)=>{
    const noviKorisnik = zahtjev.body;
    console.log("Pokusaj registracije", noviKorisnik);

    const sql = 'INSERT INTO korisnik (ime, prezime, lozinka, email, korime, tip_korisnika_id) VALUES (?,?,?,?,?,?)';

    const podaci = [
        noviKorisnik.ime,
        noviKorisnik.prezime,
        noviKorisnik.lozinka,
        noviKorisnik.email,
        noviKorisnik.korime,
        2
    ];

    baza.izvrsiUpit(sql, podaci)
    .then(()=>{
        odgovor.status(201).json({poruka: "Korisnik kreiran!: "});
    })
    .catch((greska)=>{
        odgovor.status(400).json({greska: greska.message})
    })
})

server.get("/api/film",(zahtjev,odgovor)=>{
    const sql = "SELECT * FROM film";

    baza.izvrsiUpit(sql,[])
        .then((redovi)=>{
            odgovor.json(redovi);
        })
        .catch((g)=>{
            console.error("Greska pri citanju iz baze:", g.message);
            odgovor.status(500).json({greska: "Ne mogu dohvatiti favorite"});
        });
});

server.post("/api/film",(zahtjev,odgovor)=>{
    const film = zahtjev.body;
    console.log("Spremam film u favorite: ", film.naslov);
    const sql = `INSERT INTO film (tmdb_id, naslov, opis, putanja_slike, popularnost) 
                 VALUES (?, ?, ?, ?, ?)`;
    const podaci = [
        film.tmdb_id,
        film.naslov,
        film.opis,
        film.putanja_slike,
        film.popularnost
    ];

    baza.izvrsiUpit(sql,podaci)
        .then(()=>{
            odgovor.status(201).json({poruka: "Film uspjesno dodan u favorite"});
        })
        .catch((greska)=>{
            console.error("Greska baze", greska.message);
            odgovor.status(400).json({greska: "Film je vec favorit"});
        })
})

server.listen(port, () => {
    console.log(`Poslužitelj pokrenut na adresi: http://localhost:${port}`);
});