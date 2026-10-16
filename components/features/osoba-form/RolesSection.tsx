// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Sekce "Církevní role" formuláře osoby (checkboxy)

import { ROLE_LABELS } from './types';
import type { OsobaFormData } from './types';

interface Props {
  formData: OsobaFormData;
  onChange: (patch: Partial<OsobaFormData>) => void;
}

export default function RolesSection({ formData, onChange }: Props) {
  const toggleRole = (role: string) => {
    const next = formData.role_cirkinni.includes(role)
      ? formData.role_cirkinni.filter((r) => r !== role)
      : [...formData.role_cirkinni, role];
    onChange({ role_cirkinni: next });
  };

  return (
    <fieldset className="border p-4 rounded-lg">
      <legend className="text-sm font-semibold px-2">Církevní role</legend>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <label key={value} htmlFor={`role-${value}`} className="flex items-center space-x-2 cursor-pointer">
            <input
              id={`role-${value}`}
              type="checkbox"
              checked={formData.role_cirkinni.includes(value)}
              onChange={() => toggleRole(value)}
              className="rounded"
            />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
