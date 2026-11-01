export const paymentMethods = [
  { value: 'pix', label: 'Pix' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'bank_transfer', label: 'Transferência bancária' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'on_account', label: 'Prazo / conta a pagar' },
  { value: 'other', label: 'Outro' },
] as const;

export type PaymentMethod = (typeof paymentMethods)[number]['value'];

export function paymentMethodLabel(value: string | null | undefined): string | null {
  return paymentMethods.find((method) => method.value === value)?.label ?? null;
}
