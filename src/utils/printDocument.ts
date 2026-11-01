import { Share } from 'react-native';

export type PrintableRow = { label: string; value: string };

export async function openPrintableDocument(title: string, workshopName: string, rows: PrintableRow[], period?: string, _logoUrl?: string | null): Promise<void> {
  const lines = [workshopName, title, period, '', ...rows.map(({ label, value }) => `${label}: ${value}`)].filter(Boolean);
  await Share.share({ title, message: lines.join('\n') });
}
