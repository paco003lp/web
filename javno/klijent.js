/** Kad TMDB slika ne učita, ne koristimo vanjski placeholder (via.placeholder često padne → ERR_CONNECTION_CLOSED i beskonačna onerror petlja). */
const SLIKA_NEMA_POSTERA =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><rect fill="#e9ecef" width="100%" height="100%"/><text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#adb5bd" font-family="sans-serif" font-size="22">Nema slike</text></svg>'
    );
const SLIKA_NEMA_POSTERA_MALA =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="92" height="138"><rect fill="#dee2e6" width="100%" height="100%"/></svg>'
    );

async function pretraziFilmove() {
    const upit = document.getElementById("upit").value;
    const kontejner = document.getElementById("rezultati");

    if (!upit) {
        alert("Upiši naziv filma!");
        return;
    }

    kontejner.innerHTML = '<div class="text-center col-12"><h4>Tražim...</h4></div>';

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

        filmovi.forEach(film => {
            const naslov = film.title || film.naslov || "Nepoznat naslov";
            const slika = film.poster_path
                ? `https://image.tmdb.org/t/p/w500${film.poster_path}`
                : SLIKA_NEMA_POSTERA;

            const kartica = `
                <div class="col-md-3 mb-4">
                    <div class="card h-100 shadow-sm">
                        <img src="${slika}" class="card-img-top" alt="${naslov}" onerror="this.onerror=null;this.src='${SLIKA_NEMA_POSTERA}'">
                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title">${naslov}</h5>
                            <p class="card-text text-muted small">${film.release_date || ''}</p>
                            <button class="btn btn-success btn-sm mt-auto" 
                                onclick='dodajUFavorite(${JSON.stringify(film).replace(/'/g, "&apos;")})'>
                                ⭐ Favorit
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

async function dodajUFavorite(film) {
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

        if (odgovor.ok) alert("Spremljeno!");
        else alert("Već postoji ili greška.");
    } catch (e) {
        console.error(e);
    }
}

async function ucitajFavorite() {
    const rez = document.getElementById("rezultati");
    rez.innerHTML = "<div class='col-12'><h4>Učitavam tvoje favorite...</h4></div>";

    try{
        const odgovor = await fetch("/api/film");
        const favoriti = await odgovor.json();

        rez.innerHTML = "";

        if(favoriti.length === 0){
            rez.innerHTML = "<div class='alert alert-info col-12'>Nemaš još nijedan favorit!</div>";
            return;
        }

        favoriti.forEach(film =>{
            const slikaURL = film.putanja_slike
                ? `https://image.tmdb.org/t/p/w500${film.putanja_slike}`
                : SLIKA_NEMA_POSTERA;

            rez.innerHTML += `
                <div class="col-md-3 mb-4">
                    <div class="card h-100 border-warning shadow">
                        <img src="${slikaURL}" class="card-img-top" onerror="this.onerror=null;this.src='${SLIKA_NEMA_POSTERA}'">
                        <div class="card-body">
                            <h5 class="card-title">${film.naslov}</h5>
                            <p class="card-text small text-muted">${film.opis.substring(0, 100)}...</p>
                            <span class="badge bg-primary">Popularnost: ${film.popularnost}</span>
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