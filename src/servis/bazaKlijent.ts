import sqlite3 from 'sqlite3';

export class BazaKlijent {
    private baza: any;

    constructor(putanja: string) {
        this.baza = new sqlite3.Database(putanja);
    }

    izvrsiUpit(sql: string, parametri: any[] = []): Promise<any> {
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
}
