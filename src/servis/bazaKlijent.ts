import sqlite3 from 'sqlite3';

export class BazaKlijent {
    private baza: any;

    constructor(putanja: string) {
        this.baza = new sqlite3.Database(putanja);
    }

    /** SELECT upiti (vraća retke) */
    izvrsiUpit(sql: string, parametri: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.baza.all(sql, parametri, (greska: Error | null, redovi: any[]) => {
                if (greska) {
                    reject(greska);
                } else {
                    resolve(redovi);
                }
            });
        });
    }

    /** INSERT/UPDATE/DELETE (ne vraća retke; vraća lastID/changes ako treba) */
    izvrsiPromjenu(sql: string, parametri: any[] = []): Promise<{ lastID: number; changes: number }> {
        return new Promise((resolve, reject) => {
            this.baza.run(sql, parametri, function (this: { lastID: number; changes: number }, greska: Error | null) {
                if (greska) reject(greska);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }
}
