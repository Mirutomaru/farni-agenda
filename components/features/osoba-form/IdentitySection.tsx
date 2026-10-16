// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Sekce "Základní údaje" formuláře osoby (identita)

import type { OsobaFormData } from './types';

interface Props {
  formData: OsobaFormData;
  onChange: (patch: Partial<OsobaFormData>) => void;
}

export default function IdentitySection({ formData, onChange }: Props) {
  return (
    <fieldset className="border p-4 rounded-lg">
      <legend className="text-sm font-semibold px-2">Základní údaje</legend>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        <div>
          <label htmlFor="krestni-jmeno" className="block text-sm mb-1">Křestní jméno *</label>
          <input
            id="krestni-jmeno"
            type="text"
            value={formData.krestni_jmeno}
            onChange={(e) => onChange({ krestni_jmeno: e.target.value })}
            required
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label htmlFor="prijmeni" className="block text-sm mb-1">Příjmení *</label>
          <input
            id="prijmeni"
            type="text"
            value={formData.prijmeni}
            onChange={(e) => onChange({ prijmeni: e.target.value })}
            required
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label htmlFor="datum-narozeni" className="block text-sm mb-1">Datum narození *</label>
          <input
            id="datum-narozeni"
            type="date"
            value={formData.datum_narozeni}
            onChange={(e) => onChange({ datum_narozeni: e.target.value })}
            required
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label htmlFor="pohlavi" className="block text-sm mb-1">Pohlaví</label>
          <select
            id="pohlavi"
            value={formData.pohlavi === true ? 'male' : formData.pohlavi === false ? 'female' : ''}
            onChange={(e) => onChange({ pohlavi: e.target.value === 'male' })}
            className="w-full p-2 border rounded"
          >
            <option value="">Nezvoleno</option>
            <option value="male">Muž</option>
            <option value="female">Žena</option>
          </select>
        </div>
      </div>
    </fieldset>
  );
}
