import Big from 'big.js'

/**
 * 加法运算
 * @method
 * @param { number } number1
 * @param { number } number2
 * @returns { number }
 * @example add(1, 2) = 3
 */
export const add = function (number1: number, number2: number) {
  const a = new Big(Number(number1) || 0)
  const b = new Big(Number(number2) || 0)
  return Number(a.plus(b).valueOf())
}

/**
 * 减法运算
 * @method
 * @param { number } number1
 * @param { number } number2
 * @returns { number }
 * @example subtract(2, 1) = 1
 */
export const subtract = function (number1: number, number2: number) {
  const a = new Big(Number(number1) || 0)
  const b = new Big(Number(number2) || 0)
  return Number(a.minus(b).valueOf())
}

/**
 * 乘法运算
 * @method
 * @param { number } number1
 * @param { number } number2
 * @returns { number }
 * @example multiply(2, 1) = 2
 */
export const multiply = function (number1: number, number2: number) {
  const a = new Big(Number(number1) || 0)
  const b = new Big(Number(number2) || 0)
  return Number(a.times(b).valueOf())
}

/**
 * 除法运算
 * @method
 * @param { number } number 数字
 * @param { number } number2 数字
 * @returns { number }
 * @example divide(10, 2) = 5
 */
export const divide = function (number1: number, number2: number) {
  const a = new Big(Number(number1) || 0)
  const b = new Big(Number(number2) ? number2 : 1)
  return Number(a.div(b).valueOf())
}

/**
 * 保留小数点
 * @method
 * @param { number } number 数字
 * @param { number } precision 保留几位
 * @returns { number }
 * @example round(1.2458787, 3) = 1.245
 */
export const round = (number: number, precision = 2) => {
  return Number(new Big(Number(number) || 0).round(precision).valueOf())
}
