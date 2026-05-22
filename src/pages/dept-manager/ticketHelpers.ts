export function statusColor(status: string): string {
  const map: Record<string, string> = {
    Open:                 'bg-amber-100 text-amber-700',
    InspectionRequested:  'bg-blue-100 text-blue-700',
    InspectionDone:       'bg-indigo-100 text-indigo-700',
    SentForFix:           'bg-orange-100 text-orange-700',
    AwaitingParts:        'bg-orange-100 text-orange-700',
    Fixed:                'bg-green-100 text-green-700',
    Irreparable:          'bg-red-100 text-red-700',
    SentForReplacement:   'bg-orange-100 text-orange-700',
    Replaced:             'bg-green-100 text-green-700',
    ConfirmedFixed:       'bg-green-100 text-green-700',
    EscalatedExternally:  'bg-purple-100 text-purple-700',
    Closed:               'bg-gray-100 text-gray-500',
  };
  return map[status] ?? 'bg-gray-100 text-gray-500';
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    Open:                'Open',
    InspectionRequested: 'Inspection Requested',
    InspectionDone:      'Inspection Done',
    SentForFix:          'Sent for Fix',
    AwaitingParts:       'Awaiting Parts',
    Fixed:               'Fixed',
    Irreparable:         'Irreparable',
    SentForReplacement:  'Sent for Replacement',
    Replaced:            'Replaced',
    ConfirmedFixed:      'Confirmed Fixed',
    EscalatedExternally: 'Escalated Externally',
    Closed:              'Closed',
  };
  return map[status] ?? status;
}
