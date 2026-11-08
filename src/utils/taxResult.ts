// Wording from RF-14: refund and tax due are one signed number, never two fields.
export const describeTaxResult = (resultado: number) => {
  if (resultado > 0) return { label: 'Restituição estimada', amount: resultado }
  if (resultado < 0) return { label: 'Imposto a pagar estimado', amount: -resultado }
  return { label: 'Sem imposto a pagar nem a restituir', amount: 0 }
}

export const formatRate = (basisPoints: number) =>
  `${(basisPoints / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
