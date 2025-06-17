// @ts-check

export const texts = {
  /**
   * @param {number} coreId
   * @param {number} [faultCode=undefined]
   * @param {string} [faultMessage=undefined]
   */
  faultText: (coreId, faultCode = undefined, faultMessage = undefined) => {
    let faultText = `Core ${coreId}`
    if (faultMessage) {
      faultText += ` | ${faultMessage}`
    }
    if (faultCode) {
      faultText += ` | ${faultCode}`
    }
    return faultText
  },
  PC: 'PC',
  addr: 'Addr',
}
