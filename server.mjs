import session from 'express-session';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import connectSqlite3 from 'connect-sqlite3';

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

// Migracija: favorite vežemo uz korisnika (korime iz sessiona).
// Radimo provjeru sheme pa ALTER samo ako treba.
try {
    const info = await baza.izvrsiUpit("PRAGMA table_info(film);", []);
    const imaStupac = Array.isArray(info) && info.some((c) => c?.name === "korisnik_korime");
    if (!imaStupac) {
        await baza.izvrsiPromjenu("ALTER TABLE film ADD COLUMN korisnik_korime TEXT", []);
    }
    // Očisti stare favorite (iz prije per-user logike) da ne "cure" među korisnicima.
    await baza.izvrsiPromjenu("DELETE FROM film WHERE korisnik_korime IS NULL OR korisnik_korime = ''", []);
} catch (e) {
    console.warn("Upozorenje: migracija favorita nije uspjela:", e?.message || e);
}

server.use(express.static("javno"));
server.use(express.json());

const SQLiteStore = connectSqlite3(session);

server.use(session({
    store: new SQLiteStore({ db: 'RWA2024pcrncic22.sqlite', dir: './podaci' }),
    secret: konf.dajKonfiguraciju("tajniKljucSesija"),
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

server.use((zahtjev,odgovor,next)=>{
    const sql = "INSERT INTO dnevnik(metoda, putanja) VALUES (?, ?)";
    baza.izvrsiPromjenu(sql,[zahtjev.method, zahtjev.url])
    .catch(err => console.error("Dnevnik greška: ", err));
    next();
})

server.use("/dokumentacija", express.static(path.resolve(process.cwd(),"dokumentacija")));

server.get("/", (zahtjev, odgovor) => {
    odgovor.sendFile(path.resolve(process.cwd(),"javno","index.html"));
});

server.get("/api/korisnici", (zahtjev, odgovor)=>{
    if (!zahtjev.session.korisnik || zahtjev.session.tip !== 1) {
        return odgovor.status(403).json({ greska: "Nemate pravo pristupa." });
    }
    baza.izvrsiUpit("SELECT id, ime, prezime, email, korime, tip_korisnika_id FROM korisnik", [])
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

// Početna: "Top 5 za vas" + "Najnoviji filmovi"
server.get("/api/tmdb/pocetna", async (zahtjev, odgovor) => {
    try {
        const popularno = await tmdb.dohvatiPopularno(1);
        const najnovije = await tmdb.dohvatiNajnovije(1);
        odgovor.json({
            top5: (popularno.results || []).slice(0, 5),
            najnovije: (najnovije.results || []).slice(0, 12)
        });
    } catch (g) {
        console.error("Greska pocetne TMDB:", g);
        odgovor.status(500).json({ greska: "Ne mogu dohvatiti početne filmove." });
    }
});
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



server.post("/api/korisnici", async (zahtjev,odgovor)=>{
    const noviKorisnik = zahtjev.body;

    try {
        const ime = (noviKorisnik?.ime || "").toString().trim();
        const prezime = (noviKorisnik?.prezime || "").toString().trim();
        const email = (noviKorisnik?.email || "").toString().trim();
        const korime = (noviKorisnik?.korime || "").toString().trim();
        const lozinka = (noviKorisnik?.lozinka || "").toString();

        if (!ime || !prezime || !email || !korime || !lozinka) {
            return odgovor.status(400).json({ greska: "Nedostaju obavezna polja (ime, prezime, email, korime, lozinka)." });
        }

        // Provjera duplikata korime/email
        const postoje = await baza.izvrsiUpit(
            "SELECT id FROM korisnik WHERE korime = ? OR email = ? LIMIT 1",
            [korime, email]
        );
        if (postoje.length > 0) {
            return odgovor.status(409).json({ greska: "Korisničko ime ili email već postoji." });
        }

        const sol = await bcrypt.genSalt(10);
        const hashLozinka = await bcrypt.hash(lozinka, sol);
        
        const sql = 'INSERT INTO korisnik (ime, prezime, lozinka, email, korime, tip_korisnika_id) VALUES (?, ?, ?, ?, ?, ?)';
        const podaci = [
            ime, 
            prezime, 
            hashLozinka, 
            email, 
            korime, 
            2
        ];
        await baza.izvrsiPromjenu(sql, podaci);
        return odgovor.status(201).json({ poruka: "Korisnik je uspješno registriran." });
    }catch(g){
        console.error("Greska kod spremanja korisnika: ",g.message);
        return odgovor.status(400).json({greska: "Neuspjeh rada s korisnicima"});
    }

    

  
})

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuta
    max: 10, // max 10 pokušaja po IP-u
    message: { greska: "Previše neuspjelih pokušaja prijave. Pokušajte za 15 minuta." },
    standardHeaders: true,
    legacyHeaders: false,
});

server.post("/api/login", loginLimiter, async(zahtjev,odgovor)=>{
    const {korime,lozinka} = zahtjev.body;

    try{
        const k = (korime || "").toString().trim();
        const l = (lozinka || "").toString();
        if (!k || !l) {
            return odgovor.status(400).json({ greska: "Nedostaje korisničko ime ili lozinka." });
        }

        const sql = "SELECT * FROM korisnik WHERE korime = ?";
        const korisnici = await baza.izvrsiUpit(sql,[k]);

        if(korisnici.length > 0){
            const korisnik = korisnici[0];

            const uspjeh = await bcrypt.compare(l, korisnik.lozinka);

            if(uspjeh){
                // Spremimo minimalne podatke u session
                zahtjev.session.korisnik = korisnik.korime;
                zahtjev.session.ime = korisnik.ime;
                zahtjev.session.tip = korisnik.tip_korisnika_id;

                return odgovor.json({ poruka: "Uspješno prijavljen", korisnik: { korime: korisnik.korime, ime: korisnik.ime } });
            }
        }
        odgovor.status(401).json({greska: "Neuspjeh prijave"});
    }catch(g){
        odgovor.status(500).json({greska: "Neuspjeh rada s korisnicima"});
    }
    });

server.get("/api/prijava",async(zahtjev,odgovor)=>{
    if(zahtjev.session.korisnik){
        odgovor.json({logiran: true, korisnik: zahtjev.session.korisnik});
    }else{
        odgovor.json({logiran: false});
    }
});

server.get("/api/odjava",async(zahtjev,odgovor)=>{
    zahtjev.session.destroy(() => {
        odgovor.json({poruka: "Uspjesno odjavljivanje"});
    });
});

server.get("/api/film",(zahtjev,odgovor)=>{
    const korime = zahtjev.session.korisnik;
    if (!korime) {
        return odgovor.status(401).json({ greska: "Niste prijavljeni." });
    }

    // Tablica `film` u SQLiteu ne mora imati stupac `id`, ali uvijek ima `rowid`.
    const sql = "SELECT rowid AS _rid, * FROM film WHERE korisnik_korime = ? ORDER BY rowid DESC";

    baza.izvrsiUpit(sql,[korime])
        .then((redovi)=>{
            odgovor.json(redovi);
        })
        .catch((g)=>{
            console.error("Greska pri citanju iz baze:", g.message);
            odgovor.status(500).json({greska: "Ne mogu dohvatiti favorite"});
        });
});

server.post("/api/film",async(zahtjev,odgovor)=>{
    const korime = zahtjev.session.korisnik;
    if (!korime) {
        return odgovor.status(401).json({ greska: "Niste prijavljeni." });
    }

    const film = zahtjev.body;
    console.log("Spremam film u favorite: ", film.naslov);

    try {
        const postoji = await baza.izvrsiUpit(
            "SELECT rowid AS _rid FROM film WHERE tmdb_id = ? AND korisnik_korime = ? LIMIT 1",
            [film.tmdb_id, korime]
        );
        if (postoji.length > 0) {
            return odgovor.status(409).json({ greska: "Film je već favorit." });
        }

        const sql = `INSERT INTO film (tmdb_id, naslov, opis, putanja_slike, popularnost, korisnik_korime) 
                     VALUES (?, ?, ?, ?, ?, ?)`;
        const podaci = [
            film.tmdb_id,
            film.naslov,
            film.opis,
            film.putanja_slike,
            film.popularnost,
            korime
        ];

        await baza.izvrsiPromjenu(sql,podaci);
        return odgovor.status(201).json({poruka: "Film uspjesno dodan u favorite"});
    } catch (greska) {
        console.error("Greska baze", greska.message);
        return odgovor.status(400).json({greska: "Neuspjeh spremanja favorita"});
    }
})

server.delete("/api/film/:tmdb_id", async (zahtjev, odgovor) => {
    const korime = zahtjev.session.korisnik;
    if (!korime) {
        return odgovor.status(401).json({ greska: "Niste prijavljeni." });
    }

    const tmdb_id = zahtjev.params.tmdb_id;

    try {
        await baza.izvrsiPromjenu(
            "DELETE FROM film WHERE tmdb_id = ? AND korisnik_korime = ?",
            [tmdb_id, korime]
        );
        odgovor.json({ poruka: "Film uklonjen iz favorita." });
    } catch (g) {
        odgovor.status(500).json({ greska: "Greška pri brisanju." });
    }
});

server.delete("/api/film/:tmdb_id", async (zahtjev, odgovor) => {
    const korime = zahtjev.session.korisnik;
    if (!korime) {
        return odgovor.status(401).json({ greska: "Niste prijavljeni." });
    }

    const tmdb_id = zahtjev.params.tmdb_id;

    try {
        await baza.izvrsiPromjenu(
            "DELETE FROM film WHERE tmdb_id = ? AND korisnik_korime = ?",
            [tmdb_id, korime]
        );
        odgovor.json({ poruka: "Film uklonjen iz favorita." });
    } catch (g) {
        odgovor.status(500).json({ greska: "Greška pri brisanju." });
    }
});

server.get("/api/kviz")

server.listen(port, () => {
    console.log(`Poslužitelj pokrenut na adresi: http://localhost:${port}`);
});