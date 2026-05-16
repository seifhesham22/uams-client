type Color = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'gray';

const colorClass: Record<Color, string> = {
  blue:   'bg-blue-50 text-blue-700 border-blue-100',
  green:  'bg-green-50 text-green-700 border-green-100',
  red:    'bg-red-50 text-red-700 border-red-100',
  amber:  'bg-amber-50 text-amber-700 border-amber-100',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
  gray:   'bg-gray-50 text-gray-600 border-gray-200',
};

export function Badge({ label, color = 'gray' }: { label: string; color?: Color }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass[color]}`}>
      {label}
    </span>
  );
}

// Handles both clean UI names and the C# typo'd enum names from the backend
const CATEGORY_COLOR_MAP: Record<string, Color> = {
  Electrical:    'amber',
  Electrinical:  'amber',  // C# typo
  Plumbing:      'blue',
  Furniture:     'green',
  Furnuture:     'green',  // C# typo
  Infrastructure:'purple',
};

export const categoryColor = (cat: string): Color => CATEGORY_COLOR_MAP[cat] ?? 'gray';

// Clean display label (hides the C# typos from the UI)
export const categoryLabel = (raw: string): string =>
  ({ Electrinical: 'Electrical', Furnuture: 'Furniture' } as Record<string, string>)[raw] ?? raw;
