/** Kad TMDB slika ne učita, ne koristimo vanjski placeholder (via.placeholder često padne → ERR_CONNECTION_CLOSED i beskonačna onerror petlja). */
const SLIKA_NEMA_POSTERA =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><rect fill="#1e1e1e" width="100%" height="100%"/><text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="22">Nema slike</text></svg>'
    );
const SLIKA_NEMA_POSTERA_MALA =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="92" height="138"><rect fill="#1e1e1e" width="100%" height="100%"/></svg>'
    );

// Globalna mapa filmova — tmdb_id → film objekt, izbjegava inline JSON u onclick
const _filmovi = new Map();

function ocistiVrijednosti(ids) {
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
}

function zatvoriModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;

    // bootstrap bundle je učitan globalno u index.html
    const inst =
        window.bootstrap?.Modal?.getInstance(el) || new window.bootstrap.Modal(el);
    inst.hide();
}

async function procitajJsonSigurno(odgovor) {
    try {
        return await odgovor.json();
    } catch {
        return null;
    }
}

async function osvjeziAuthUI() {
    try {
        const res = await fetch("/api/prijava");
        const stanje = await procitajJsonSigurno(res);
        const logiran = !!stanje?.logiran;

        const btnPrijava = document.getElementById("btn-prijava");
        const btnRegistracija = document.getElementById("btn-registracija");
        const btnOdjava = document.getElementById("btn-odjava");

        if (btnPrijava) btnPrijava.classList.toggle("d-none", logiran);
        if (btnRegistracija) btnRegistracija.classList.toggle("d-none", logiran);
        if (btnOdjava) btnOdjava.classList.toggle("d-none", !logiran);
    } catch {
        // Ako server nije dostupan, samo ostavimo default UI.
    }
}

function karticaFilmMini(film) {
    const naslov = escapeHtml(film?.title || "Nepoznat naslov");
    const godina = film?.release_date ? film.release_date.split("-")[0] : "";
    const slika = film?.poster_path
        ? `https://image.tmdb.org/t/p/w342${film.poster_path}`
        : SLIKA_NEMA_POSTERA;
    const id = film?.id;
    if (id) _filmovi.set(id, film);

    return `
        <div class="col-6 col-sm-4 col-md-3 col-lg-2">
            <div class="film-card film-card-mini">
                <img src="${slika}" alt="${naslov}" style="cursor:pointer;" onclick="otvoriDetalje(${id})" onerror="this.onerror=null;this.src='${SLIKA_NEMA_POSTERA}'">
                <div class="card-body">
                    <div class="card-title" style="cursor:pointer;" onclick="otvoriDetalje(${id})">${naslov}</div>
                    <div class="card-year">${godina}</div>
                    ${id ? `<button class="btn-fav" onclick="dodajUFavorite(${id})"><i class="bi bi-star me-1"></i>Favorit</button>` : ""}
                </div>
            </div>
        </div>
    `;
}

async function ucitajPocetnu() {
    const top5El = document.getElementById("pocetna-top5");
    const najnovijeEl = document.getElementById("pocetna-najnovije");
    if (!top5El || !najnovijeEl) return;

    try {
        const res = await fetch("/api/tmdb/pocetna");
        const data = await procitajJsonSigurno(res);
        if (!res.ok) throw new Error(data?.greska || "Ne mogu učitati početnu.");

        top5El.innerHTML = (data.top5 || []).map(karticaFilmMini).join("");
        najnovijeEl.innerHTML = (data.najnovije || []).map(karticaFilmMini).join("");
    } catch (e) {
        top5El.innerHTML = `<div class="col-12 text-muted">Ne mogu dohvatiti preporuke.</div>`;
        najnovijeEl.innerHTML = `<div class="col-12 text-muted">Ne mogu dohvatiti najnovije filmove.</div>`;
    }
}

async function odjaviKorisnika() {
    await fetch("/api/odjava");
    const porukaPrijave = document.getElementById("poruka-prijave");
    const porukaReg = document.getElementById("poruka-registracije");
    if (porukaPrijave) porukaPrijave.innerHTML = "";
    if (porukaReg) porukaReg.innerHTML = "";
    await osvjeziAuthUI();
}

async function registrirajKorisnika() {
    const poruka = document.getElementById("poruka-registracije");
    if (poruka) poruka.innerHTML = "";

    const podaci = {
        ime: document.getElementById("reg-ime").value,
        prezime: document.getElementById("reg-prezime").value,
        korime: document.getElementById("reg-korime").value,
        email: document.getElementById("reg-email").value,
        lozinka: document.getElementById("reg-lozinka").value,
    };
    const odgovor = await fetch("/api/korisnici", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(podaci),
    });
    const rezultat = await procitajJsonSigurno(odgovor);
    if (odgovor.ok) {
        ocistiVrijednosti([
            "reg-ime",
            "reg-prezime",
            "reg-korime",
            "reg-email",
            "reg-lozinka",
        ]);
        zatvoriModal("modal-registracija");
        await osvjeziAuthUI();
    } else {
        const greska = rezultat?.greska || "Registracija nije uspjela.";
        if (poruka) poruka.innerHTML = `<div class="text-danger">${greska}</div>`;
    }
}

async function prijaviKorisnika() {
    const korime = document.getElementById("login-korime").value;
    const lozinka = document.getElementById("login-lozinka").value;

    const odgovor = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ korime, lozinka }),
    });
    const rezultat = await procitajJsonSigurno(odgovor);
    const porukaDiv = document.getElementById("poruka-prijave");

    if (odgovor.ok) {
        if (porukaDiv) porukaDiv.innerHTML = `<p class="text-success">Dobrodošli, ${escapeHtml(korime)}!</p>`;
        ocistiVrijednosti(["login-korime", "login-lozinka"]);
        zatvoriModal("modal-prijava");
        await osvjeziAuthUI();
    } else {
        const greska = rezultat?.greska || "Neuspješna prijava.";
        if (porukaDiv) porukaDiv.innerHTML = `<p class="text-danger">${greska}</p>`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    osvjeziAuthUI();
    ucitajPocetnu();
});


async function pretraziFilmove() {
    const upit = document.getElementById("upit").value;
    const kontejner = document.getElementById("rezultati");

    if (!upit) {
        prikaziObavijest("Upiši naziv filma!", "warning");
        return;
    }

    document.getElementById("sekcija-top5")?.classList.add("d-none");
    document.getElementById("sekcija-najnovije")?.classList.add("d-none");

    let naslov = document.getElementById("rezultati-naslov");
    if (!naslov) {
        naslov = document.createElement("div");
        naslov.id = "rezultati-naslov";
        naslov.className = "section-title mb-3";
        kontejner.parentElement.insertBefore(naslov, kontejner);
    }
    naslov.innerHTML = `<i class="bi bi-search"></i> Rezultati za: <em style="color:#aaa;">${escapeHtml(upit)}</em>`;

    kontejner.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border text-danger"></div></div>';

    try {
        const odgovor = await fetch(`/api/tmdb/film?upit=${encodeURIComponent(upit)}`);
        const podaci = await odgovor.json();
        console.log("Podaci koji su stigli sa servera:", podaci);
        const filmovi = podaci.results || podaci;

        if (!Array.isArray(filmovi) || filmovi.length === 0) {
            kontejner.innerHTML = '<div class="alert alert-warning col-12">Nema rezultata za taj pojam.</div>';
            return;
        }

        kontejner.innerHTML = "";

        kontejner.innerHTML = "";
        filmovi.forEach(film => {
            const naslov = escapeHtml(film.title || film.naslov || "Nepoznat naslov");
            const godina = film.release_date ? film.release_date.split("-")[0] : "";
            const slika = film.poster_path
                ? `https://image.tmdb.org/t/p/w500${film.poster_path}`
                : SLIKA_NEMA_POSTERA;
            if (film.id) _filmovi.set(film.id, film);

            const kartica = `
                <div class="col-6 col-md-4 col-lg-3">
                    <div class="film-card">
                        <img src="${slika}" alt="${naslov}" style="cursor:pointer;" onclick="otvoriDetalje(${film.id})" onerror="this.onerror=null;this.src='${SLIKA_NEMA_POSTERA}'">
                        <div class="card-body">
                            <div class="card-title" style="cursor:pointer;" onclick="otvoriDetalje(${film.id})">${naslov}</div>
                            <div class="card-year">${godina}</div>
                            <button class="btn-fav" onclick="dodajUFavorite(${film.id})">
                                <i class="bi bi-star me-1"></i>Favorit
                            </button>
                        </div>
                    </div>
                </div>
            `;
            kontejner.innerHTML += kartica;
        });

    } catch (greska) {
        console.error("Greška u klijent.js:", greska);
        kontejner.innerHTML = '<div class="alert alert-danger col-12">Greška pri dohvatu podataka. Pogledaj konzolu (F12).</div>';
    }
}

async function autocompleteFilmove() {
    const upit = document.getElementById("upit").value.trim();
    const lista = document.getElementById("autocomplete-lista");

    if (upit.length < 3) {
        lista.innerHTML = "";
        return;
    }

    try {
        const odgovor = await fetch(
            `/api/tmdb/film?upit=${encodeURIComponent(upit)}&stranica=1`
        );
        if (!odgovor.ok) {
            lista.innerHTML = "";
            return;
        }
        const podaci = await odgovor.json();
        const rezultati = (podaci.results || []).slice(0, 5);

        if (rezultati.length === 0) {
            lista.innerHTML = "";
            return;
        }

        lista.innerHTML = rezultati
            .map(
                (film) => `
            <button type="button" class="list-group-item list-group-item-action d-flex align-items-center"
                    onclick='odaberiIzAutocomplete(${JSON.stringify(film.title)})'>
                <img src="https://image.tmdb.org/t/p/w92${film.poster_path || ""}"
                     class="me-2" style="width: 30px; height: 45px; object-fit: cover;"
                     onerror="this.onerror=null;this.src='${SLIKA_NEMA_POSTERA_MALA}'">
                <div>
                    <div class="fw-bold">${escapeHtml(film.title)}</div>
                    <small class="text-muted">${film.release_date ? film.release_date.split("-")[0] : ""}</small>
                </div>
            </button>
        `
            )
            .join("");
    } catch (e) {
        console.error("Greska kod autocomplete: ", e);
        lista.innerHTML = "";
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function odaberiIzAutocomplete(naslov){
    document.getElementById("upit").value = naslov;
    document.getElementById("autocomplete-lista").innerHTML = "";
    pretraziFilmove();
}

document.addEventListener("click", function (e) {
    if (
        e.target.closest("#upit") ||
        e.target.closest("#autocomplete-lista")
    ) {
        return;
    }
    document.getElementById("autocomplete-lista").innerHTML = "";
});

async function dodajUFavorite(tmdbId) {
    const film = _filmovi.get(tmdbId);
    if (!film) {
        alert("Film nije pronađen.");
        return;
    }
    try {
        const odgovor = await fetch("/api/film", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                tmdb_id: film.id,
                naslov: film.title,
                opis: film.overview,
                putanja_slike: film.poster_path,
                popularnost: film.popularity
            })
        });

        if (odgovor.ok) {
            prikaziObavijest("Film dodan u favorite!", "success");
            return;
        }

        const data = await procitajJsonSigurno(odgovor);
        if (odgovor.status === 401) {
            // Zatvori detalje pa otvori prijavu
            const modalFilm = window.bootstrap.Modal.getInstance(document.getElementById("modal-film"));
            if (modalFilm) {
                modalFilm.hide();
                document.getElementById("modal-film").addEventListener("hidden.bs.modal", () => {
                    new window.bootstrap.Modal(document.getElementById("modal-prijava")).show();
                }, { once: true });
            } else {
                new window.bootstrap.Modal(document.getElementById("modal-prijava")).show();
            }
            return;
        }
        if (odgovor.status === 409) {
            prikaziObavijest("Film je već u favoritima.", "warning");
            return;
        }
        prikaziObavijest(data?.greska || "Greška pri spremanju.", "danger");
    } catch (e) {
        console.error(e);
    }
}

function prikaziObavijest(tekst, tip = "success") {
    const div = document.createElement("div");
    div.className = `alert alert-${tip} alert-dismissible position-fixed bottom-0 end-0 m-3 shadow`;
    div.style.zIndex = "9999";
    div.innerHTML = `${tekst}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3500);
}

async function ucitajFavorite() {
    document.getElementById("sekcija-top5")?.classList.add("d-none");
    document.getElementById("sekcija-najnovije")?.classList.add("d-none");
    const rez = document.getElementById("rezultati");

    const naslov = document.getElementById("rezultati-naslov");
    if (!naslov) {
        const h = document.createElement("div");
        h.id = "rezultati-naslov";
        h.className = "section-title mb-3";
        h.innerHTML = '<i class="bi bi-star-fill text-warning"></i> Moji favoriti';
        rez.parentElement.insertBefore(h, rez);
    }

    rez.innerHTML = "<div class='col-12 text-center py-4'><div class='spinner-border text-danger'></div></div>";

    try{
        const odgovor = await fetch("/api/film");
        const favoriti = await procitajJsonSigurno(odgovor);
        if (!odgovor.ok) {
            if (odgovor.status === 401) {
                rez.innerHTML = "<div class='alert alert-warning col-12'>Prijavi se da vidiš svoje favorite.</div>";
                const el = document.getElementById("modal-prijava");
                if (el) new window.bootstrap.Modal(el).show();
                return;
            }
            rez.innerHTML = "<div class='alert alert-danger col-12'>Ne mogu dohvatiti favorite.</div>";
            return;
        }

        rez.innerHTML = "";

        if(!Array.isArray(favoriti) || favoriti.length === 0){
            rez.innerHTML = "<div class='alert alert-info col-12'>Nemaš još nijedan favorit!</div>";
            return;
        }

        rez.innerHTML = "";
        favoriti.forEach(film => {
            const slikaURL = film.putanja_slike
                ? `https://image.tmdb.org/t/p/w500${film.putanja_slike}`
                : SLIKA_NEMA_POSTERA;
            const opis = film.opis ? escapeHtml(film.opis).substring(0, 100) + "…" : "";

            rez.innerHTML += `
                <div class="col-6 col-md-4 col-lg-3">
                    <div class="film-card" style="border-color:#f5c518;">
                        <img src="${slikaURL}" onerror="this.onerror=null;this.src='${SLIKA_NEMA_POSTERA}'">
                        <div class="card-body">
                            <div class="card-title">${escapeHtml(film.naslov)}</div>
                            <div class="card-year text-warning"><i class="bi bi-star-fill me-1"></i>Favorit</div>
<button class="btn-fav mt-1" style="background:#555;" onclick="ukloniIzFavorita(${film.tmdb_id})">
    <i class="bi bi-trash me-1"></i>Ukloni
</button>
                            ${opis ? `<p class="small mt-1" style="color:#888;font-size:0.78rem;">${opis}</p>` : ""}
                        </div>
                    </div>
                </div>
            `;
        })
    }catch(e){
        console.error("Greska:", e);
        rez.innerHTML ="<div class='alert alert-danger col-12'>Došlo je do greške pri dohvaćanju.</div>";
    }
}

async function ukloniIzFavorita(tmdb_id) {
    const odgovor = await fetch(`/api/film/${tmdb_id}`, {method: "DELETE"});
    if(odgovor.ok){
        prikaziObavijest("Film uklonjen iz favorita.","warning");
        await ucitajFavorite();
    }else{
        prikaziObavijest("Ne mogu ukloniti film iz favorita.","danger");
    }
    
}

function otvoriDetalje(tmdbId) {
    const film = _filmovi.get(tmdbId);
    if (!film) return;

    document.getElementById("modal-film-naslov").textContent = film.title || "—";
    document.getElementById("modal-film-godina").textContent = film.release_date ? film.release_date.split("-")[0] : "";
    document.getElementById("modal-film-opis").textContent = film.overview || "Nema opisa.";
    document.getElementById("modal-film-ocjena").textContent = film.vote_average?.toFixed(1) || "N/A";
    document.getElementById("modal-film-slika").src = film.poster_path
        ? `https://image.tmdb.org/t/p/w342${film.poster_path}`
        : SLIKA_NEMA_POSTERA;
    document.getElementById("modal-film-btn").onclick = () => dodajUFavorite(tmdbId);

    new window.bootstrap.Modal(document.getElementById("modal-film")).show();
}

function vratiNaPočetak() {
    document.getElementById("rezultati").innerHTML = "";
    document.getElementById("rezultati-naslov")?.remove();
    document.getElementById("upit").value = "";
    document.getElementById("autocomplete-lista").innerHTML = "";
    document.getElementById("sekcija-top5")?.classList.remove("d-none");
    document.getElementById("sekcija-najnovije")?.classList.remove("d-none");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// Izlaganje funkcija globalnom objektu window
window.registrirajKorisnika = registrirajKorisnika;
window.prijaviKorisnika = prijaviKorisnika;
window.odjaviKorisnika = odjaviKorisnika;
window.pretraziFilmove = pretraziFilmove;
window.autocompleteFilmove = autocompleteFilmove;
window.ucitajFavorite = ucitajFavorite;
window.dodajUFavorite = dodajUFavorite;
window.odaberiIzAutocomplete = odaberiIzAutocomplete;
window.ukloniIzFavorita = ukloniIzFavorita;
window.otvoriDetalje = otvoriDetalje;
window.vratiNaPočetak = vratiNaPočetak;