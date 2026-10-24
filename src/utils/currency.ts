export const cents = (amount: string) => Number(amount.replace(/\D/g, '') || 0)

export const formatCurrency = (amountInCents: number) =>
  (amountInCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

export const moneyConfig = {
  masked: true,
  prefix: 'R$ ',
  thousands: '.',
  decimal: ',',
  precision: 2,
  allowBlank: false,
  treatZeroAsBlank: false,
  focusOnRight: true,
}
