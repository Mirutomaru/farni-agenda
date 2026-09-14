# AUDIT REPORT — Farní Agenda

## CRITICAL BUGY (překážejí build/running)

### 1. krestni-zapisky/page.tsx:20-26 — Query chain vrací void, filtry nefungují
```ts
let query = supabase.from('krestni_zapisky').select('*');
query.order('datum_zaznamu', { ascending: false }).limit(50); // ← vrátí void!
// query je stále bez order/limit → fetchne neomezeně dat bez řazení
```
Fix: `const { data, error } = await supabase.from('krestni_zapisky').select('*').order(...).limit(50);`

### 2. krestni-zapisky/page.tsx:171 — Inline onClick v server componentu (build fail)
Stránka importuje KrestniZapisForm bez 'use client', takže celá stránka je SSR. 
Inline `onClick={async () => {...}}` v JSX na řádku 171 způsobí build error:
> "Server Components cannot have inline event handlers"

### 3. krestni-zapisky/page.tsx:20 — Query na neexistující tabulku
```ts
supabase.from('krestni_zapisky') // → schéma má 'krestni_zapis' (bez -y)
```
Všechny ostatní query v projektu správně používají `krestni_zapis`.

### 4. krestni-zapisky/page.tsx:145 — Reference na neexistující sloupec
```ts
zapis.osoba_id // → schéma má pokrteny_id, birovani_id atd., nikoliv osoba_id
```

### 5. edit/osoby/[id]/page.tsx:28-29 — Dead page (prázdný obsah)
Stránka `/osoby/[id]/edit` neobsahuje žádný formulář nebo data. Je to skeleton.

---

## SCHEMA CONSISTENCE BUGY

### 6. schema-v3-improvements.sql:14 — Index na neexistující sloupec
```sql
CREATE INDEX idx_svatebni_svedkova ON svatba_svedkove(svatební_zapis_id);
-- → správně: svatba_id (podle definice tabulky v ř.7-9)
```

### 7. schema-v3-improvements.sql:23 -- Sloupec role vs farni_role
V schema-v3 je sloupec `farni_role`, ale v schema-v2 a consolidated schema.sql je `role`:
```sql
-- v3:     farni_role TEXT CHECK (...)
-- v2/sql: role TEXT CHECK (...)
```
Při aplikaci v3 na existující DB dojde k chybě při duplicitním sloupci.

### 8. schema-v3-improvements.sql:92 -- Insert do neexistujícího sloupce
```sql
INSERT INTO logs (..., data_zmeny)
-- → schéma má 'data_před' a 'data_po', nikoliv 'data_zmeny'
```

### 9. statistics/page.tsx:30-31 — Query na krestni_zapisky místo svatby tabulky
Funkce počítá "svatby" z `krestni_zapisky` (neexistující tabulka). 
Místo toho měla použít tabulku `svatby`.

### 10. finance/page.tsx:37 -- Date range filter se nepoužije
```ts
// lines 50-54 parse dateRangeFilter ale výsledek není aplikován na query
const [gteCol, gteVal] = dateRangeFilter.split(',').map(...);
// → kód končí a filtr je zahoden. Query fetchne VŠECHNY finance bez data filteru.
```

---

## MAJETEK PAGE BUGY

### 11. majetek/page.tsx:33-38 -- get_monthly_statistics pro výpočet hodnoty majetku
Volá statistickou funkci jako náhradu za `SUM(aktuální_hodnota)` — vrací data o členech, ne majetku.

---

## STATISTICS PAGE BUGS

### 12. statistics/page.tsx:30 -- Query na krestni_zapisky (neexistující tabulka)
```ts
.from('krestni_zapisky') // → schéma má 'krestni_zapis' (bez -y)
```

### 13. statistics/page.tsx:37 -- Stejný problém s birovani
```ts
.from('krestni_zapisky') // → měla být 'birovani_zapis' tabulka
```

---

## SECURITY / CONFIG BUGY

### 14. generate-certificate/route.ts:29 -- SUPABASE_SERVICE_ROLE_KEY v API route
Service role key je přístupný z browseru přes `/api/generate-certificate`.
V Edge Functions je to v pořádku (běží na serveru), ale v Next.js API route 
může být key exponován client-side.

### 15. monthly-statistics/index.ts:149-150 -- Missing throw na chybějící email API
```ts
} else {
    console.warn('Není nastaveno žádné e-mailové API');
    // → žádný throw! Funkce vrátí undefined a volající si myslí že email odeslán.
}
```

---

## SILENT/LOGIC BUGS

### 16. Osoby page:27 -- `or()` query chybí `.is()`, když filtruje NULL status
```ts
osobyQuery.or(`clenstvi_status.${filterValue},status.${filterValue}`);
// → NEVYFILTROUJE NULL hodnoty. Osoby s NULL status/clenstvi_status projdou/all.
```

### 17. login/page.tsx:26 -- POST na /api/auth/signin nefunguje v Next.js App Router
Server action `export async function GET(...)` v route.ts odpovídá na GET, ale formulář má `method="post"`. 
Supabase OAuth redirect funguje jen s GET.

### 18. logout page/endpoint neexistuje
Layout.tsx:56 odkazuje `<Link href="/logout">`, ale `/logout` stránka/route není definována.

---

## SHRNETI

Celkem nalezeno **18 bugů**:
- **4 blocking** (build fail / runtime crash)
- **6 schema inconsistency** (při deployi způsobí SQL chyby)  
- **3 page logic bugs** (data se načítají špatně / z neexistujících tabulek)
- **2 security concerns** (service key exposure, silent email failure)
- **3 dead links / skeleton pages**
