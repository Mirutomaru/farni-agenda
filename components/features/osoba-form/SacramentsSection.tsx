// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Sekce "Data svátostí" formuláře osoby (křest + biřmování)

import type { OsobaFormData } from './types';

interface Props {
  formData: OsobaFormData;
  onChange: (patch: Partial<OsobaFormData>) => void;
}

export default function SacramentsSection({ formData, onChange }: Props) {
  return (
    <fieldset className="border p-4 rounded-lg">
      <legend className="text-sm font-semibold px-2">Data svátostí</legend>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
        <div>
          <label htmlFor="krest-datum" className="block text-sm mb-1">Křest - datum</label>
          <input
            id="krest-datum"
            type="date"
            value={formData.krest_datum}
            onChange={(e) => onChange({ krest_datum: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label htmlFor="krest-misto" className="block text-sm mb-1">Křest - místo</label>
          <input
            id="krest-misto"
            type="text"
            value={formData.krest_misto}
            onChange={(e) => onChange({ krest_misto: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label htmlFor="birovani-datum" className="block text-sm mb-1">Biřmování - datum</label>
          <input
            id="birovani-datum"
            type="date"
            value={formData.biřmování_datum}
            onChange={(e) => onChange({ biřmování_datum: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label htmlFor="birovani-misto" className="block text-sm mb-1">Biřmování - místo</label>
          <input
            id="birovani-misto"
            type="text"
            value={formData.biřmování_misto}
            onChange={(e) => onChange({ biřmování_misto: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>
    </fieldset>
  );
}
