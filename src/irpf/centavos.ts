// Aritmética do motor: só inteiros em centavos, sem float de dinheiro.

// n / d arredondado para o inteiro mais próximo, metade para cima (n ≥ 0, d > 0, inteiros).
// Com n + d/2 abaixo de 2^53, Math.floor(n / d) é exato: o erro da divisão é menor que 1/d.
export const dividirArredondando = (n: number, d: number): number => {
  const deslocado = n + Math.floor(d / 2)
  if (!Number.isSafeInteger(deslocado)) {
    throw new RangeError(`Valor fora do intervalo de inteiros seguros: ${n}`)
  }
  return Math.floor(deslocado / d)
}

// a × b / d arredondado para o inteiro mais próximo, metade para cima (a, b e d inteiros ≥ 0)
export const mulDiv = (a: number, b: number, d: number): number => dividirArredondando(a * b, d)

export const somar = <T>(itens: readonly T[], valor: (item: T) => number): number =>
  itens.reduce((total, item) => total + valor(item), 0)

export const exigirInteiroNaoNegativo = (valor: number, campo: string): void => {
  if (Number.isSafeInteger(valor) && valor >= 0) return
  // Inteiros acima de 2^53 perdem centavos na soma: o problema é o tamanho, não o formato.
  const motivo =
    Number.isInteger(valor) && valor > 0
      ? 'está fora do intervalo de inteiros seguros'
      : 'deve ser um inteiro maior ou igual a zero'
  throw new RangeError(`${campo} ${motivo} (recebido: ${valor})`)
}
