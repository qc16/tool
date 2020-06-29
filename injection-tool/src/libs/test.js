const util = require('@polkadot/util-crypto')
const {
  hexToString, isHex, hexAddPrefix, hexStripPrefix, u8aToHex
} = require('@polkadot/util')
const bs58 = require('bs58')

function hexToDid(hex) {
  const bytes = Buffer.from(hexStripPrefix(hex), 'hex')
  const address = bs58.encode(bytes)
  if (address) {
    return `did:pra:${address}`
  }

  return ''
}

function didToHex(did) {
  if (!did) return ''
  const bytes = bs58.decode(did.substring(8))
  return util.blake2AsHex(bytes, 256)
}

const address = '5GqEtDNPzZi6eqbFfKyebjnadZW3fde4SwEZnduWcrdBBDe8'
const hex = u8aToHex(util.decodeAddress(address))
const add = util.encodeAddress('0xa276c3141194623b166d84305169b7fcc66164043e46a7960b23252b3002c327')
console.log(hex)
console.log(add, 'add')

const did = hexToDid('0x49fe31697cb86e3fd73080d697a9a8851e77033130b22c2a31610a585076565d')
console.log(did, 'superior--')

const hexDid = didToHex('did:pra:M7VfqGrJmnvE76FCsk5jX2Egd8ccxLddKd')
console.log(hexDid, 'hexDid--')
